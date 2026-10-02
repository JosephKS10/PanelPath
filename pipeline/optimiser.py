"""Stage optimise: choose N_SITES collection sites that cover the most 2026-2030 tonnes (MCLP, CONTEXT §6.5).

A site covers a POA if the POA centroid is within COVERAGE_RADIUS_KM (straight line, EPSG:3577). Greedy is
seeded with each state's best MIN_SITES_PER_STATE sites; PuLP/CBC solves the same problem exactly as a check.
The baseline runs the same greedy with candidates restricted to capital cities.
"""
import json
import time

import geopandas as gpd
import numpy as np
import pandas as pd
import pulp
from scipy.sparse import csr_matrix
from scipy.spatial import cKDTree

from pipeline import facilities
from pipeline.config import (COVERAGE_RADIUS_KM, CRS_METRIC, CRS_STORE, DEFAULT_SCENARIO, DEMAND_YEARS,
                             EXACT_SOLVER_TIME_LIMIT_S, INTERIM, MIN_SITES_PER_STATE, N_SITES, OPTIMISER_SCENARIOS,
                             PROCESSED, SITE_YEARS)


def coverage_matrix(site_xy: np.ndarray, demand_xy: np.ndarray, radius: float) -> csr_matrix:
    """Sparse 0/1 matrix (sites x demand points), 1 where the distance is at most radius."""
    hits = cKDTree(demand_xy).query_ball_point(site_xy, r=radius)
    rows = np.repeat(np.arange(len(hits)), [len(h) for h in hits])
    cols = np.concatenate([np.asarray(h, dtype=int) for h in hits]) if len(rows) else np.array([], int)
    return csr_matrix((np.ones(len(rows)), (rows, cols)), shape=(len(site_xy), len(demand_xy)))


def greedy(cover: csr_matrix, weights: np.ndarray, site_state: np.ndarray, n_sites: int,
           min_per_state: int) -> list[int]:
    """Seed each state with its best min_per_state sites, then keep adding the site that covers most uncovered weight."""
    uncovered = weights.astype(float).copy()
    chosen: list[int] = []

    def pick(allowed: np.ndarray) -> None:
        gain = cover @ uncovered
        gain[~allowed] = -1
        gain[chosen] = -1
        j = int(np.argmax(gain))
        chosen.append(j)
        uncovered[cover[j].indices] = 0

    for s in sorted(set(site_state)):
        in_state = site_state == s
        for _ in range(min(min_per_state, int(in_state.sum()))):
            pick(in_state)
    while len(chosen) < min(n_sites, cover.shape[0]):
        pick(np.ones(cover.shape[0], bool))
    return chosen


def exact(cover: csr_matrix, weights: np.ndarray, site_state: np.ndarray, n_sites: int, min_per_state: int,
          time_limit: int = EXACT_SOLVER_TIME_LIMIT_S) -> dict:
    """Solve the same covering problem with PuLP/CBC. Returns chosen sites, objective and solver status."""
    prob = pulp.LpProblem("mclp", pulp.LpMaximize)
    x = [pulp.LpVariable(f"x{j}", cat="Binary") for j in range(cover.shape[0])]
    by_demand = cover.tocsc()
    coverable = np.flatnonzero(np.diff(by_demand.indptr) > 0)
    y = {i: pulp.LpVariable(f"y{i}", 0, 1) for i in coverable}
    prob += pulp.lpSum(float(weights[i]) * y[i] for i in coverable)
    for i in coverable:
        prob += y[i] <= pulp.lpSum(x[j] for j in by_demand.indices[by_demand.indptr[i]:by_demand.indptr[i + 1]])
    prob += pulp.lpSum(x) == min(n_sites, len(x))
    for s in sorted(set(site_state)):
        idx = np.flatnonzero(site_state == s)
        prob += pulp.lpSum(x[j] for j in idx) >= min(min_per_state, len(idx))
    t0 = time.time()
    prob.solve(pulp.PULP_CBC_CMD(msg=False, timeLimit=time_limit))
    return {"chosen": [j for j, v in enumerate(x) if v.value() > 0.5], "objective": float(pulp.value(prob.objective)),
            "status": pulp.LpStatus[prob.status], "solution": pulp.LpSolution[prob.sol_status],
            "seconds": round(time.time() - t0, 1)}


