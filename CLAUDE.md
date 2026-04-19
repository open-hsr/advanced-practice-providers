# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A static web application that queries the CMS (Centers for Medicare & Medicaid Services) public API to calculate the number and proportion of Medicare Part B procedures submitted by Advanced Practice Providers (APPs) from 2010-2024. APPs include physician assistants, nurse practitioners, CRNAs, clinical nurse specialists, and certified nurse midwives.

## Development

No build system — the app is vanilla HTML + JavaScript served as static files. Open `index.html` directly or use any static file server. Styling via CMS Design System v9.0.1 CDN. Chart.js v4.4.7 via CDN.

### Testing

```bash
node --test test/unit.test.js                         # fast unit tests, no network
node --test test/snapshot.test.js                     # network-backed regression (~30s)
node --test --test-timeout=180000 test/consistency.test.js  # multi-code consistency (~1m)
```

Zero-dependency tests using Node's built-in test runner. `test/helpers.js` shares a `runQuery` that mirrors the browser's pipeline and produces the same row shape as the CSV download.

- `unit.test.js` — pure tests for `filterColumns`, `collapseByAdvancedPracticeProvider`, `addAdvancedPracticePct`, and `buildQueryURL`. Covers the three year-eras of CMS column-naming, the `"*"` redaction handling, the aggregate-only denominator invariant, and the manually-built query string (brackets/commas must stay literal).
- `snapshot.test.js` — runs the full pipeline against the live CMS API for HCPCS code 31237. First run saves a fixture to `test/fixtures/snapshot_31237.json`; subsequent runs compare against it. Delete the fixture file to regenerate.
- `consistency.test.js` — runs a multi-code query and asserts it equals the per-(year, clinician_type) sum of single-code queries. Catches pagination off-by-ones, IN-filter encoding bugs, and any non-order-independent aggregation. Hits the CMS API; not for CI.

  By default only the moderate-volume case runs. Env vars:
  - `RUN_ALL_CONSISTENCY_CASES=1` — also runs the ENT smoke case and the high-volume stress case (`99213` + others). The high-volume case is best run from a fresh-IP environment so it doesn't burn through the local IP's CMS rate-limit budget.
  - `VERBOSE_FETCH=1` — streams per-page-fetch and per-retry events to stdout for diagnosis. Noisy.

`script.js` is dual-environment: DOM code is guarded by `typeof document !== 'undefined'` and functions are exported via conditional `module.exports` for Node test imports.

`fetchPaginatedData` caps in-flight CMS requests (`MAX_CONCURRENT_FETCHES`), retries HTTP 429 with exponential backoff, and aborts the run after a hard `MAX_429_BUDGET` ceiling — protects both the browser app from rate-limit failures and the test suite from sustained throttling.

## Architecture

All application logic lives in `script.js`; the UI is in `index.html` with inline CSS.

**Data pipeline flow:**
1. User enters up to 25 semicolon-separated HCPCS procedure codes
2. All 15 years (2010-2024) are fetched concurrently via `Promise.all()` from CMS Data API (`data.cms.gov`), with recursive pagination in 5000-record pages (`fetchPaginatedData`)
3. `filterColumns` normalizes column names across years (CMS renamed `SUBMITTED_SERVICE_CNT` to `PSPS_SUBMITTED_SERVICE_CNT` in 2020) and handles redacted `"*"` values (2021+)
4. `collapseByAdvancedPracticeProvider` aggregates procedure counts by year and clinician type
5. `addAdvancedPracticePct` calculates APP vs physician proportions
6. `buildTaggedData` produces the final row objects used by both the chart and CSV download

**Results display:** Line chart (Physicians omitted; they are the complement). The aggregate "All Advanced Practice Providers" line is drawn on top with heavier weight; individual specialty lines are thinner. Lines with all-zero data are omitted. Direct labels at line endpoints replace a legend.

**Key data mappings in `script.js`:**
- `yearDatasetMap` — maps each year to its CMS dataset ID
- `advancedPracticeProviderCodes` — the 5 provider specialty codes that define APPs ("42", "43", "50", "89", "97")
- `validProviderSpecCodes` — full set of 60+ valid provider codes
- `yearColumnMap` — handles the 2020 column name change

## CMS Data API notes

- Public, no auth required. Base: `data.cms.gov/data-api/v1/dataset/{id}/data`
- Max page size is 5000 (not 1000 as docs suggest). Filter-only — no aggregation, no SQL, no COUNT.
- `group_by` parameter does NOT aggregate; it returns one arbitrary row per group. Do not use it.
- CMS suppresses counts <11 with `"*"` starting in 2021, making `psps_submitted_service_cnt` a string field.
