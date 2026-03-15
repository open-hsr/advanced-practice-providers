// Snapshot test for the query pipeline.
// Uses Node's built-in test runner and fetch — zero dependencies.
//
// First run:  saves results to test/fixtures/snapshot_31237.json
// Later runs: compares current results against the saved snapshot
//
// Usage: node --test test/snapshot.test.js

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    yearDatasetMap,
    fetchPaginatedData,
    collapseByAdvancedPracticeProvider,
    addAdvancedPracticePct,
    getClinician_type,
} = require('../script.js');

const FIXTURE_DIR = path.join(__dirname, 'fixtures');
const FIXTURE_PATH = path.join(FIXTURE_DIR, 'snapshot_31237.json');

// Same sort used in the browser click handler
const clinicianTypeOrder = [
    "Advanced Practice Providers",
    "Physicians",
    "Physician Assistants",
    "Nurse Practitioners",
    "Certified Registered Nurse Anesthetists",
    "Certified Clinical Nurse Specialists",
    "Certified Nurse Midwives"
];

function sortFinalData(data) {
    return data.sort((a, b) => {
        const labelA = getClinician_type(a);
        const labelB = getClinician_type(b);
        return clinicianTypeOrder.indexOf(labelA) - clinicianTypeOrder.indexOf(labelB)
            || Number(a.year) - Number(b.year);
    });
}

// Build the final CSV-shaped output (same as downloadCSV produces)
function buildOutput(finalData, codeList) {
    const codesValue = codeList.join(";");
    return finalData.map(record => ({
        year: record['year'],
        procedure_codes: codesValue,
        clinician_type: getClinician_type(record),
        number_of_procedures_clinician_type: record['number_of_procedures'],
        proportion_of_procedures_clinician_type: record['proportion_of_procedures'],
        number_of_procedures_all_clinicians: record['number_of_procedures_all_clinicians'],
    }));
}

async function runQuery(codeList) {
    const selectedYears = Object.keys(yearDatasetMap);
    const resultsPerYear = await Promise.all(
        selectedYears.map(year => {
            const datasetId = yearDatasetMap[year];
            return fetchPaginatedData(datasetId, codeList, year);
        })
    );
    const combinedData = resultsPerYear.flat();
    const collapsedData = collapseByAdvancedPracticeProvider(combinedData);
    const finalData = sortFinalData(addAdvancedPracticePct(collapsedData));
    return buildOutput(finalData, codeList);
}

function assertOutputMatches(output, snapshot) {
    assert.equal(output.length, snapshot.length, `Row count mismatch: got ${output.length}, expected ${snapshot.length}`);

    for (let i = 0; i < output.length; i++) {
        const got = output[i];
        const want = snapshot[i];
        assert.equal(got.year, want.year, `Row ${i}: year mismatch`);
        assert.equal(got.clinician_type, want.clinician_type, `Row ${i}: clinician_type mismatch`);
        assert.equal(
            got.number_of_procedures_clinician_type,
            want.number_of_procedures_clinician_type,
            `Row ${i} (${got.year} ${got.clinician_type}): number_of_procedures mismatch`
        );
        assert.ok(
            Math.abs(got.proportion_of_procedures_clinician_type - want.proportion_of_procedures_clinician_type) < 1e-10,
            `Row ${i} (${got.year} ${got.clinician_type}): proportion mismatch (got ${got.proportion_of_procedures_clinician_type}, want ${want.proportion_of_procedures_clinician_type})`
        );
    }
}

describe('query pipeline snapshot', () => {
    it('should produce consistent results for HCPCS code 31237', async () => {
        const codeList = ['31237'];
        const output = await runQuery(codeList);

        if (!fs.existsSync(FIXTURE_PATH)) {
            // First run — save the snapshot
            fs.mkdirSync(FIXTURE_DIR, { recursive: true });
            fs.writeFileSync(FIXTURE_PATH, JSON.stringify(output, null, 2));
            console.log(`Snapshot saved to ${FIXTURE_PATH} (${output.length} rows)`);
            return;
        }

        // Compare against saved snapshot
        const snapshot = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf-8'));
        assertOutputMatches(output, snapshot);
        console.log(`Snapshot matched (${output.length} rows)`);
    });
});
