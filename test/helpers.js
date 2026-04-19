// Shared helpers for network-backed tests. Runs the same pipeline the browser
// runs in script.js's submit handler, and produces the same row shape as the
// CSV download.

const {
    yearDatasetMap,
    fetchPaginatedData,
    collapseByAdvancedPracticeProvider,
    addAdvancedPracticePct,
    getClinician_type,
    buildTaggedData,
} = require('../script.js');

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

async function runQuery(codeList) {
    const selectedYears = Object.keys(yearDatasetMap);
    const verbose = typeof process !== 'undefined' && process.env && process.env.VERBOSE_FETCH === '1';

    if (verbose) console.log(`[query] starting [${codeList.join(', ')}] across ${selectedYears.length} years`);

    let completed = 0;
    const resultsPerYear = await Promise.all(
        selectedYears.map(async year => {
            const result = await fetchPaginatedData(yearDatasetMap[year], codeList, year);
            completed++;
            if (verbose) console.log(`[query] [${codeList.join(',')}] year ${year} done (${completed}/${selectedYears.length})`);
            return result;
        })
    );
    const combinedData = resultsPerYear.flat();
    const collapsedData = collapseByAdvancedPracticeProvider(combinedData);
    const finalData = sortFinalData(addAdvancedPracticePct(collapsedData));
    return buildTaggedData(finalData, codeList);
}

module.exports = { runQuery, clinicianTypeOrder };
