// Pure unit tests for the data pipeline — no network.
// Covers the parts most likely to silently miscalculate:
//  - filterColumns       (3 year-eras with different parsing rules)
//  - collapseByAdvancedPracticeProvider
//  - addAdvancedPracticePct
//  - buildQueryURL       (the manual query-string construction)
//
// Usage: node --test test/unit.test.js

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    yearDatasetMap,
    advancedPracticeProviderCodes,
    appSpecialtyOrder,
    buildQueryURL,
    filterColumns,
    collapseByAdvancedPracticeProvider,
    addAdvancedPracticePct,
} = require('../script.js');

const TOTAL_YEARS = Object.keys(yearDatasetMap).length;

// ---------------------------------------------------------------------------
// filterColumns
// ---------------------------------------------------------------------------

describe('filterColumns', () => {
    it('uses SUBMITTED_SERVICE_CNT for years 2010-2019 (numeric, no redaction)', () => {
        const raw = [{ HCPCS_CD: '99213', PROVIDER_SPEC_CD: '50', SUBMITTED_SERVICE_CNT: 1234 }];
        const out = filterColumns(raw, '2015');

        assert.equal(out.length, 1);
        assert.equal(out[0].year, '2015');
        assert.equal(out[0].hcpcs_cd, '99213');
        assert.equal(out[0].provider_spec_cd, '50');
        assert.equal(out[0].number_of_procedures, 1234);
        assert.equal(out[0].advanced_practice_provider, 1);
    });

    it('uses PSPS_SUBMITTED_SERVICE_CNT for 2020 (numeric, no redaction)', () => {
        const raw = [{ HCPCS_CD: '99213', PROVIDER_SPEC_CD: '11', PSPS_SUBMITTED_SERVICE_CNT: 500 }];
        const out = filterColumns(raw, '2020');

        assert.equal(out[0].number_of_procedures, 500);
        assert.equal(out[0].advanced_practice_provider, 0);
    });

    it('parses string PSPS_SUBMITTED_SERVICE_CNT for 2021+', () => {
        const raw = [{ HCPCS_CD: '99213', PROVIDER_SPEC_CD: '50', PSPS_SUBMITTED_SERVICE_CNT: '789' }];
        const out = filterColumns(raw, '2022');

        assert.equal(out[0].number_of_procedures, 789);
        assert.equal(typeof out[0].number_of_procedures, 'number');
    });

    it('treats redacted "*" PSPS values (2021+) as empty string', () => {
        const raw = [{ HCPCS_CD: '99213', PROVIDER_SPEC_CD: '50', PSPS_SUBMITTED_SERVICE_CNT: '*' }];
        const out = filterColumns(raw, '2023');

        assert.equal(out[0].number_of_procedures, '');
    });

    it('treats missing PSPS field (2021+) as empty string', () => {
        const raw = [{ HCPCS_CD: '99213', PROVIDER_SPEC_CD: '50' }];
        const out = filterColumns(raw, '2023');

        assert.equal(out[0].number_of_procedures, '');
    });

    it('drops rows with provider_spec_cd not in validProviderSpecCodes', () => {
        const raw = [
            { HCPCS_CD: '99213', PROVIDER_SPEC_CD: '50', SUBMITTED_SERVICE_CNT: 100 },
            { HCPCS_CD: '99213', PROVIDER_SPEC_CD: 'ZZ', SUBMITTED_SERVICE_CNT: 100 }, // invalid
            { HCPCS_CD: '99213', PROVIDER_SPEC_CD: '',   SUBMITTED_SERVICE_CNT: 100 }, // empty
        ];
        const out = filterColumns(raw, '2015');

        assert.equal(out.length, 1);
        assert.equal(out[0].provider_spec_cd, '50');
    });

    it('flags all five APP specialty codes as advanced_practice_provider=1', () => {
        const raw = [...advancedPracticeProviderCodes].map(code => ({
            HCPCS_CD: '99213',
            PROVIDER_SPEC_CD: code,
            SUBMITTED_SERVICE_CNT: 10,
        }));
        const out = filterColumns(raw, '2015');

        assert.equal(out.length, 5);
        out.forEach(r => assert.equal(r.advanced_practice_provider, 1));
    });

    it('flags non-APP valid specialty codes as advanced_practice_provider=0', () => {
        const raw = [
            { HCPCS_CD: '99213', PROVIDER_SPEC_CD: '01', SUBMITTED_SERVICE_CNT: 10 },
            { HCPCS_CD: '99213', PROVIDER_SPEC_CD: '11', SUBMITTED_SERVICE_CNT: 10 },
            { HCPCS_CD: '99213', PROVIDER_SPEC_CD: 'C0', SUBMITTED_SERVICE_CNT: 10 },
        ];
        const out = filterColumns(raw, '2015');

        assert.equal(out.length, 3);
        out.forEach(r => assert.equal(r.advanced_practice_provider, 0));
    });

    it('handles missing HCPCS_CD by setting empty string', () => {
        const raw = [{ PROVIDER_SPEC_CD: '50', SUBMITTED_SERVICE_CNT: 10 }];
        const out = filterColumns(raw, '2015');
        assert.equal(out[0].hcpcs_cd, '');
    });
});

