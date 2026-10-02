# PanelPath build plan

Work through the steps in order. Each step lists what to build, what it writes, how to check it and a time box. When a step's check passes, tick its box below and commit with `step N: ...`. If a step is about to overrun its time box, stop and suggest what to cut.



## Status

- [x] 0 Scaffold
- [x] 1 Download
- [x] 2 Clean CER data
- [ ] 3 Geography and dwellings
- [ ] 4 Cohorts, tonnes and retirements
- [ ] 5 National validation
- [ ] 6 Lifetime fit (the creative twist)
- [ ] 7 Site optimiser and capitals-only baseline
- [ ] 8 Export web data
- [ ] 9 Map MVP
- [ ] 10 Validation and method pages
- [ ] 11 Materials layer (stretch)
- [ ] 12 Polish and submission

## Step 0: Scaffold (30 min)

Build:
1. The repo layout from `CLAUDE.md`, plus a `.gitignore` covering `data/raw/`, `.venv/`, `node_modules/` and `web/dist/`.
2. `requirements.txt` with the Python stack.
3. `pipeline/config.py`, filled from `docs/CONTEXT.md` section 7. It holds the scenarios, the watts and mass table, the radius, site count, minimum sites per state, forecast years, demand years and fit settings. Each value carries a source comment.
4. `pipeline/run.py`, a CLI with `--stage`, plus stub stage functions that log "not implemented".
5. `tests/test_weibull.py`, using the test values in `CLAUDE.md`.


Check: `pytest -q` passes, and `python -m pipeline.run --stage all` runs and logs each stage.

## Step 1: Download (60 min)

Build `pipeline/download.py` to fetch:
- The Clean Energy Regulator's small-scale installation postcode data: every file needed from 2001 to now. Find the current file links on the page.
- The ABS ASGS Edition 3 boundaries for POA 2021, GCCSA 2021 and STE 2021, as GeoPackage or shapefile in GDA2020.
- The ABS Census 2021 General Community Profile DataPack at POA level, for all of Australia.
- Geoscience Australia's Waste Management Facilities Database, as CSV or GeoJSON.

Write `data/raw/MANIFEST.json` with name, url, download date, sha256 and bytes for each file.

If a source only allows a click-through download, or a URL has changed, stop. Give the human the page URL and say exactly what file to save where. Never guess URLs.

Check: every file is present, the manifest is written, and file sizes are printed.

## Step 2: Clean CER data (90 min)

Build:
1. Inspect the structure first: sheet names, columns and the first rows. The data may be split across files or sheets by year, so don't assume a layout.
2. Write `data/interim/cer_installs.parquet` with columns `postcode` (4-character string), `year_month` (first day of the month), `installs` (int), `kw` (float) and `provisional` (bool, true for the last 12 months). Keep solar PV only.
3. QA:
   - Print national installs and kW by year.
   - Print cumulative installs to date. Expect a few million systems; more than 4.3 million homes have rooftop solar. Flag it if the total is far off.
   - Check for duplicates and negative values.
   - Log dropped rows to `data/processed/qa/`.

Check: a pytest test on a small fixture passes and the totals print.

## Step 3: Geography and dwellings (90 min)

Build:
1. Load the POA 2021 polygons. Compute centroids and area, using EPSG:3577 for the calculation. Assign each POA a state by largest overlap with the STE polygons. Flag capital-city POAs by overlap with GCCSA.
2. In the Census DataPack metadata, find the dwelling-structure table. Extract occupied private dwellings per POA: separate houses (the default) and semi-detached, row and terrace (for the sensitivity check).
3. Join CER postcodes to POA codes. Log unmatched postcodes, with the installs and kW lost, to `data/processed/qa/unmatched_postcodes.csv`. Print the share of national kW that's unmatched; the target is under 1%.
4. Write simplified polygons for the web (under 5 MB) and keep the full-resolution polygons for analysis.

Check: `data/interim/poa.parquet` has `poa_code`, `state`, `lon`, `lat`, `area_km2`, `houses`, `semis` and `in_capital`. The unmatched share prints.

## Step 4: Cohorts, tonnes and retirements (90 min)

Build:
1. Join installs to the config tables by install year. Panels = kW × 1000 / watts per panel. Tonnes = kW × kg-per-kW / 1000.
2. For each POA, install month and scenario, compute panels and tonnes retired in each calendar year from 2015 to 2035, using the formula in `CLAUDE.md`. Vectorise with numpy; no Python loops over rows.
3. Write `data/processed/retirements.parquet` (`scenario`, `poa_code`, `year`, `panels`, `tonnes`) and the national totals.

Check: a pytest test of the formula on one synthetic cohort passes. National tonnes per scenario print for 2025, 2030 and 2035, plus the cumulative total to 2035.

## Step 5: National validation (45 min)

Build:
1. A chart of national annual tonnes from 2015 to 2035, one line per scenario, with the reported points from `docs/CONTEXT.md` section 9 overlaid. Show cumulative tonnes to 2035 against the roughly 1 Mt figure.
2. Save `outputs/figures/validation_national.png` and `data/processed/validation.json`.
3. Write three sentences for the README: which scenario lands closest, and by how much.

Check: the human reviews the chart. If every scenario is more than 3x off, stop; it's probably a unit error.

