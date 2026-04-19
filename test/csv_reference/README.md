# CSV-reference validation

This directory holds an *independent* reference computation that we use to validate the production pipeline in `script.js`.

## Why it exists

The production app fetches narrowly-filtered records from the CMS Data API (`data.cms.gov/data-api/v1/dataset/{id}/data`) and aggregates them client-side. CMS *also* publishes the full annual PSPS dataset as direct CSV downloads. We download those CSVs, process them with a completely separate munge implementation, and assert that for the ENT procedure codes both pipelines produce identical output.

The two code paths share almost nothing:

|                         | Production (`script.js`)             | Reference (`munge.js`)               |
|-------------------------|--------------------------------------|--------------------------------------|
| Source                  | Filtered API queries                 | Full CSV downloads                   |
| Transport               | `fetch` w/ paginated 5000-row pages  | Streaming line-by-line CSV parse     |
| Filtering               | Server-side via the `IN` filter      | Client-side per-row check            |
| Aggregation             | `Map`-based collapse                 | Object-keyed bucket sums             |

The munge here is intentionally written in a different style — different data structures, different ordering of operations — so that the same bug is unlikely to appear in both. If the production pipeline ever drifts from the truth, the comparison catches it.

## Files

- **`download.js`** — fetches the per-year CSVs from CMS's file storage. No API rate limits to worry about (these are static files). Resumable: years already on disk are skipped. Total volume ≈ 12 GB.
- **`munge.js`** — streams a year's CSV row-by-row and accumulates per-clinician-type counts, producing output in the same row shape as the production CSV download.
- **`generate_fixture.js`** — orchestrates `munge.js` over the downloaded CSVs and writes `fixtures/ent_reference.json`.
- **`verify.test.js`** — runs the production pipeline for the ENT codes and asserts row-by-row equality with the fixture.
- **`fixtures/ent_reference.json`** — committed; ~30 KB.
- **`raw/`** — gitignored; ~12 GB after downloading.

## Running the validation

If the fixture is already present (default state for someone checking out the repo):

```bash
node --test test/csv_reference/verify.test.js
```

The test skips itself with a clear message if the fixture is missing.

## Regenerating the fixture (one-time, after pipeline changes or new CMS data)

```bash
node test/csv_reference/download.js          # ~10–20 min, ~12 GB to disk
node test/csv_reference/generate_fixture.js  # ~3 min, streams the CSVs
node --test test/csv_reference/verify.test.js
```

Then commit the updated `fixtures/ent_reference.json`.