// ---------------------------------------------------------------------------
// collapseByAdvancedPracticeProvider
// ---------------------------------------------------------------------------

describe('collapseByAdvancedPracticeProvider', () => {
    it('zero-fills every year × {APP=0, APP=1} aggregate and every year × specialty when input is empty', () => {
        const out = collapseByAdvancedPracticeProvider([]);

        const aggregates = out.filter(r => r.row_type === 'aggregate');
        const specialties = out.filter(r => r.row_type === 'specialty');

        assert.equal(aggregates.length, TOTAL_YEARS * 2);
        assert.equal(specialties.length, TOTAL_YEARS * appSpecialtyOrder.length);
        out.forEach(r => assert.equal(r.number_of_procedures, 0));
    });

    it('sums counts within each (year, APP-flag) aggregate group', () => {
        const filtered = [
            { year: '2015', hcpcs_cd: '99213', provider_spec_cd: '50', number_of_procedures: 100, advanced_practice_provider: 1 },
            { year: '2015', hcpcs_cd: '99213', provider_spec_cd: '97', number_of_procedures: 50,  advanced_practice_provider: 1 },
            { year: '2015', hcpcs_cd: '99213', provider_spec_cd: '01', number_of_procedures: 200, advanced_practice_provider: 0 },
        ];
        const out = collapseByAdvancedPracticeProvider(filtered);

        const apps2015 = out.find(r => r.year === '2015' && r.row_type === 'aggregate' && r.advanced_practice_provider === 1);
        const phys2015 = out.find(r => r.year === '2015' && r.row_type === 'aggregate' && r.advanced_practice_provider === 0);
        assert.equal(apps2015.number_of_procedures, 150);
        assert.equal(phys2015.number_of_procedures, 200);
    });

    it('produces per-specialty rows that sum to the APP=1 aggregate', () => {
        // Property-style: every APP specialty row is independently aggregated, but the
        // sum across the five specialty rows must equal the APP=1 aggregate (since all
        // five APP codes are in validProviderSpecCodes — no row is excluded).
        const filtered = [
            { year: '2015', hcpcs_cd: '99213', provider_spec_cd: '50', number_of_procedures: 100, advanced_practice_provider: 1 },
            { year: '2015', hcpcs_cd: '99213', provider_spec_cd: '97', number_of_procedures: 50,  advanced_practice_provider: 1 },
            { year: '2015', hcpcs_cd: '99213', provider_spec_cd: '42', number_of_procedures: 25,  advanced_practice_provider: 1 },
        ];
        const out = collapseByAdvancedPracticeProvider(filtered);

        const apps2015 = out.find(r => r.year === '2015' && r.row_type === 'aggregate' && r.advanced_practice_provider === 1);
        const specialty2015Sum = out
            .filter(r => r.year === '2015' && r.row_type === 'specialty')
            .reduce((acc, r) => acc + r.number_of_procedures, 0);

        assert.equal(specialty2015Sum, apps2015.number_of_procedures);
        assert.equal(specialty2015Sum, 175);
    });

    it('treats empty-string number_of_procedures as 0', () => {
        const filtered = [
            { year: '2022', hcpcs_cd: '99213', provider_spec_cd: '50', number_of_procedures: '',  advanced_practice_provider: 1 },
            { year: '2022', hcpcs_cd: '99213', provider_spec_cd: '50', number_of_procedures: 100, advanced_practice_provider: 1 },
        ];
        const out = collapseByAdvancedPracticeProvider(filtered);

        const apps2022 = out.find(r => r.year === '2022' && r.row_type === 'aggregate' && r.advanced_practice_provider === 1);
        assert.equal(apps2022.number_of_procedures, 100);
    });

    it('synthesizes missing year/specialty combinations as zero-valued rows', () => {
        const filtered = [
            { year: '2015', hcpcs_cd: '99213', provider_spec_cd: '50', number_of_procedures: 100, advanced_practice_provider: 1 },
        ];
        const out = collapseByAdvancedPracticeProvider(filtered);

        // Every year should have a row for each APP specialty
        Object.keys(yearDatasetMap).forEach(year => {
            appSpecialtyOrder.forEach(({ code }) => {
                const row = out.find(r => r.year === year && r.row_type === 'specialty' && r.provider_spec_cd === code);
                assert.ok(row, `missing specialty row for ${year}/${code}`);
            });
        });
    });
});

