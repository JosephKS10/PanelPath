# PanelPath

PanelPath forecasts, postcode by postcode, when Australia's rooftop solar panels will be retired and how many tonnes each area will produce, then picks where up to 100 collection sites should go to catch the most waste.

## Validation

![National retirements by scenario against reported figures](outputs/figures/validation_national.png)

Of the three published lifetime curves, the Australian residential curve (`AU_RES`, typical life of 17 years) lands closest to the reported figures: it retires 0.95 Mt and 50.6 million panels from 2015 to 2035, against the reported ~1 Mt and ~50 million (0.95× and 1.01×). Its annual tonnes sit below the reported figures, at 42 kt in 2025 (0.71× the reported ~59 kt) and 76 kt in 2030 (0.83× the reported >91 kt), so if anything the model is conservative. The international curves, which assume panels last about 30 years, come in between 2.6 and 33 times too low (`INTL_EARLY` 0.22–0.38×, `INTL_REGULAR` 0.03–0.13×), which supports the evidence that Australian panels come off roofs long before they wear out.

The lifetime fitted from our own data (`FITTED`, β 26.25, below) lands between the two: 17 kt in 2025 and 0.45 Mt by 2035, about 0.3 to 0.5 times the reported figures.

No parameters were tuned to hit these figures. The full comparison is in `data/processed/validation.json`.

## Lifetime fit

![Observed vs modelled excess installs per postcode, and fit error across lifetimes](outputs/figures/fit_excess_vs_model.png)

Where a postcode has more solar installs than houses, the excess is mostly replacements. We fit the Weibull scale β so that modelled replacements match that excess across postcodes, holding the shape fixed at the UNSW value (α 2.4928). Counting installs to August 2025 against 2021 Census houses gives 93 full postcodes (39 QLD, 26 SA, 20 NSW, 7 WA, 1 VIC) and **β = 26.25 years**, so 22% of a cohort is retired by age 15. Every sensitivity run lands between 24.75 and 26.75: counting installs to Census night or to August 2023, adding semis to the denominator, and business thresholds of 10 or 20 kW. As a cross-check, β 26.25 implies replacements make up 17% to 30% of 2025 installs by state, while UNSW's β 17 implies 38% to 69%. Industry reports "over a third in some states", which suggests the true lifetime sits between the two. Full results are in `data/processed/fit_report.json`.

**Caveats.**
- **Fewer full postcodes than planned.** The method was designed to count installs to Census night 2021, but only 3 postcodes were full by then, because national penetration was 43.5% of houses. Counting to 2025 instead means homes built since 2021 add to the excess, and the largest misses are growth suburbs such as Rockbank, Greenbank, Angle Vale, Virginia and Box Hill. This pushes β down.
- **Biases the other way.** Even full postcodes have houses that never got solar. The excess also only sees retirements that trigger a new install. Panels removed without one, through demolition, storm damage or single-panel swaps, are invisible. Both push β up, so the fitted lifetime is best read as an upper-end estimate.
- **Other confounders.** Some installs are second systems rather than replacements, and small business systems inflate counts. Postcodes averaging over 15 kW are excluded, and the 10 and 20 kW thresholds give the same β.
- **Limited coverage.** The fit comes from full postcodes, mostly in QLD, SA and NSW, and is applied nationally. The error curve is flat above about 22 years, so the data rules out short lifetimes more firmly than it pins down one value.
- **Recent months excluded.** The last 12 months of CER data are provisional and left out of the fit.

## Web data

`python -m pipeline.run --stage export` writes these files to `web/public/data/` (7.5 MB in total; the budget is 15 MB). Postcodes are 4-character strings with leading zeros, years are calendar years, and tonnes are metric tonnes.

| File | Contents |
|---|---|
| `poa.geojson` | 2,641 postal areas (ABS POA 2021), simplified to 500 m for the web, EPSG:4326. Properties: `poa_code`, `state`, `area_km2` (from the full-resolution polygon). |
| `retirements.json` | `{scenario: {year: {poa_code: tonnes}}}` for the scenarios `AU_RES`, `FITTED`, `INTL_EARLY` and `INTL_REGULAR`, for 2015 to 2035. Tonnes are rounded to 0.1, and a missing postcode means 0. |
| `sites_<scenario>.geojson` | The 100 chosen collection sites (points, EPSG:4326). The top-level `years` array lists 2026 to 2035. Properties: `rank` (the order the site was picked), `id` (GA record ID), `name`, `owner`, `type` (GA facility types, separated by `; `), `state`, `suburb`, `in_capital`, `tonnes` and `panels` (arrays aligned with `years`), and `poas` (covered postal areas whose nearest site this is). |
| `coverage.json` | One entry per scenario, holding `demand_tonnes` and three site sets: `optimised`, `capitals_only` and `exact`. Each set has `sites`, `covered_tonnes`, `covered_pct`, `covered_poas` and `mean_distance_km`. The `exact` entry also holds the solver status and `greedy_vs_exact_pct`. The file also has `robustness`, which compares site choices across scenarios, and `settings`. |
| `validation.json` | `targets` (reported figures with sources), and `scenarios`, which holds each target's model value and ratio plus `mean_abs_log_ratio`. Also `closest`, and `series`, which gives `years`, `tonnes` and `cumulative_tonnes` per scenario. |
| `fit_report.json` | The lifetime fit: `beta`, `alpha`, `n_poas`, `rmse`, `f15`, `cutoff`, `states`, `filters` and `grid` (β against RMSE). Also `sensitivity` (one row per run), `cross_check` (replacement share of installs by state and year) and `poas`, which gives the observed and modelled excess per fitted postal area. |
| `cohorts.json` | `years` (install years, 2001 to 2026), `provisional_from` (the first provisional month), `installs` (`{poa_code: [installs per year]}`) and `houses` (`{poa_code: occupied separate houses, Census 2021}`). |
| `materials.json` | Tonnes of each material in panels retiring 2026 to 2035, with arrays in `keys` order: glass, aluminium, polymer, silicon, copper, tin and lead, and silver. Also holds `national`, `poa` and `sites` per scenario, plus `shares` (column [40] of the composition table in [21]), `silver_value_share` (IRENA and IEA-PVPS 2016, Figure 24) and `source`. |
| `assumptions.json` | `scenarios` (β, α, source), `default_scenario`, `panel_table` (watts, kg per panel and kg per kW by install year, with source), `settings`, `data_sources` (publisher, URL, licence, attribution) and `references` (the numbered works cited). |
