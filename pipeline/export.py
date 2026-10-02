"""Stage export: write the static site's data files to web/public/data/ (schemas in README, "Web data")."""
import json
import shutil

import pandas as pd

from pipeline.config import (CANDIDATE_TYPES, COVERAGE_RADIUS_KM, DATA_SOURCES, DEFAULT_SCENARIO, DEMAND_YEARS,
                             FIT_MAX_MEAN_KW, FIT_MIN_HOUSES, FORECAST_YEARS, INTERIM, MIN_SITES_PER_STATE, N_SITES,
                             PANEL_TABLE, PANEL_TABLE_SOURCE, POA_GEOJSON_MAX_MB, PROCESSED, PROVISIONAL_MONTHS, QA,
                             REFERENCES, WEB_DATA, WEB_DATA_MAX_MB)
from pipeline.retirement import scenario_params


def _write(name: str, obj) -> None:
    (WEB_DATA / name).write_text(json.dumps(obj, separators=(",", ":"), allow_nan=False))


def retirements_json(ret: pd.DataFrame) -> dict:
    """scenario -> year -> poa_code -> tonnes (0.1 t); POAs rounding to 0 are left out."""
    ret = ret.assign(tonnes=ret["tonnes"].round(1))
    ret = ret[ret["tonnes"] > 0]
    return {scen: {str(y): dict(zip(g["poa_code"], g["tonnes"])) for y, g in sg.groupby("year")}
            for scen, sg in ret.groupby("scenario")}


def cohorts_json(cohorts: pd.DataFrame, poa: pd.DataFrame) -> dict:
    """Installs per POA per install year, plus houses per POA for the postcode panel."""
    wide = (cohorts.assign(year=cohorts["year_month"].dt.year).pivot_table(
        index="poa_code", columns="year", values="installs", aggfunc="sum", fill_value=0))
    return {"years": [int(y) for y in wide.columns],
            "provisional_from": cohorts.loc[cohorts["provisional"], "year_month"].min().strftime("%Y-%m"),
            "installs": {p: row.tolist() for p, row in zip(wide.index, wide.to_numpy().astype(int))},
            "houses": dict(zip(poa["poa_code"], poa["houses"].astype(int).tolist()))}


def assumptions_json() -> dict:
    """Every assumption the UI shows, with its source."""
    first = [2001] + [row[0] + 1 for row in PANEL_TABLE[:-1]]
    return {
        "scenarios": [{"name": k, **v} for k, v in scenario_params().items()],
        "default_scenario": DEFAULT_SCENARIO,
        "panel_table": {"source": PANEL_TABLE_SOURCE, "rows": [
            {"from_year": f, "to_year": None if last == 9999 else last, "watts_per_panel": w, "kg_per_panel": kg,
             "kg_per_kw": round(kg * 1000 / w, 1)} for f, (last, w, kg) in zip(first, PANEL_TABLE)]},
        "settings": [
            {"name": "Forecast years", "value": list(FORECAST_YEARS), "source": "PanelPath setting"},
            {"name": "Demand years for siting", "value": list(DEMAND_YEARS), "source": "PanelPath setting"},
            {"name": "Collection sites", "value": N_SITES, "source": "Pilot target of about 100 sites"},
            {"name": "Coverage radius (km, straight line)", "value": COVERAGE_RADIUS_KM, "source": "PanelPath setting"},
            {"name": "Minimum sites per state", "value": MIN_SITES_PER_STATE, "source": "PanelPath setting"},
            {"name": "Candidate facility types", "value": list(CANDIDATE_TYPES),
             "source": "Geoscience Australia facility types where public drop-off is plausible"},
            {"name": "Lifetime fit: minimum houses per postcode", "value": FIT_MIN_HOUSES, "source": "PanelPath setting"},
            {"name": "Lifetime fit: maximum mean system size (kW)", "value": FIT_MAX_MEAN_KW,
             "source": "PanelPath setting, excludes business-heavy postcodes"},
            {"name": "Provisional months (late registrations)", "value": PROVISIONAL_MONTHS,
             "source": "PanelPath setting"},
        ],
        "data_sources": DATA_SOURCES,
        "references": {str(n): {"title": t, "url": u} for n, (t, u) in REFERENCES.items()},
        "qa": qa_json(),
    }


def qa_json() -> dict:
    """Data-quality figures quoted on the method page (limitations)."""
    cer = pd.read_parquet(INTERIM / "cer_installs.parquet")
    unmatched = pd.read_csv(QA / "unmatched_postcodes.csv", dtype={"postcode": str})
    cand = pd.read_parquet(INTERIM / "candidates.parquet", columns=["spatial_confidence"])
    return {"unmatched_postcodes": int(len(unmatched)), "unmatched_installs": int(unmatched["installs"].sum()),
            "unmatched_kw_pct": round(100 * float(unmatched["kw"].sum() / cer["kw"].sum()), 3),
            "candidate_sites": int(len(cand)),
            "candidate_sites_town_centre": int((cand["spatial_confidence"].astype(str) == "1").sum()),
            "first_install_month": cer["year_month"].min().strftime("%Y-%m"),
            "last_install_month": cer["year_month"].max().strftime("%Y-%m")}


def run() -> None:
    """Write all web data files and check them against the size budgets."""
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    shutil.copy(INTERIM / "poa_simplified.geojson", WEB_DATA / "poa.geojson")
    for name in ["coverage.json", "validation.json", "fit_report.json",
                 *(p.name for p in PROCESSED.glob("sites_*.geojson"))]:
        shutil.copy(PROCESSED / name, WEB_DATA / name)
    poa = pd.read_parquet(INTERIM / "poa.parquet")
    _write("retirements.json", retirements_json(pd.read_parquet(PROCESSED / "retirements.parquet")))
    _write("cohorts.json", cohorts_json(pd.read_parquet(INTERIM / "cohorts.parquet"), poa))
    (WEB_DATA / "assumptions.json").write_text(json.dumps(assumptions_json(), indent=2, ensure_ascii=False, allow_nan=False) + "\n")

    sizes = {p.name: p.stat().st_size / 1e6 for p in sorted(WEB_DATA.iterdir()) if p.is_file()}
    for name, mb in sizes.items():
        print(f"{mb:7.2f} MB  {name}")
    total = sum(sizes.values())
    print(f"{total:7.2f} MB  total (budget {WEB_DATA_MAX_MB} MB) -> {WEB_DATA}")
    if total > WEB_DATA_MAX_MB or sizes["poa.geojson"] > POA_GEOJSON_MAX_MB:
        raise ValueError("web data over budget")