// ---------------------------------------------------------------------------
// addAdvancedPracticePct
// ---------------------------------------------------------------------------

describe('addAdvancedPracticePct', () => {
    it('uses only aggregate rows for the denominator (does NOT double-count specialty rows)', () => {
        // If the function mistakenly summed specialty rows into the denominator,
        // the APP proportion would come out artificially small.
        const collapsed = [
            { year: '2015', row_type: 'aggregate', advanced_practice_provider: 1, provider_spec_cd: null, number_of_procedures: 100 },
            { year: '2015', row_type: 'aggregate', advanced_practice_provider: 0, provider_spec_cd: null, number_of_procedures: 100 },
            // specialty rows that themselves sum to 100 — easy trap if denominator counts them
            { year: '2015', row_type: 'specialty', advanced_practice_provider: 1, provider_spec_cd: '50', number_of_procedures: 60 },
            { year: '2015', row_type: 'specialty', advanced_practice_provider: 1, provider_spec_cd: '97', number_of_procedures: 40 },
        ];
        const out = addAdvancedPracticePct(collapsed);

        const apps = out.find(r => r.row_type === 'aggregate' && r.advanced_practice_provider === 1);
        assert.equal(apps.proportion_of_procedures, 0.5, 'denominator should be 200 (aggregates only), not 300');
        assert.equal(apps.number_of_procedures_all_clinicians, 200);
    });

    it('APP and Physician aggregate proportions sum to 1.0 per year', () => {
        const collapsed = [
            { year: '2015', row_type: 'aggregate', advanced_practice_provider: 1, provider_spec_cd: null, number_of_procedures: 250 },
            { year: '2015', row_type: 'aggregate', advanced_practice_provider: 0, provider_spec_cd: null, number_of_procedures: 750 },
            { year: '2020', row_type: 'aggregate', advanced_practice_provider: 1, provider_spec_cd: null, number_of_procedures: 1 },
            { year: '2020', row_type: 'aggregate', advanced_practice_provider: 0, provider_spec_cd: null, number_of_procedures: 1 },
        ];
        const out = addAdvancedPracticePct(collapsed);

        ['2015', '2020'].forEach(year => {
            const yearRows = out.filter(r => r.row_type === 'aggregate' && r.year === year);
            const totalProp = yearRows.reduce((acc, r) => acc + r.proportion_of_procedures, 0);
            assert.ok(Math.abs(totalProp - 1.0) < 1e-10, `Year ${year}: proportions sum to ${totalProp}, expected 1.0`);
        });
    });

    it('returns proportion=0 for years with zero total procedures (no division by zero)', () => {
        const collapsed = [
            { year: '2015', row_type: 'aggregate', advanced_practice_provider: 1, provider_spec_cd: null, number_of_procedures: 0 },
            { year: '2015', row_type: 'aggregate', advanced_practice_provider: 0, provider_spec_cd: null, number_of_procedures: 0 },
        ];
        const out = addAdvancedPracticePct(collapsed);
        out.forEach(r => {
            assert.equal(r.proportion_of_procedures, 0);
            assert.ok(Number.isFinite(r.proportion_of_procedures));
        });
    });

    it('specialty proportions are relative to all-clinician total, not APP-only total', () => {
        const collapsed = [
            { year: '2015', row_type: 'aggregate', advanced_practice_provider: 1, provider_spec_cd: null, number_of_procedures: 100 },
            { year: '2015', row_type: 'aggregate', advanced_practice_provider: 0, provider_spec_cd: null, number_of_procedures: 900 },
            { year: '2015', row_type: 'specialty', advanced_practice_provider: 1, provider_spec_cd: '50', number_of_procedures: 100 },
        ];
        const out = addAdvancedPracticePct(collapsed);

        const np = out.find(r => r.row_type === 'specialty' && r.provider_spec_cd === '50');
        assert.equal(np.proportion_of_procedures, 0.1, 'should be 100/1000, not 100/100');
    });

    it('attaches number_of_procedures_all_clinicians to every row', () => {
        const collapsed = [
            { year: '2015', row_type: 'aggregate', advanced_practice_provider: 1, provider_spec_cd: null, number_of_procedures: 100 },
            { year: '2015', row_type: 'aggregate', advanced_practice_provider: 0, provider_spec_cd: null, number_of_procedures: 200 },
            { year: '2015', row_type: 'specialty', advanced_practice_provider: 1, provider_spec_cd: '50', number_of_procedures: 50 },
        ];
        const out = addAdvancedPracticePct(collapsed);
        out.forEach(r => assert.equal(r.number_of_procedures_all_clinicians, 300));
    });
});

