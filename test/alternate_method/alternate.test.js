// Alternate-method validation: compares the production pipeline's output
// against an independently-implemented reference computed from a full
// download of the CMS PSPS dataset.
//
// Skips itself if the fixture isn't present (since regenerating it requires
// a multi-GB download). To create or refresh the fixture:
//
//   node test/alternate_method/download.js          # one-time, slow
//   node test/alternate_method/generate_fixture.js  # builds the fixture
//
// Usage: node --test test/alternate_method/alternate.test.js

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { runQuery } = require('../helpers');

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'ent_alternate.json');
const ENT_CODES = ['31237', '31238', '31256'];

function closeEnough(got, want) {
    return Math.abs(got - want) <= Math.max(1e-6, Math.abs(want) * 1e-10);
}

describe('alternate-method validation', () => {
    it('production pipeline matches independent reference for ENT codes', async (t) => {
        if (!fs.existsSync(FIXTURE_PATH)) {
            t.skip(
                `Fixture ${FIXTURE_PATH} missing. To generate: ` +
                `\`node test/alternate_method/download.js && node test/alternate_method/generate_fixture.js\``
            );
            return;
        }

        const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf-8'));
        const output = await runQuery(ENT_CODES);

        assert.equal(
            output.length, fixture.length,
            `row count mismatch: got ${output.length}, fixture ${fixture.length}`
        );

        for (let i = 0; i < output.length; i++) {
            const got = output[i];
            const want = fixture[i];
            const tag = `row ${i} (${got.year} ${got.clinician_type})`;

            assert.equal(got.year, want.year, `${tag}: year mismatch`);
            assert.equal(got.clinician_type, want.clinician_type, `${tag}: clinician_type mismatch`);

            assert.ok(
                closeEnough(got.number_of_procedures_clinician_type, want.number_of_procedures_clinician_type),
                `${tag}: number_of_procedures (got ${got.number_of_procedures_clinician_type}, want ${want.number_of_procedures_clinician_type})`
            );
            assert.ok(
                closeEnough(got.number_of_procedures_all_clinicians, want.number_of_procedures_all_clinicians),
                `${tag}: number_of_procedures_all_clinicians (got ${got.number_of_procedures_all_clinicians}, want ${want.number_of_procedures_all_clinicians})`
            );
            assert.ok(
                Math.abs(got.proportion_of_procedures_clinician_type - want.proportion_of_procedures_clinician_type) < 1e-10,
                `${tag}: proportion (got ${got.proportion_of_procedures_clinician_type}, want ${want.proportion_of_procedures_clinician_type})`
            );
        }

        console.log(`Production pipeline matches alternate-method reference (${output.length} rows).`);
    });
});
