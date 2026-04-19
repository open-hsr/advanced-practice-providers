// Generates the alternate-method comparison fixture by running the
// independent CSV-streaming munge over the raw files written by download.js.
//
// Usage:
//   node test/alternate_method/generate_fixture.js
//
// The fixture is committed to source control; raw/ is gitignored.

const fs = require('node:fs');
const path = require('node:path');
const { yearDatasetMap } = require('../../script.js');
const { munge } = require('./munge');

const RAW_DIR = path.join(__dirname, 'raw');
const FIXTURE_DIR = path.join(__dirname, 'fixtures');
const ENT_CODES = ['31237', '31238', '31256'];

function locateCsvs() {
    const out = {};
    for (const year of Object.keys(yearDatasetMap)) {
        const file = path.join(RAW_DIR, `${year}.csv`);
        if (!fs.existsSync(file)) {
            throw new Error(
                `Missing ${file}. Run \`node test/alternate_method/download.js\` first.`
            );
        }
        out[year] = file;
    }
    return out;
}

(async () => {
    console.log(`Locating raw CSVs in ${RAW_DIR}...`);
    const csvByYear = locateCsvs();

    console.log(`\nMunging ENT codes [${ENT_CODES.join(', ')}] across ${Object.keys(csvByYear).length} years...`);
    const t0 = Date.now();
    const rows = await munge(csvByYear, ENT_CODES);
    console.log(`Munged in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
    const outPath = path.join(FIXTURE_DIR, 'ent_alternate.json');
    fs.writeFileSync(outPath, JSON.stringify(rows, null, 2));
    console.log(`\nWrote ${rows.length} rows to ${outPath}`);
})();
