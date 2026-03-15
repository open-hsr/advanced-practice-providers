const yearDatasetMap = {
    "2010": "f4344bd9-ac34-43f0-b144-0186f6fa099f",
    "2011": "1e9f7a5a-5550-4525-bbbf-ef66115184b8",
    "2012": "b597d146-81bc-43f7-80b1-c2e85168170d",
    "2013": "53027e7f-1b1d-4628-a286-03b0bc0b5f2f",
    "2014": "3d28f6b0-e9df-48ea-b2eb-5cac10eaaf45",
    "2015": "f8392bbd-981b-4ea6-b9f9-0891825105d7",
    "2016": "b8a1bee7-62b2-44eb-8585-0c257a3d8c3f",
    "2017": "3060244e-269e-4442-a983-8c190adfe7f1",
    "2018": "6056deb7-17a7-49bc-a5b3-c799b4f91568",
    "2019": "0ce67ad8-524b-4d4f-8ac8-55f4a68f0711",
    "2020": "5eb3eebe-20cb-405c-864f-444873134f24",
    "2021": "72200613-6706-4ad2-8219-e200cc4391cc",
    "2022": "e4786716-10e9-40f2-b936-7444177474d5",
    "2023": "b72adfb6-22cf-4241-9c64-050ad9061e03",
    "2024": "647c8fa8-5dd6-460d-a2ec-18faf15b3fb2"
};

const yearColumnMap = {
    "2010": ["HCPCS_CD", "PROVIDER_SPEC_CD", "SUBMITTED_SERVICE_CNT"],
    "2011": ["HCPCS_CD", "PROVIDER_SPEC_CD", "SUBMITTED_SERVICE_CNT"],
    "2012": ["HCPCS_CD", "PROVIDER_SPEC_CD", "SUBMITTED_SERVICE_CNT"],
    "2013": ["HCPCS_CD", "PROVIDER_SPEC_CD", "SUBMITTED_SERVICE_CNT"],
    "2014": ["HCPCS_CD", "PROVIDER_SPEC_CD", "SUBMITTED_SERVICE_CNT"],
    "2015": ["HCPCS_CD", "PROVIDER_SPEC_CD", "SUBMITTED_SERVICE_CNT"],
    "2016": ["HCPCS_CD", "PROVIDER_SPEC_CD", "SUBMITTED_SERVICE_CNT"],
    "2017": ["HCPCS_CD", "PROVIDER_SPEC_CD", "SUBMITTED_SERVICE_CNT"],
    "2018": ["HCPCS_CD", "PROVIDER_SPEC_CD", "SUBMITTED_SERVICE_CNT"],
    "2019": ["HCPCS_CD", "PROVIDER_SPEC_CD", "SUBMITTED_SERVICE_CNT"],
    "2020": ["HCPCS_CD", "PROVIDER_SPEC_CD", "PSPS_SUBMITTED_SERVICE_CNT"],
    "2021": ["HCPCS_CD", "PROVIDER_SPEC_CD", "PSPS_SUBMITTED_SERVICE_CNT"],
    "2022": ["HCPCS_CD", "PROVIDER_SPEC_CD", "PSPS_SUBMITTED_SERVICE_CNT"],
    "2023": ["HCPCS_CD", "PROVIDER_SPEC_CD", "PSPS_SUBMITTED_SERVICE_CNT"],
    "2024": ["HCPCS_CD", "PROVIDER_SPEC_CD", "PSPS_SUBMITTED_SERVICE_CNT"]
};

const advancedPracticeProviderCodes = new Set(["42","43","50","89","97"]);

const validProviderSpecCodes = new Set([
    "01","02","03","04","05","06","07","08","09","10",
    "11","12","13","14","16","17","18","19","20",
    "21","22","23","24","25","26","27","28","29","30",
    "33","34","36","37","38","39","40","42","43","44",
    "46","50","66","72","76","77","78","79","81","82",
    "83","84","85","86","89","90","91","92","93","94",
    "97","98","99","C0","C3","C6","C7","C8","C9",
    "D3","D4","D7","D8","F6"
]);