// ---------------------------------------------------------------------------
// buildQueryURL
// ---------------------------------------------------------------------------

describe('buildQueryURL', () => {
    const datasetId = 'abc-123';

    it('uses equality filter for a single code', () => {
        const url = buildQueryURL(datasetId, ['99213'], '2015', 0);
        assert.ok(url.includes('filter[condition][operator]=='), 'should use = operator');
        assert.ok(url.includes('filter[condition][value]=99213'));
        assert.ok(!url.includes('value[]'), 'single-code path must not use value[]= syntax');
    });

    it('uses IN filter with repeated value[]= params for multiple codes', () => {
        const url = buildQueryURL(datasetId, ['99213', '99214', '99215'], '2015', 0);
        assert.ok(url.includes('filter[condition][operator]=IN'));
        assert.ok(url.includes('filter[condition][value][]=99213'));
        assert.ok(url.includes('filter[condition][value][]=99214'));
        assert.ok(url.includes('filter[condition][value][]=99215'));
    });

    it('does not percent-encode brackets — CMS requires literal [ and ]', () => {
        const url = buildQueryURL(datasetId, ['A', 'B'], '2015', 0);
        assert.ok(!url.includes('%5B'), 'must not encode [');
        assert.ok(!url.includes('%5D'), 'must not encode ]');
    });

    it('does not percent-encode commas in the column list', () => {
        const url = buildQueryURL(datasetId, ['99213'], '2015', 0);
        // 2015 era columns: HCPCS_CD,PROVIDER_SPEC_CD,SUBMITTED_SERVICE_CNT
        assert.ok(url.includes('column=HCPCS_CD,PROVIDER_SPEC_CD,SUBMITTED_SERVICE_CNT'));
        assert.ok(!url.includes('%2C'), 'must not encode , in column list');
    });

    it('uses SUBMITTED_SERVICE_CNT in column list for years <= 2019', () => {
        const url = buildQueryURL(datasetId, ['99213'], '2019', 0);
        assert.ok(url.includes('column=HCPCS_CD,PROVIDER_SPEC_CD,SUBMITTED_SERVICE_CNT'));
        assert.ok(!url.includes('PSPS_SUBMITTED_SERVICE_CNT'));
    });

    it('uses PSPS_SUBMITTED_SERVICE_CNT in column list for years >= 2020', () => {
        const url = buildQueryURL(datasetId, ['99213'], '2020', 0);
        assert.ok(url.includes('column=HCPCS_CD,PROVIDER_SPEC_CD,PSPS_SUBMITTED_SERVICE_CNT'));
    });

    it('includes offset and size params', () => {
        const url = buildQueryURL(datasetId, ['99213'], '2015', 5000);
        assert.ok(url.includes('offset=5000'));
        assert.ok(url.includes('size=5000'));
    });

    it('percent-encodes special characters in HCPCS codes', () => {
        // Some HCPCS codes contain characters needing encoding (e.g., modifier-style values).
        const url = buildQueryURL(datasetId, ['A B'], '2015', 0);
        assert.ok(url.includes('filter[condition][value]=A%20B'));
    });

    it('targets the correct CMS API endpoint with the dataset ID', () => {
        const url = buildQueryURL('my-dataset-id', ['99213'], '2015', 0);
        assert.ok(url.startsWith('https://data.cms.gov/data-api/v1/dataset/my-dataset-id/data?'));
    });
});
