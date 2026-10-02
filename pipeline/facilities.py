"""Candidate collection sites from GA's Waste Management Facilities Database (CONTEXT §6.5)."""
import geopandas as gpd
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree

from pipeline.config import CANDIDATE_TYPES, CAPITAL_GCCSA, CRS_METRIC, QA, RAW, SITE_DEDUPE_M
from pipeline.geography import read_shp


def merge_nearby(xy: np.ndarray, radius: float) -> np.ndarray:
    """Cluster label per point, joining points closer than radius (chains of close points merge too)."""
    pairs = cKDTree(xy).query_pairs(radius, output_type="ndarray")
    graph = coo_matrix((np.ones(len(pairs)), (pairs[:, 0], pairs[:, 1])), shape=(len(xy), len(xy)))
    return connected_components(graph, directed=False)[1]


def candidates() -> gpd.GeoDataFrame:
    """Operational facilities of CANDIDATE_TYPES, merged within SITE_DEDUPE_M, in EPSG:3577.

    Columns: id, name, owner, type (all types at the merged site), state, suburb, spatial_confidence, in_capital.
    """
    g = gpd.read_file(RAW / "ga_waste_facilities.geojson")
    g = g[g["FACILITY_INFRASTRUCTURE_TYPE"].isin(CANDIDATE_TYPES)]
    QA.mkdir(parents=True, exist_ok=True)
    closed = g[g["OPERATIONAL_STATUS"] != "OPERATIONAL"]
    closed.drop(columns="geometry").to_csv(QA / "facilities_closed.csv", index=False)
    g = g[g["OPERATIONAL_STATUS"] == "OPERATIONAL"].to_crs(CRS_METRIC).reset_index(drop=True)

    g["cluster"] = merge_nearby(np.c_[g.geometry.x, g.geometry.y], SITE_DEDUPE_M)
    g["rank"] = g["FACILITY_INFRASTRUCTURE_TYPE"].map({t: i for i, t in enumerate(CANDIDATE_TYPES)})
    g = g.sort_values(["cluster", "rank"])  # each merged site keeps its highest-ranked record, listing all types
    types = g.groupby("cluster")["FACILITY_INFRASTRUCTURE_TYPE"].agg(lambda s: "; ".join(dict.fromkeys(s)))
    first = g.drop_duplicates("cluster").set_index("cluster")
    sites = gpd.GeoDataFrame({
        "id": first["UNIQUE_RECORD_ID"], "name": first["FACILITY_NAME"].str.title(),
        "owner": first["FACILITY_OWNER"].str.title(), "type": types, "state": first["STATE"],
        "suburb": first["SUBURB"].str.title(), "spatial_confidence": first["SPATIAL_CONFIDENCE"],
    }, geometry=first.geometry, crs=CRS_METRIC).reset_index(drop=True)

    gcc = read_shp("GCCSA_2021_AUST_SHP_GDA2020.zip", "GCCSA_2021_AUST_GDA2020.shp")
    capitals = gcc[gcc["GCC_CODE21"].isin(CAPITAL_GCCSA)].to_crs(CRS_METRIC)
    inside = gpd.sjoin(sites[["geometry"]], capitals[["geometry"]], predicate="within").index
    sites["in_capital"] = sites.index.isin(inside)
    print(f"candidates: {len(g):,} operational facility records -> {len(sites):,} sites after merging within "
          f"{SITE_DEDUPE_M:g} m ({sites['in_capital'].sum():,} in capital cities); closed dropped: {len(closed)} "
          f"-> {QA / 'facilities_closed.csv'}")
    return sites