// --- DOM helpers (browser only) ---
if (typeof document !== 'undefined') {

function setStatus(msg) {
    const el = document.getElementById("statusMsg");
    el.textContent = msg;
    el.classList.toggle("visible", !!msg);
}

function setError(msg) {
    const el = document.getElementById("errorMsg");
    const textEl = document.getElementById("errorText");
    textEl.textContent = msg;
    el.classList.toggle("visible", !!msg);
}

function setWarning(msg) {
    const el = document.getElementById("warnMsg");
    const textEl = document.getElementById("warnText");
    textEl.textContent = msg;
    el.classList.toggle("visible", !!msg);
}

function showResultsSummary(codeList, combinedData) {
    const heading = document.getElementById("summaryHeading");
    const list = document.getElementById("summaryList");
    list.innerHTML = "";

    if (codeList.length <= 1) {
        heading.style.display = "none";
        return;
    }

    const countsByCode = new Map(codeList.map(c => [c, 0]));
    combinedData.forEach(record => {
        const code = record['hcpcs_cd'];
        if (countsByCode.has(code)) {
            countsByCode.set(code, countsByCode.get(code) + 1);
        }
    });

    codeList.forEach(code => {
        const li = document.createElement("li");
        const count = countsByCode.get(code);
        li.textContent = count > 0
            ? `${code}: ${count.toLocaleString()} records`
            : `${code}: no records found`;
        if (count === 0) {
            li.style.fontWeight = "bold";
        }
        list.appendChild(li);
    });

    heading.style.display = "block";
}

function clearResults() {
    document.getElementById("summaryHeading").style.display = "none";
    document.getElementById("summaryList").innerHTML = "";
    setWarning("");
}

function setButtonEnabled(enabled) {
    const btn = document.getElementById("downloadBtn");
    btn.disabled = !enabled;
    btn.textContent = enabled ? "Run Query and Download Results" : "Running...";
}

function showProgress(completed, total) {
    const container = document.getElementById("progressContainer");
    const bar = document.getElementById("progressBar");
    const text = document.getElementById("progressText");
    container.style.display = "block";
    const pct = Math.round((completed / total) * 100);
    bar.style.width = pct + "%";
    text.textContent = `Fetched ${completed} of ${total} years`;
}

function hideProgress() {
    document.getElementById("progressContainer").style.display = "none";
}

document.getElementById("queryForm").addEventListener("submit", function (e) {
    e.preventDefault();
    const rawInput = document.getElementById("procedureCode").value.trim();
    const codeList = rawInput.split(";").map(c => c.trim()).filter(Boolean);
    const selectedYears = Object.keys(yearDatasetMap);

    if (codeList.length === 0 || codeList.length > 25) {
        setError("Please enter between 1 and 25 procedure codes, separated by semicolons.");
        return;
    }

    // Clear previous feedback and disable button
    setError("");
    setWarning("");
    clearResults();
    setButtonEnabled(false);
    setStatus("");

    let completed = 0;
    const total = selectedYears.length;
    showProgress(0, total);

    const allPromises = selectedYears.map(year => {
        const datasetId = yearDatasetMap[year];
        return fetchPaginatedData(datasetId, codeList, year).then(result => {
            completed++;
            showProgress(completed, total);
            return result;
        });
    });

    Promise.all(allPromises)
        .then(resultsPerYear => {
            hideProgress();
            const combinedData = resultsPerYear.flat();
            const collapsedData = collapseByAdvancedPracticeProvider(combinedData);
            const finalData = addAdvancedPracticePct(collapsedData).sort((a, b) => {
                const clinicianTypeOrder = [
                    "Advanced Practice Providers",
                    "Physicians",
                    "Physician Assistants",
                    "Nurse Practitioners",
                    "Certified Registered Nurse Anesthetists",
                    "Certified Clinical Nurse Specialists",
                    "Certified Nurse Midwives"
                ];
                const labelA = getClinician_type(a);
                const labelB = getClinician_type(b);
                return clinicianTypeOrder.indexOf(labelA) - clinicianTypeOrder.indexOf(labelB) || Number(a.year) - Number(b.year);
            });

            // Check for codes that returned no data
            const returnedCodes = new Set(combinedData.map(r => r['hcpcs_cd']));
            const missingCodes = codeList.filter(c => !returnedCodes.has(c));
            if (missingCodes.length > 0) {
                setWarning(
                    `The following code${missingCodes.length > 1 ? 's' : ''} returned no records across all years: ${missingCodes.join(", ")}. ` +
                    "This may indicate a typo."
                );
            }
            showResultsSummary(codeList, combinedData);

            setStatus(`Done — downloaded ${finalData.length.toLocaleString()} rows.`);
            downloadCSV(finalData, codeList);
            setButtonEnabled(true);
            setTimeout(() => setStatus(""), 4000);
        })
        .catch(error => {
            console.error("Error fetching data:", error);
            hideProgress();
            setStatus("");
            setButtonEnabled(true);
            setError("There was an error fetching the data: " + error.message);
        });
});

} // end if (typeof document !== 'undefined')

