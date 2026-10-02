"""Stage geography: POA polygons, state, capital flag and Census dwellings -> data/interim/poa.parquet.

Full-resolution polygons stay in the raw ABS zip (read_shp); only the simplified web copy is written.
"""
import io
import zipfile

import geopandas as gpd
import pandas as pd
import shapely

from pipeline.config import (CAPITAL_GCCSA, CENSUS_G36, CENSUS_HOUSES_COL, CENSUS_SEMIS_COL, CRS_METRIC, CRS_STORE,
                             GEOJSON_DECIMALS, INTERIM, POA_GEOJSON_MAX_MB, POA_SIMPLIFY_M, POA_STATE_OVERRIDES, QA, RAW,
                             STATE_ABBR)


def read_shp(zip_name: str, shp: str) -> gpd.GeoDataFrame:
    """Read a shapefile straight out of a raw ABS zip."""
    return gpd.read_file(f"zip://{RAW / zip_name}!{shp}")


def read_poa() -> gpd.GeoDataFrame:
    """Full-resolution POA 2021 polygons (GDA2020) as (poa_code, geometry), including null-geometry rows."""
    poa = read_shp("POA_2021_AUST_GDA2020_SHP.zip", "POA_2021_AUST_GDA2020.shp")
    return poa[["POA_CODE21", "POA_NAME21", "geometry"]].rename(columns={"POA_CODE21": "poa_code"})


def largest_overlap(polys: gpd.GeoSeries, regions: gpd.GeoDataFrame, code_col: str) -> pd.Series:
    """Code of the region each polygon overlaps most (NaN if none). Both inputs must share a metric CRS."""
    pairs = gpd.sjoin(gpd.GeoDataFrame(geometry=polys), regions[[code_col, "geometry"]].reset_index(drop=True),
                      predicate="intersects")
    pairs["area"] = 1.0
    multi = pairs.index.duplicated(keep=False)  # only polygons touching 2+ regions need real areas
    right = regions.geometry.reset_index(drop=True).loc[pairs["index_right"][multi]].values
    pairs.loc[multi, "area"] = shapely.area(shapely.intersection(pairs.geometry.values[multi], right))
    return pairs.sort_values("area").groupby(level=0)[code_col].last().reindex(polys.index)


def read_dwellings() -> pd.DataFrame:
    """Occupied private dwellings per POA from Census 2021 G36: poa_code, houses, semis."""
    with zipfile.ZipFile(RAW / "2021_GCP_POA_for_AUS_short-header.zip") as z:
        g36 = pd.read_csv(io.BytesIO(z.read(CENSUS_G36)),
                          usecols=["POA_CODE_2021", CENSUS_HOUSES_COL, CENSUS_SEMIS_COL])
    return pd.DataFrame({"poa_code": g36["POA_CODE_2021"].str.removeprefix("POA"),
                         "houses": g36[CENSUS_HOUSES_COL], "semis": g36[CENSUS_SEMIS_COL]})


def run() -> None:
    """Build poa.parquet and the simplified web polygons, and log unmatched CER postcodes."""
    QA.mkdir(parents=True, exist_ok=True)
    poa = read_poa()
    no_geom = poa[poa.geometry.isna()]
    no_geom.drop(columns="geometry").to_csv(QA / "poa_no_geometry.csv", index=False)
    print(f"POAs without geometry dropped: {len(no_geom)} {no_geom['POA_NAME21'].tolist()}")
    poa = poa[poa.geometry.notna()].drop(columns="POA_NAME21").to_crs(CRS_METRIC).reset_index(drop=True)

    ste = read_shp("STE_2021_AUST_SHP_GDA2020.zip", "STE_2021_AUST_GDA2020.shp")
    gcc = read_shp("GCCSA_2021_AUST_SHP_GDA2020.zip", "GCCSA_2021_AUST_GDA2020.shp")
    ste, gcc = (g[g.geometry.notna()].to_crs(CRS_METRIC) for g in (ste, gcc))

    state_code = largest_overlap(poa.geometry, ste, "STE_CODE21")
    abbr_to_code = {v: k for k, v in STATE_ABBR.items()}
    state_code.update(poa["poa_code"].map(POA_STATE_OVERRIDES).map(abbr_to_code).dropna())
    # Capital flag: the GCCSA within the POA's own state that it overlaps most.
    gcc_code = pd.concat([largest_overlap(poa.geometry[state_code == s], gcc[gcc["STE_CODE21"] == s], "GCC_CODE21")
                          for s in state_code.dropna().unique()]).reindex(poa.index)

    centroids = poa.geometry.centroid.to_crs(CRS_STORE)
    out = pd.DataFrame({
        "poa_code": poa["poa_code"],
        "state": state_code.map(STATE_ABBR),
        "lon": centroids.x, "lat": centroids.y,
        "area_km2": poa.geometry.area / 1e6,
        "in_capital": gcc_code.isin(CAPITAL_GCCSA),
    }).merge(read_dwellings(), on="poa_code", how="left")
    missing = out[out[["state", "houses"]].isna().any(axis=1)]
    if len(missing):
        raise ValueError(f"POAs missing a state or Census dwellings: {missing['poa_code'].tolist()}")
    out[["houses", "semis"]] = out[["houses", "semis"]].astype("int64")
    out.to_parquet(INTERIM / "poa.parquet", index=False)

    # CER postcodes with no POA (PO boxes, large-volume receivers, 0000 = unknown).
    cer = pd.read_parquet(INTERIM / "cer_installs.parquet").groupby("postcode")[["installs", "kw"]].sum()
    unmatched = cer[~cer.index.isin(out["poa_code"])].sort_values("kw", ascending=False)
    unmatched.to_csv(QA / "unmatched_postcodes.csv")
    print(f"unmatched CER postcodes: {len(unmatched)} of {len(cer)}, "
          f"{unmatched['installs'].sum():,} installs, {unmatched['kw'].sum():,.0f} kW = "
          f"{unmatched['kw'].sum() / cer['kw'].sum():.3%} of national kW -> {QA / 'unmatched_postcodes.csv'}")

    # ponytail: per-polygon simplify leaves hairline gaps between neighbours; use mapshaper/topojson if visible.
    web = gpd.GeoDataFrame({"poa_code": out["poa_code"], "state": out["state"]},
                           geometry=poa.geometry.simplify(POA_SIMPLIFY_M), crs=CRS_METRIC).to_crs(CRS_STORE)
    path = INTERIM / "poa_simplified.geojson"
    path.unlink(missing_ok=True)
    web.to_file(path, driver="GeoJSON", COORDINATE_PRECISION=GEOJSON_DECIMALS)
    mb = path.stat().st_size / 1e6
    print(f"simplified polygons: {mb:.2f} MB (budget {POA_GEOJSON_MAX_MB} MB) -> {path}")
    if mb > POA_GEOJSON_MAX_MB:
        raise ValueError("simplified POA GeoJSON over budget; raise POA_SIMPLIFY_M")

    summary = out.groupby("state").agg(poas=("poa_code", "size"), capital_poas=("in_capital", "sum"),
                                       houses=("houses", "sum"), semis=("semis", "sum"))
    print(summary.to_string())
    print(f"POAs {len(out):,}, houses {out['houses'].sum():,}, semis {out['semis'].sum():,}, "
          f"capital POAs {out['in_capital'].sum():,}, area {out['area_km2'].sum():,.0f} km2")