def evaluate(site_xy: np.ndarray, demand_xy: np.ndarray, weights: np.ndarray, radius: float) -> dict:
    """Share of weight within radius of a site, and weight-averaged distance to the nearest site."""
    dist, _ = cKDTree(site_xy).query(demand_xy)
    covered = dist <= radius
    return {"sites": int(len(site_xy)), "covered_tonnes": float(weights[covered].sum()),
            "covered_pct": float(100 * weights[covered].sum() / weights.sum()),
            "covered_poas": int(covered.sum()),
            "mean_distance_km": float((dist * weights).sum() / weights.sum() / 1000)}


def _str(v) -> str | None:
    """Missing text as None (JSON null) rather than NaN."""
    return None if pd.isna(v) else str(v)


def site_features(sites: gpd.GeoDataFrame, chosen: list[int], demand_xy: np.ndarray, poa_codes: np.ndarray,
                  tonnes: np.ndarray, panels: np.ndarray, radius: float) -> list[dict]:
    """GeoJSON features for chosen sites; each covered POA is assigned to its nearest chosen site."""
    picked = sites.iloc[chosen]
    xy = np.c_[picked.geometry.x, picked.geometry.y]
    dist, nearest = cKDTree(xy).query(demand_xy)
    nearest = np.where(dist <= radius, nearest, -1)
    lonlat = picked.to_crs(CRS_STORE).geometry
    feats = []
    for k, (row, pt) in enumerate(zip(picked.itertuples(), lonlat)):
        mine = nearest == k
        feats.append({"type": "Feature",
                      "geometry": {"type": "Point", "coordinates": [round(pt.x, 5), round(pt.y, 5)]},
                      "properties": {"rank": k + 1, "id": row.id, "name": row.name, "owner": _str(row.owner),
                                     "type": row.type, "state": row.state, "suburb": _str(row.suburb),
                                     "in_capital": bool(row.in_capital),
                                     "tonnes": tonnes[mine].sum(axis=0).round(1).tolist(),
                                     "panels": panels[mine].sum(axis=0).round(0).astype(int).tolist(),
                                     "poas": poa_codes[mine].tolist()}})
    return feats