// Returns a Promise that resolves with all records for a given year
function fetchPaginatedData(datasetId, codeList, year) {
    const url = `https://data.cms.gov/data-api/v1/dataset/${datasetId}/data`;
    const size = 5000; // CMS API max page size

    function fetchPage(offset) {
        // Build query string manually to prevent URLSearchParams from
        // percent-encoding brackets (needed for IN filter) and commas (needed for column list).
        let queryParts = [];

        if (codeList.length === 1) {
            // Single code: simple equality filter
            queryParts.push("filter[condition][path]=HCPCS_CD");
            queryParts.push("filter[condition][operator]==");
            queryParts.push(`filter[condition][value]=${encodeURIComponent(codeList[0])}`);
        } else {
            // Multiple codes: IN filter — CMS API requires empty brackets: value[]=X&value[]=Y
            queryParts.push("filter[condition][path]=HCPCS_CD");
            queryParts.push("filter[condition][operator]=IN");
            codeList.forEach(code => {
                queryParts.push(`filter[condition][value][]=${encodeURIComponent(code)}`);
            });
        }

        queryParts.push(`offset=${offset}`);
        queryParts.push(`size=${size}`);
        // Keep commas literal — the API requires a raw comma-separated column list
        queryParts.push(`column=${yearColumnMap[year].join(",")}`);

        return fetch(`${url}?${queryParts.join("&")}`)
            .then(response => {
                if (!response.ok) {
                    return response.text().then(text => {
                        throw new Error(`API error ${response.status} for year ${year}: ${text}`);
                    });
                }
                return response.json();
            })
            .then(data => {
                if (!Array.isArray(data) || data.length === 0) return [];

                const filteredData = filterColumns(data, year);

                if (data.length >= size) {
                    return fetchPage(offset + size).then(nextData => filteredData.concat(nextData));
                } else {
                    return filteredData;
                }
            });
    }

    return fetchPage(0);
}

// Filter to only the relevant columns for a given year, in the correct output order
function filterColumns(data, year) {
    const yearNum = parseInt(year, 10);

    return data.map(record => {
        let filteredRecord = {};
        filteredRecord['year'] = year;
        filteredRecord['hcpcs_cd'] = record['HCPCS_CD'] ?? '';
        filteredRecord['provider_spec_cd'] = record['PROVIDER_SPEC_CD'] ?? '';

        let serviceCount;
        if (yearNum <= 2019) {
            // Numeric column, use directly
            serviceCount = record['SUBMITTED_SERVICE_CNT'] ?? '';
        } else if (yearNum === 2020) {
            // Renamed but still numeric, use directly
            serviceCount = record['PSPS_SUBMITTED_SERVICE_CNT'] ?? '';
        } else {
            // 2021–2024: string column — redacted "*" values become missing, otherwise parse as number
            const raw = record['PSPS_SUBMITTED_SERVICE_CNT'];
            if (raw === undefined || raw === null || raw === '*') {
                serviceCount = '';
            } else {
                const parsed = parseFloat(raw);
                serviceCount = isNaN(parsed) ? '' : parsed;
            }
        }

        filteredRecord['number_of_procedures'] = serviceCount;
        filteredRecord['advanced_practice_provider'] = advancedPracticeProviderCodes.has(filteredRecord['provider_spec_cd']) ? 1 : 0;
        return filteredRecord;
    }).filter(record => validProviderSpecCodes.has(record['provider_spec_cd']));
}

// Add proportion_of_procedures: count / (APP=0 + APP=1 aggregate total) per year
function addAdvancedPracticePct(data) {
    // Denominator: sum of APP=0 and APP=1 aggregate rows only (avoids double-counting specialty rows)
    const totalMap = new Map();
    data.forEach(record => {
        if (record['row_type'] === 'aggregate') {
            const count = Number(record['number_of_procedures']) || 0;
            totalMap.set(record['year'], (totalMap.get(record['year']) || 0) + count);
        }
    });

    return data.map(record => {
        const total = totalMap.get(record['year']) || 0;
        const count = Number(record['number_of_procedures']) || 0;
        const pct = total > 0 ? (count / total) : 0;
        return { ...record, proportion_of_procedures: pct, number_of_procedures_all_clinicians: total };
    });
}

// Specialty code to label mapping (in desired output order)
const appSpecialtyOrder = [
    { code: "97", label: "Physician Assistants" },
    { code: "50", label: "Nurse Practitioners" },
    { code: "43", label: "Certified Registered Nurse Anesthetists" },
    { code: "89", label: "Certified Clinical Nurse Specialists" },
    { code: "42", label: "Certified Nurse Midwives" }
];

