// Internal-consistency test: a multi-code query must equal the
// per-(year, clinician_type) sum of independent single-code queries.
//
// This catches a wide class of pipeline bugs:
//   - off-by-one or duplicated rows in pagination
//   - IN-filter URL-encoding bugs that drop or alias codes
//   - dedup/rekeying mistakes in the collapse step
//   - any operation that's not order-independent in the aggregation
//
// Hits the live CMS API for 4 queries × 15 years per case. Slow
// (minutes per case, longer for the high-volume case); not for CI.
// Run before publication or after pipeline changes.
//
// Usage: node --test --test-timeout=600000 test/consistency.test.js

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { runQuery } = require('./helpers');

// Each case picks 3 independent HCPCS codes. Independence matters: if a bug
// accidentally aliased two codes together it would likely leak across
// specialties, making the sum-of-parts comparison fail. Swap codes freely;
// the invariant doesn't depend on the choice as long as each code returns
// some data in some year.
// By default only the moderate-volume case runs — it gives meaningful
// coverage without burning through the CMS rate-limit budget on this IP.
// Set RUN_ALL_CONSISTENCY_CASES=1 to also run the smoke (ENT) and stress
// (high-volume) cases. The high-volume case in particular is best run from
// a fresh-IP environment (e.g. Modal) where the rate-limit budget is clean.
const RUN_ALL = process.env.RUN_ALL_CONSISTENCY_CASES === '1';

const TEST_CASES = [
    {
        name: 'ENT procedures (low–moderate volume)',
        codes: ['31237', '31238', '31256'],
        runByDefault: false, // smoke test; opt in with RUN_ALL_CONSISTENCY_CASES=1
    },
    {
        name: 'Multi-specialty mix (moderate volume)',
        // Derm + interventional pain + ortho/rheum/PCP — all common APP-eligible
        // procedures across very different fields.
        codes: ['17110', '64483', '20610'],
        runByDefault: true,
    },
    {
        name: 'High-volume mix (slow — exercises pagination at scale)',
        // 99213 is the single most-billed procedure code in Medicare; this
        // case stresses the multi-page fetch paths, cross-year parallelism,
        // and the float-precision behavior of aggregating millions of rows.
        // The module-level concurrency cap in script.js keeps load below CMS's
        // throttling threshold, but a previously-throttled IP still needs to
        // cool down. Recommended: run from a fresh-IP environment.
        codes: ['99213', '11042', '17000'],
        runByDefault: false,
    },
];

// Sum the per-(year, clinician_type) counts and totals across multiple outputs.
// Returns a Map keyed "<year>|<clinician_type>" → { count, total }.
function sumByGroup(outputs) {
    const sums = new Map();
    for (const output of outputs) {
        for (const row of output) {
            const key = `${row.year}|${row.clinician_type}`;
            const prev = sums.get(key) || { count: 0, total: 0 };
            prev.count += row.number_of_procedures_clinician_type;
            prev.total += row.number_of_procedures_all_clinicians;
            sums.set(key, prev);
        }
    }
    return sums;
}

function indexByGroup(output) {
    const map = new Map();
    for (const row of output) {
        map.set(`${row.year}|${row.clinician_type}`, row);
    }
    return map;
}

// Counts can be non-integer in the CMS data (some procedures report fractional
// service units). Summing in different orders produces float-epsilon differences,
// so compare with a relative tolerance that's tight enough to catch a missing
// row but loose enough to ignore reassociation noise.
function assertCloseEnough(got, want, message) {
    const tol = Math.max(1e-6, Math.abs(want) * 1e-10);
    assert.ok(
        Math.abs(got - want) <= tol,
        `${message} (got ${got}, sum-of-parts ${want}, diff ${got - want})`
    );
}

async function assertSumOfPartsHolds(codes) {
    // Run the 4 queries sequentially to keep request volume close to typical
    // user behavior (one query at a time; 15 year-fetches in parallel within
    // each). Firing all 4 in parallel multiplies in-flight requests by 4× and
    // trips CMS rate limits on high-volume codes.
    const combined = await runQuery(codes);
    const individuals = [];
    for (const code of codes) {
        individuals.push(await runQuery([code]));
    }

    const summed = sumByGroup(individuals);
    const combinedByGroup = indexByGroup(combined);

    // Same set of (year, clinician_type) keys
    assert.equal(
        combinedByGroup.size,
        summed.size,
        `group count mismatch: combined=${combinedByGroup.size}, summed=${summed.size}`
    );
    for (const key of summed.keys()) {
        assert.ok(combinedByGroup.has(key), `combined output missing group: ${key}`);
    }

    // Per-group invariants
    for (const [key, want] of summed) {
        const got = combinedByGroup.get(key);

        assertCloseEnough(
            got.number_of_procedures_clinician_type,
            want.count,
            `${key}: number_of_procedures`
        );

        assertCloseEnough(
            got.number_of_procedures_all_clinicians,
            want.total,
            `${key}: number_of_procedures_all_clinicians`
        );

        // Proportion is recomputed from the summed numerator/denominator.
        const expectedProp = want.total > 0 ? want.count / want.total : 0;
        assert.ok(
            Math.abs(got.proportion_of_procedures_clinician_type - expectedProp) < 1e-10,
            `${key}: proportion (got ${got.proportion_of_procedures_clinician_type}, sum-of-parts ${expectedProp})`
        );
    }

    return summed.size;
}

// Brief pause between test cases. Within a case, queries are already
// serialized; this is just a small breather to avoid back-to-back load on
// the CMS API. Production retry/backoff in fetchPaginatedData handles any
// residual 429s.
const INTER_CASE_PAUSE_MS = 5_000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

describe('multi-code query consistency (sum-of-parts)', () => {
    TEST_CASES.forEach(({ name, codes, runByDefault }, idx) => {
        const t = (runByDefault || RUN_ALL) ? it : it.skip;
        t(`${name}: [${codes.join(', ')}]`, async () => {
            if (idx > 0) await sleep(INTER_CASE_PAUSE_MS);
            const groupCount = await assertSumOfPartsHolds(codes);
            console.log(`Verified ${groupCount} (year, clinician_type) groups across ${codes.length} codes`);
        });
    });
});
