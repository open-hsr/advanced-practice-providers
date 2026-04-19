# advanced-practice-providers

A small website that helps researchers see what share of Medicare Part B procedures are billed by **Advanced Practice Providers** (APPs) — physician assistants, nurse practitioners, CRNAs, clinical nurse specialists, and certified nurse midwives — versus physicians, from 2010 onward.

**Live site:** [open-hsr.github.io/advanced-practice-providers](https://open-hsr.github.io/advanced-practice-providers)

You enter up to 25 HCPCS procedure codes (separated by semicolons), and the page queries CMS's public data for every year and shows you a chart of the APP share over time. You can also download the underlying numbers as a CSV.

## What's in this repo

- **`index.html`** — the page you see when you visit the site. Static HTML; nothing to compile or install.
- **`script.js`** — all the logic behind the page: fetching data from CMS, aggregating it by year and clinician type, drawing the chart, building the CSV.
- **`test/`** — automated tests that check the calculations. Several different angles, including one that re-computes the numbers from CMS's full annual data files using a completely separate implementation, just to make sure the website's numbers agree. See [`test/README.md`](test/README.md) for details.
- **`CLAUDE.md`** — guidance notes for AI coding assistants working on this repo.
- **`LICENSE`** — open-source license.

That's the whole repo. There's no build system, no server, no deploy step beyond pushing to GitHub.

---

## For maintainers

### Running the site locally

Open `index.html` directly in a browser, or serve the directory with any static file server (e.g. `python3 -m http.server`). No install step.

### Running the tests

All tests use Node's built-in test runner (Node 18+). No `npm install`, no dependencies.

```bash
node --test test/unit.test.js                                # fast, no network — safe for CI
node --test test/snapshot.test.js                            # ~30s, hits the CMS API
node --test --test-timeout=180000 test/consistency.test.js   # ~1min, hits the CMS API
node --test test/csv_reference/verify.test.js                # <1s, runs against committed fixture
```

See [`test/README.md`](test/README.md) for what each test catches and the env vars that opt into the slower / more expensive cases. The CSV-reference test has its own [README](test/csv_reference/README.md) covering the one-time bulk download needed to regenerate its fixture.

### Architecture and CMS API quirks

See [`CLAUDE.md`](CLAUDE.md). It documents the data pipeline, the year-era column-name change CMS made in 2020, the `"*"` redaction behavior in 2021+, and the rate-limit / concurrency handling around the CMS public API.
