// Independent reference implementation of the data pipeline.
//
// Streams the per-year CSV files written by download.js (each ~750 MB),
// filters to the requested HCPCS codes, and produces output in the same
// row shape as the browser app's CSV download. Independent in structure
// from script.js so that comparing the two outputs catches real bugs
// rather than reproducing them on both sides.
//
// What's deliberately copied (from CMS docs, not pipeline code):
//   - the set of valid provider specialty codes
//   - the APP specialty → label mapping
//   - the year-era column-name rule and the "*" redaction rule
// What's reimplemented:
//   - filtering, grouping, summing, totals, proportion calculation, output shape

const fs = require('node:fs');
const readline = require('node:readline');

const APP_SPEC_LABELS = {
    "97": "Physician Assistants",
    "50": "Nurse Practitioners",
    "43": "Certified Registered Nurse Anesthetists",
    "89": "Certified Clinical Nurse Specialists",
    "42": "Certified Nurse Midwives",
};
const APP_CODE_SET = new Set(Object.keys(APP_SPEC_LABELS));

const VALID_SPEC_CODES = new Set([
    "01","02","03","04","05","06","07","08","09","10",
    "11","12","13","14","16","17","18","19","20",
    "21","22","23","24","25","26","27","28","29","30",
    "33","34","36","37","38","39","40","42","43","44",
    "46","50","66","72","76","77","78","79","81","82",
    "83","84","85","86","89","90","91","92","93","94",
    "97","98","99","C0","C3","C6","C7","C8","C9",
    "D3","D4","D7","D8","F6"
]);

const SERIES_ORDER = [
    'Advanced Practice Providers',
    'Physicians',
    'Physician Assistants',
    'Nurse Practitioners',
    'Certified Registered Nurse Anesthetists',
    'Certified Clinical Nurse Specialists',
    'Certified Nurse Midwives',
];

// Build {year: bucketsObj} by streaming each year's CSV. Bucket keys are
// the labels from SERIES_ORDER.
async function aggregateOneYear(csvPath, year, codeSet) {
    const stream = fs.createReadStream(csvPath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    const buckets = Object.fromEntries(SERIES_ORDER.map(s => [s, 0]));
    let headerCols = null;
    let hcpcsIdx, specIdx, countIdx;

    for await (const line of rl) {
        if (headerCols === null) {
            headerCols = line.split(',');
            hcpcsIdx = headerCols.indexOf('HCPCS_CD');
            specIdx = headerCols.indexOf('PROVIDER_SPEC_CD');
            // Year-era rule: 2010–2019 use SUBMITTED_SERVICE_CNT, 2020+ use the PSPS_-prefixed name.
            countIdx = headerCols.indexOf(Number(year) <= 2019 ? 'SUBMITTED_SERVICE_CNT' : 'PSPS_SUBMITTED_SERVICE_CNT');
            if (hcpcsIdx < 0 || specIdx < 0 || countIdx < 0) {
                throw new Error(`year=${year}: missing expected columns. Headers were: ${headerCols.join(',')}`);
            }
            continue;
        }

        // Naive split is safe here: the PSPS schema has no quoted/embedded-comma fields.
        const fields = line.split(',');
        const hcpcs = fields[hcpcsIdx];
        if (!codeSet.has(hcpcs)) continue;
        const spec = fields[specIdx];
        if (!VALID_SPEC_CODES.has(spec)) continue;

        const rawCount = fields[countIdx];
        // Empty or "*" (redacted, 2021+) → contribute 0
        let n = 0;
        if (rawCount && rawCount !== '*') {
            const parsed = Number(rawCount);
            if (Number.isFinite(parsed)) n = parsed;
        }

        if (APP_CODE_SET.has(spec)) {
            buckets['Advanced Practice Providers'] += n;
            buckets[APP_SPEC_LABELS[spec]] += n;
        } else {
            buckets['Physicians'] += n;
        }
    }

    return buckets;
}

// csvPathByYear: { "2010": "/path/2010.csv", ... }
// hcpcsCodes:    list of HCPCS codes to include
async function munge(csvPathByYear, hcpcsCodes) {
    const codeSet = new Set(hcpcsCodes);
    const codesValue = hcpcsCodes.join(';');

    // Aggregate every year (parallel; each is ~750MB stream-read but only one
    // year is held in memory at any moment because we only keep the small
    // bucket counts).
    const years = Object.keys(csvPathByYear).sort();
    const yearTotals = {};
    await Promise.all(years.map(async year => {
        console.log(`  munging year=${year}...`);
        yearTotals[year] = await aggregateOneYear(csvPathByYear[year], year, codeSet);
        console.log(`  munging year=${year} done`);
    }));

    // Emit rows: outer = series order, inner = year ascending.
    const rows = [];
    for (const series of SERIES_ORDER) {
        for (const year of years) {
            const buckets = yearTotals[year];
            const totalAll = buckets['Advanced Practice Providers'] + buckets['Physicians'];
            const count = buckets[series];
            rows.push({
                year,
                procedure_codes: codesValue,
                clinician_type: series,
                number_of_procedures_clinician_type: count,
                proportion_of_procedures_clinician_type: totalAll > 0 ? count / totalAll : 0,
                number_of_procedures_all_clinicians: totalAll,
            });
        }
    }
    return rows;
}

module.exports = { munge };
