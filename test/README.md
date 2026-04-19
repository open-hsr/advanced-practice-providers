# Tests

Zero-dependency tests using Node's built-in test runner. The app itself has no build system; testing follows suit.

## Files

- **`unit.test.js`** — pure unit tests, no network. Covers the data-pipeline functions exported from `script.js`: `filterColumns`, `collapseByAdvancedPracticeProvider`, `addAdvancedPracticePct`, and `buildQueryURL`. Catches the year-era column-name rules (CMS renamed `SUBMITTED_SERVICE_CNT` → `PSPS_SUBMITTED_SERVICE_CNT` in 2020), the `"*"` redaction handling (2021+), and URL-encoding edge cases for the IN-filter.

- **`snapshot.test.js`** — runs the full pipeline end-to-end against the live CMS API for HCPCS code `31237` and compares to a saved fixture (`fixtures/snapshot_31237.json`). Catches regressions in any pipeline change. Delete the fixture file to regenerate.

- **`consistency.test.js`** — sum-of-parts invariant: a multi-code query must produce the same per-(year, clinician_type) numbers as the sum of independent single-code queries. Catches pagination off-by-ones, IN-filter encoding bugs, and any aggregation that isn't order-independent. Hits the CMS API. By default only the moderate-volume case runs; set `RUN_ALL_CONSISTENCY_CASES=1` to also run the ENT smoke and high-volume stress cases. Set `VERBOSE_FETCH=1` to stream per-page-fetch diagnostic events.

- **`csv_reference/`** — independently validates the production pipeline against a from-scratch reference computed from the full PSPS CSVs (downloaded directly from CMS, not via the data API). Two completely separate code paths must agree. See [`csv_reference/README.md`](csv_reference/README.md).

- **`helpers.js`** — shared `runQuery` that mirrors the browser-side pipeline and returns rows in the same shape as the CSV download.

## Running

```bash
node --test test/unit.test.js                                # fast, no network
node --test test/snapshot.test.js                            # ~30s, hits CMS
node --test --test-timeout=180000 test/consistency.test.js   # ~1min, hits CMS
node --test test/csv_reference/verify.test.js                # <1s, requires fixture
```

`unit.test.js` is suitable for CI; the others hit the network and aren't.
