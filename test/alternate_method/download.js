// One-time downloader: pulls each year's full PSPS CSV directly from CMS's
// public file storage (NOT through the throttled paginated data API). These
// are the same CSVs published in CMS's data catalog.
//
// Usage:
//   node test/alternate_method/download.js
//
// Resumable: years already present in raw/ are skipped. Total volume is
// roughly 11 GB across all 15 years; raw/ is gitignored.

const fs = require('node:fs');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');

const RAW_DIR = path.join(__dirname, 'raw');

// Direct CSV download URLs from data.cms.gov's data catalog. Verified by
// querying https://data.cms.gov/data.json and pulling the downloadURL field
// for each year's distribution of the Physician/Supplier Procedure Summary
// dataset. Update if CMS reissues a year's file.
const CSV_URLS = {
    "2010": "https://data.cms.gov/sites/default/files/2020-11/PSPS_2010_SUPPRESS.csv",
    "2011": "https://data.cms.gov/sites/default/files/2020-11/PSPS_2011_SUPPRESS.csv",
    "2012": "https://data.cms.gov/sites/default/files/2020-11/PSPS_2012_SUPPRESS.csv",
    "2013": "https://data.cms.gov/sites/default/files/2020-11/PSPS_2013_SUPPRESS.csv",
    "2014": "https://data.cms.gov/sites/default/files/2020-11/PSPS_2014_SUPPRESS.csv",
    "2015": "https://data.cms.gov/sites/default/files/2020-11/PSPS_2015_SUPPRESS.csv",
    "2016": "https://data.cms.gov/sites/default/files/2020-11/PSPS_2016_SUPPRESS.csv",
    "2017": "https://data.cms.gov/sites/default/files/2020-11/PSPS_2017_SUPPRESS.csv",
    "2018": "https://data.cms.gov/sites/default/files/2020-11/PSPS_2018_SUPPRESS.csv",
    "2019": "https://data.cms.gov/sites/default/files/2020-11/PSPS_2019_SUPPRESS.csv",
    "2020": "https://data.cms.gov/sites/default/files/2021-11/faf427a4-a2bd-49ec-8738-6ae1e5302052/PSPS_2020_SUPPRESS.csv",
    "2021": "https://data.cms.gov/sites/default/files/2024-05/9da08f27-1577-4a32-954a-bf074133a605/Physician_Supplier_Procedure_Summary_2021.csv",
    "2022": "https://data.cms.gov/sites/default/files/2023-08/e25b0428-30e4-43bd-a7b7-52b1dca9a25d/Physician_Supplier_Procedure_Summary_2022_0.csv",
    "2023": "https://data.cms.gov/sites/default/files/2024-08/65dc6580-8726-4de0-b609-5138e8eff22e/Physician_Supplier_Procedure_Summary_2023.csv",
    "2024": "https://data.cms.gov/sites/default/files/2025-07/bb32bbbc-6af2-4a47-9f21-fd12d2e8e9d6/Physician_Supplier_Procedure_Summary_2024.csv",
};

async function downloadOne(year) {
    const url = CSV_URLS[year];
    const out = path.join(RAW_DIR, `${year}.csv`);
    if (fs.existsSync(out)) {
        const stats = fs.statSync(out);
        console.log(`year=${year}: SKIP (${(stats.size / 1024 / 1024).toFixed(0)} MB already on disk)`);
        return;
    }

    console.log(`year=${year}: starting → ${url}`);
    const t0 = Date.now();
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`year=${year} HTTP ${response.status}`);
    }
    await pipeline(response.body, fs.createWriteStream(out));
    const stats = fs.statSync(out);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`year=${year}: DONE — ${(stats.size / 1024 / 1024).toFixed(0)} MB in ${secs}s`);
}

(async () => {
    fs.mkdirSync(RAW_DIR, { recursive: true });
    // Static files, no rate limits — fetch all years concurrently.
    await Promise.all(Object.keys(CSV_URLS).map(downloadOne));
    console.log('\nAll years complete.');
})().catch(err => {
    console.error('\nDownload failed:', err.message);
    process.exit(1);
});
