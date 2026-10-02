# PanelPath

PanelPath forecasts, postcode by postcode, when Australia's rooftop solar panels will be retired and how many tonnes each area will produce. It then picks where up to 100 collection sites should go to catch the most waste.

It is our entry for Climate Hack-tion 2026 (online, 2 to 4 October 2026), track Green Industrialisation. The relevant COP31 target is a global circular material use rate of at least 15% by 2035.

Before starting any build step, read these two files:
- `docs/CONTEXT.md` explains why we are building this, the method, data sources and the numbers we validate against.
- `docs/BUILD_PLAN.md` lists the steps in order, with acceptance checks and time boxes. Tick steps off there as they pass.


- **Judging.** Weights are COP31 alignment 30%, build quality 30%, creativity 20% and presentation 20%. Build quality means a working build validated against real numbers, so validation outputs are core features, not extras.

## Non-negotiables

- Never invent data, column names, numbers, URLs or sources. If something is missing or a download fails, stop and report the exact URL and error.
- Every assumption lives in `pipeline/config.py`, with a comment giving its source or `TODO: verify`. No magic numbers anywhere else.
- Raw downloads go to `data/raw/`, which is gitignored. Record each one in `data/raw/MANIFEST.json` (url, download date, sha256). Never commit raw data.
- Inspect a file's real structure (sheets, columns, dtypes, head) before writing a parser for it.
- Log every record you drop (unmatched postcodes, bad rows) to a CSV in `data/processed/qa/`, and print the count and the share of national kW it represents.
- Ask before adding dependencies beyond the stack below, and before deleting files.

## Stack

- **Pipeline:** Python 3.11 with pandas, numpy, pyarrow, geopandas, shapely, pyproj, scipy, matplotlib, pulp (optional exact solver), openpyxl and pytest.
- **Frontend:** Vite, React, TypeScript and MapLibre GL JS. It is a static site that reads precomputed files from `web/public/data/`. There is no backend in the MVP.

## Layout

- `pipeline/` has one module per stage: `download.py`, `clean_cer.py`, `geography.py`, `cohorts.py`, `retirement.py`, `replacement_fit.py`, `facilities.py`, `optimiser.py`, `validate.py`, `export.py`, `run.py`, plus `config.py`.
- `data/raw/` holds downloads, `data/interim/` cleaned tables, `data/processed/` model outputs and `data/processed/qa/` the logs of dropped records.
- `tests/` holds pytest tests. `notebooks/` is for throwaway exploration only and is never imported.
- `web/` is the frontend, `docs/` the context and plan, and `outputs/figures/` the charts for the README and pitch.

## Commands

- **Setup:** `python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`
- **Download:** `python -m pipeline.download`
- **Run all stages:** `python -m pipeline.run --stage all`. A single stage is one of `clean`, `geography`, `cohorts`, `retire`, `fit`, `optimise`, `validate` or `export`.
- **Tests:** `pytest -q`. Run before every commit.
- **Web:** `cd web && npm install && npm run dev`. Build with `npm run build`.

## Modelling rules

- **Geography.** Use ABS 2021 Postal Areas (POA). Join CER postcodes to POA codes as 4-character strings, keeping leading zeros ("0800").
- **CRS.** Store geometry in EPSG:4326. Compute distances in EPSG:3577 (metres).
- **Cohorts.** Cohorts are monthly, because the CER data is monthly. A cohort's age is measured in years from the middle of its install month.
- **Retirement curve.** The share retired by age t is F(t) = 1 - exp(-(t/β)^α). Scenarios:
  - `AU_RES`: β 17, α 2.4928 (UNSW 2022, Australian residential)
  - `INTL_EARLY`: β 30, α 2.4928 (IRENA/IEA-PVPS 2016, early loss)
  - `INTL_REGULAR`: β 30, α 5.3759 (IRENA/IEA-PVPS 2016, regular loss)
  - `FITTED`: β fitted from data in step 6, α 2.4928
- **Annual retirements.** For a cohort of size N, retirements in calendar year Y = N × (F(age at end of Y) - F(age at start of Y)), floored at 0.
- **Counts vs mass.** Waste mass uses kW × kg-per-kW for the install year (table in config). Replacement fitting uses system counts, not kW.
- **Test values.** `AU_RES` F(15) ≈ 0.519, `INTL_EARLY` F(15) ≈ 0.163, `INTL_REGULAR` F(15) ≈ 0.024.

## Code style

- Put type hints and docstrings on public functions. Write small pure functions, with no global state except config.
- Stages read and write parquet in `data/interim/` or `data/processed/`. Each stage can be rerun on its own.
- Make charts with matplotlib, saved as PNG in `outputs/figures/`, always with axis labels and units.
- **Web data budget.** Keep all of `web/public/data/` under 15 MB. Simplify the POA polygons until their GeoJSON is under 5 MB.
- Commit after each plan step passes, with the message `step N: short description`.

## How to work with me

- **For each step:** state a 3 to 6 line plan, implement it, run the tests, then show the key numbers (row counts, totals, timings).
- **Keep it simple.** Prefer the simplest thing that works within the step's time box, and flag early if a step will overrun.
- **Check results against reality.** If a result looks wrong, stop and investigate before moving on. For example, if national tonnes are 10x off the validation targets in `docs/CONTEXT.md`, check kW vs MW and kg vs t first.