## Step 6: Lifetime fit, the creative twist (120 min)

Build the fit exactly as `docs/CONTEXT.md` section 6.4 describes:
1. Count installs up to 10 Aug 2021 and use separate houses as the denominator.
2. Apply the filters: at least 500 houses, mean system size of 15 kW or less, and full POAs only.
3. Compute the observed excess E and modelled replacements R(β).
4. Grid-search β.
5. Run the state cross-check of the implied replacement share for 2024 and 2025.

Then add `FITTED` as a scenario and rerun the `retire` stage.

Sensitivity runs:
- Denominator of houses plus semis.
- Size thresholds of 10 kW and 20 kW.

Outputs:
- `data/processed/fit_report.json`, with β, n, RMSE, F(15) and the sensitivity results.
- `outputs/figures/fit_excess_vs_model.png`.
- The caveats paragraph in the README.

Check: the human reviews β and the cross-check before the next step.

## Step 7: Site optimiser and capitals-only baseline (120 min)

Build:
1. **Candidates.** Inspect the GA facility-type field and keep the types where a public drop-off is plausible. Record the list in config with a comment. Merge duplicates that are within 100 m of each other.
2. **Demand.** Use POA centroids weighted by tonnes retiring from 2026 to 2030 (`FITTED`, or `AU_RES` if the fit isn't done).
3. **Coverage sets.** Build them with a spatial index, using radius from config, in EPSG:3577.
4. **Greedy.** Seed each state with its best site, then keep adding the site that covers the most still-uncovered tonnes until there are 100 sites.
5. **Baseline.** Run the same algorithm with candidates restricted to capital-city areas.
6. **Exact (optional).** PuLP with CBC and a 120 s limit. Report the objective against greedy.
7. **Outputs.**
   - `data/processed/sites_<scenario>.geojson`, with id, name, type, state, tonnes and panels per year from 2026 to 2035, and POAs covered.
   - `data/processed/coverage.json`, with % of tonnes covered and mean distance to the nearest site, for optimised and baseline.

Check: a pytest test on a 10×10 toy grid with a known optimum passes. The national greedy run takes under 60 s. Coverage numbers print.

## Step 8: Export web data (45 min)

Write these files to `web/public/data/`:
- `poa.geojson`: simplified, with `poa_code` and `state` only.
- `retirements.json`: scenario → year → `poa_code` → tonnes, rounded to 0.1.
- `sites_<scenario>.geojson`.
- `coverage.json`, `validation.json`, `fit_report.json`.
- `assumptions.json`: the config dump, with sources.
- `cohorts.json`: installs by year per POA.

Document the schema of each file in the README.

Check: the folder totals under 15 MB.

## Step 9: Map MVP (240 min)

Build with Vite, React, TypeScript and MapLibre GL JS:
1. **Base map.** A plain background with state outlines is fine. If you use a public tile service, add its attribution and keep usage light.
2. **Shading.** Colour each POA by tonnes retiring in the selected year, using quantile breaks and a legend with units.
3. **Controls.**
   - A year slider from 2026 to 2035.
   - A scenario toggle.
   - Summary cards: national tonnes that year, coverage % (optimised vs capitals-only) and site count.
4. **Site pins.** Size pins by tonnes per year. Clicking one shows its name, type, and tonnes and panels per year.
5. **Postcode panel.** Clicking a POA opens a side panel with a chart of retirements by year, a chart of installs by year, the state and the house count.

Check: runs with `npm run dev` with no console errors, works at 1366×768, and the slider feels smooth.

## Step 10: Validation and method pages (90 min)

Build:
1. **Validation page.** The national chart and the lifetime-fit chart, each with one paragraph of explanation.
2. **Method and sources page.** The assumptions table from `assumptions.json`; data sources with links and licences; prior work and what's new (`docs/CONTEXT.md` section 10); limitations (section 12).

Check: every number on screen traces back to a file in `web/public/data/`.

## Step 11: Materials layer, stretch (90 min)

Build:
1. Take composition shares from the source table cited in `docs/CONTEXT.md` section 6.6, and compute tonnes of each material per POA and per site.
2. Add a "rooftop urban mine" card to the POA panel, showing silver's share of mass vs its share of value.

Check: shares sum to 100%, and the source is shown in the UI.

## Step 12: Polish and submission (120 min)

Build:
1. **README.** One-line pitch, screenshots, how to run, data sources and licences, assumptions, validation results, limitations
2. **Disclosure.** listing all datasets and libraries.
3. **Deploy.** Put the static build on a public static host and link it in the README.

4. **Video script.** Write `docs/VIDEO.md` (2 minutes or less) following `docs/CONTEXT.md` section 11:
   - 0:00 to 0:15: hook
   - 0:15 to 0:35: problem and users
   - 0:35 to 1:20: live map demo
   - 1:20 to 1:40: validation and coverage numbers
   - 1:40 to 2:00: Monday use and next steps

Check: from a fresh clone, setup → `python -m pipeline.run --stage all` → `npm run build` all succeed.

## Suggested team split

- **Data:** steps 1 to 3
- **Model:** steps 4 to 6
- **Optimiser:** step 7
- **Frontend:** steps 8 to 10
- **Pitch and submission:** step 12, the video and the README