def run() -> None:
    """Optimise sites per scenario, compare with capitals-only and exact, write sites_<scenario>.geojson and coverage.json."""
    poa = pd.read_parquet(INTERIM / "poa.parquet")
    ret = pd.read_parquet(PROCESSED / "retirements.parquet")
    sites = facilities.candidates()
    sites.to_parquet(INTERIM / "candidates.parquet")

    demand = gpd.GeoSeries(gpd.points_from_xy(poa["lon"], poa["lat"]), crs=CRS_STORE).to_crs(CRS_METRIC)
    demand_xy = np.c_[demand.x, demand.y]
    site_xy = np.c_[sites.geometry.x, sites.geometry.y]
    radius = COVERAGE_RADIUS_KM * 1000
    cover = coverage_matrix(site_xy, demand_xy, radius)
    state = sites["state"].to_numpy()
    cap_idx = np.flatnonzero(sites["in_capital"].to_numpy())
    site_years = list(range(SITE_YEARS[0], SITE_YEARS[1] + 1))
    print(f"coverage sets: {len(sites):,} candidates x {len(poa):,} POAs, {cover.nnz:,} site-POA pairs within "
          f"{COVERAGE_RADIUS_KM:g} km; POAs reachable by any candidate: {(cover.sum(axis=0).A1 > 0).sum():,}")

    out, chosen_by = {}, {}
    for scen in OPTIMISER_SCENARIOS:
        r = ret[ret["scenario"] == scen]
        if r.empty:
            print(f"{scen}: no retirements yet, skipped")
            continue
        wide = {m: r.pivot(index="poa_code", columns="year", values=m).reindex(poa["poa_code"]).fillna(0)
                for m in ("tonnes", "panels")}
        w = wide["tonnes"].loc[:, DEMAND_YEARS[0]:DEMAND_YEARS[1]].sum(axis=1).to_numpy()

        t0 = time.time()
        chosen = greedy(cover, w, state, N_SITES, MIN_SITES_PER_STATE)
        greedy_s = time.time() - t0
        cap_chosen = cap_idx[greedy(cover[cap_idx], w, state[cap_idx], N_SITES, MIN_SITES_PER_STATE)]
        ex = exact(cover, w, state, N_SITES, MIN_SITES_PER_STATE)
        opt, cap = evaluate(site_xy[chosen], demand_xy, w, radius), evaluate(site_xy[cap_chosen], demand_xy, w, radius)
        ex_eval = evaluate(site_xy[ex["chosen"]], demand_xy, w, radius)
        chosen_by[scen] = chosen
        out[scen] = {
            "demand_tonnes": float(w.sum()), "optimised": opt, "capitals_only": cap,
            "exact": {**{k: v for k, v in ex.items() if k != "chosen"}, **ex_eval,
                      "greedy_vs_exact_pct": float(100 * opt["covered_tonnes"] / ex_eval["covered_tonnes"])},
            "greedy_seconds": round(greedy_s, 2),
            "sites_by_state": pd.Series(state[chosen]).value_counts().sort_index().to_dict(),
        }
        feats = site_features(sites, chosen, demand_xy, poa["poa_code"].to_numpy(),
                              wide["tonnes"][site_years].to_numpy(), wide["panels"][site_years].to_numpy(), radius)
        (PROCESSED / f"sites_{scen}.geojson").write_text(json.dumps(
            {"type": "FeatureCollection", "years": site_years, "features": feats}, allow_nan=False) + "\n")
        print(f"\n{scen}: demand {w.sum():,.0f} t retiring {DEMAND_YEARS[0]}-{DEMAND_YEARS[1]}")
        print(f"  optimised     {opt['covered_pct']:5.1f}% covered, mean distance {opt['mean_distance_km']:6.1f} km "
              f"(greedy {greedy_s:.2f} s)")
        print(f"  capitals only {cap['covered_pct']:5.1f}% covered, mean distance {cap['mean_distance_km']:6.1f} km")
        print(f"  exact (CBC)   {ex_eval['covered_pct']:5.1f}% covered, {ex['status']} / {ex['solution']} in "
              f"{ex['seconds']} s; greedy reaches {out[scen]['exact']['greedy_vs_exact_pct']:.2f}% of exact")
        print(f"  sites by state {out[scen]['sites_by_state']}")

    if {DEFAULT_SCENARIO, "FITTED"} <= set(chosen_by):
        r = ret[ret["scenario"] == "FITTED"]
        w_fit = (r[r["year"].between(*DEMAND_YEARS)].groupby("poa_code")["tonnes"].sum()
                 .reindex(poa["poa_code"]).fillna(0).to_numpy())
        cross = evaluate(site_xy[chosen_by[DEFAULT_SCENARIO]], demand_xy, w_fit, radius)
        out["robustness"] = {
            "shared_sites": len(set(chosen_by[DEFAULT_SCENARIO]) & set(chosen_by["FITTED"])),
            f"{DEFAULT_SCENARIO}_sites_under_FITTED_demand_pct": cross["covered_pct"],
            "FITTED_sites_under_FITTED_demand_pct": out["FITTED"]["optimised"]["covered_pct"]}
        print(f"\nrobustness: {out['robustness']}")

    out["settings"] = {"default_scenario": DEFAULT_SCENARIO, "n_sites": N_SITES, "radius_km": COVERAGE_RADIUS_KM,
                       "min_sites_per_state": MIN_SITES_PER_STATE, "demand_years": list(DEMAND_YEARS),
                       "candidates": int(len(sites)), "capital_candidates": int(len(cap_idx)),
                       "distance": "straight line between POA centroid and site (EPSG:3577)",
                       "mean_distance": "tonne-weighted, every POA to its nearest chosen site"}
    (PROCESSED / "coverage.json").write_text(json.dumps(out, indent=2, allow_nan=False) + "\n")
    print(f"wrote {PROCESSED / 'coverage.json'} and sites_<scenario>.geojson")