// Collapse submitted_service_cnt by year and advanced_practice_provider (sum across all queried procedure codes)
// Also produces per-specialty rows for each APP specialty code
function collapseByAdvancedPracticeProvider(data) {
    // Aggregate rows: keyed by year|app_flag (0 or 1)
    const aggMap = new Map();
    // Specialty rows: keyed by year|spec_cd
    const specMap = new Map();

    data.forEach(record => {
        const count = record['number_of_procedures'] === '' ? 0 : Number(record['number_of_procedures']);

        // Aggregate (APP=0 / APP=1)
        const aggKey = `${record['year']}|${record['advanced_practice_provider']}`;
        if (aggMap.has(aggKey)) {
            aggMap.get(aggKey).number_of_procedures += count;
        } else {
            aggMap.set(aggKey, {
                year: record['year'],
                row_type: 'aggregate',
                advanced_practice_provider: record['advanced_practice_provider'],
                provider_spec_cd: null,
                number_of_procedures: count
            });
        }

        // Per-specialty (APP codes only)
        if (advancedPracticeProviderCodes.has(record['provider_spec_cd'])) {
            const specKey = `${record['year']}|${record['provider_spec_cd']}`;
            if (specMap.has(specKey)) {
                specMap.get(specKey).number_of_procedures += count;
            } else {
                specMap.set(specKey, {
                    year: record['year'],
                    row_type: 'specialty',
                    advanced_practice_provider: 1,
                    provider_spec_cd: record['provider_spec_cd'],
                    number_of_procedures: count
                });
            }
        }
    });

    // Ensure every year has APP=1 and APP=0 aggregate rows
    Object.keys(yearDatasetMap).forEach(year => {
        [1, 0].forEach(appFlag => {
            const key = `${year}|${appFlag}`;
            if (!aggMap.has(key)) {
                aggMap.set(key, { year, row_type: 'aggregate', advanced_practice_provider: appFlag, provider_spec_cd: null, number_of_procedures: 0 });
            }
        });
        // Ensure every year has a row for each APP specialty
        appSpecialtyOrder.forEach(({ code }) => {
            const key = `${year}|${code}`;
            if (!specMap.has(key)) {
                specMap.set(key, { year, row_type: 'specialty', advanced_practice_provider: 1, provider_spec_cd: code, number_of_procedures: 0 });
            }
        });
    });

    return [...Array.from(aggMap.values()), ...Array.from(specMap.values())];
}

// Map a collapsed record to its clinician_type label
function getClinician_type(record) {
    if (record['row_type'] === 'specialty') {
        const match = appSpecialtyOrder.find(s => s.code === record['provider_spec_cd']);
        return match ? match.label : 'Unknown';
    }
    return record['advanced_practice_provider'] === 1 ? "Advanced Practice Providers" : "Physicians";
}

// Convert JSON to CSV and trigger a single download
function downloadCSV(data, codeList) {
    const codesValue = codeList.join(";");
    const taggedData = data.map(record => ({
        year: record['year'],
        procedure_codes: codesValue,
        clinician_type: getClinician_type(record),
        number_of_procedures_clinician_type: record['number_of_procedures'],
        proportion_of_procedures_clinician_type: record['proportion_of_procedures'],
        number_of_procedures_all_clinicians: record['number_of_procedures_all_clinicians'],
    }));
    const csv = convertToCSV(taggedData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);

    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const year = now.getFullYear();
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');
    link.download = `query_${month}_${day}_${year}_${hour}_${minute}_${second}.csv`;

    link.click();
}

// Convert JSON to CSV
function convertToCSV(data) {
    if (!data || data.length === 0) return '';
    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];

    data.forEach(row => {
        const values = headers.map(header => {
            let value = row[header] ?? '';
            value = String(value);
            if (value.includes('"') || value.includes(',')) {
                value = `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        });
        csvRows.push(values.join(','));
    });

    return csvRows.join('\n');
}

// Export for Node.js tests (no-op in browser)
if (typeof module !== 'undefined') {
    module.exports = {
        yearDatasetMap,
        yearColumnMap,
        advancedPracticeProviderCodes,
        validProviderSpecCodes,
        appSpecialtyOrder,
        fetchPaginatedData,
        filterColumns,
        collapseByAdvancedPracticeProvider,
        addAdvancedPracticePct,
        getClinician_type,
        convertToCSV,
    };
}