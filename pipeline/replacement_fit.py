"""Stage fit: infer the retirement scale beta from POAs with more installs than houses (CONTEXT §6.4).

Where installs exceed the dwellings available, the excess E = installs - dwellings is read as replacements.
Modelled replacements R(beta) = sum over cohorts of installs x F(age at cutoff), assuming each retirement
triggers one new install. beta is grid-searched to minimise sum (E - R)^2 with alpha fixed.
"""
import json
from datetime import date

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from pipeline.config import (FIGURES, FIT_ALPHA, FIT_BETA_GRID, FIT_CROSS_CHECK_YEARS, FIT_CUTOFF, FIT_MAX_MEAN_KW,
                             FIT_MEAN_KW_YEARS, FIT_MIN_HOUSES, FIT_SENSITIVITY_CUTOFFS, FIT_SENSITIVITY_MAX_MEAN_KW,
                             INTERIM, PROCESSED, SCENARIO_COLORS, SCENARIOS)
from pipeline.retirement import mid_year, retired_share, weibull_cdf

INK, MUTED, GRID, SURFACE = "#0b0b0b", "#52514e", "#e4e3df", "#fcfcfb"


def decimal_year(d: date) -> float:
    """Decimal year at the start of a date, e.g. 10 Aug 2021 -> 2021.6055."""
    return d.year + (d.timetuple().tm_yday - 1) / 365.25


def default_cutoff(cohorts: pd.DataFrame) -> date:
    """End of the last non-provisional month (the first day of the month after it)."""
    last = cohorts.loc[~cohorts["provisional"], "year_month"].max()
    return (last + pd.DateOffset(months=1)).date()


def fit(cohorts: pd.DataFrame, poa: pd.DataFrame, cutoff: date, dwellings: pd.Series,
        max_mean_kw: float = FIT_MAX_MEAN_KW, alpha: float = FIT_ALPHA) -> dict:
    """Grid-search beta on full POAs. `dwellings` is the denominator per POA, indexed like `poa`."""
    cut = decimal_year(cutoff)
    mid = mid_year(cohorts["year_month"])
    before = cohorts[mid < cut].assign(age=cut - mid[mid < cut])
    installs = before.groupby("poa_code")["installs"].sum().reindex(poa["poa_code"]).fillna(0).to_numpy()
    window = cohorts[cohorts["year_month"].dt.year.between(*FIT_MEAN_KW_YEARS)].groupby("poa_code")[["kw", "installs"]].sum()
    mean_kw = (window["kw"] / window["installs"]).reindex(poa["poa_code"]).to_numpy()

    keep = (dwellings.to_numpy() >= FIT_MIN_HOUSES) & (mean_kw <= max_mean_kw) & (installs > dwellings.to_numpy())
    codes = poa["poa_code"].to_numpy()[keep]
    excess = installs[keep] - dwellings.to_numpy()[keep]
    sub = before[before["poa_code"].isin(codes)]
    idx = pd.Categorical(sub["poa_code"], categories=codes).codes

    betas = np.arange(FIT_BETA_GRID[0], FIT_BETA_GRID[1] + FIT_BETA_GRID[2] / 2, FIT_BETA_GRID[2])
    modelled = np.array([np.bincount(idx, weights=sub["installs"].to_numpy() * weibull_cdf(sub["age"].to_numpy(), b, alpha),
                                     minlength=len(codes)) for b in betas])
    sse = ((modelled - excess) ** 2).sum(axis=1)
    best = int(np.argmin(sse)) if len(codes) else None
    beta = float(betas[best]) if best is not None else None
    return {
        "cutoff": cutoff.isoformat(), "n_poas": int(len(codes)), "beta": beta, "alpha": alpha,
        "rmse": float(np.sqrt(sse[best] / len(codes))) if best is not None else None,
        "f15": float(weibull_cdf(15.0, beta, alpha)) if beta else None,
        "at_grid_edge": best in (0, len(betas) - 1),
        "states": poa.loc[keep, "state"].value_counts().to_dict(),
        "grid": {"beta": betas.tolist(), "rmse": np.sqrt(sse / max(len(codes), 1)).round(3).tolist()},
        "poas": {"poa_code": codes.tolist(), "excess": excess.tolist(),
                 "modelled": modelled[best].round(2).tolist() if best is not None else []},
    }


def replacement_share(cohorts: pd.DataFrame, poa: pd.DataFrame, years: tuple, betas: dict,
                      alpha: float = FIT_ALPHA) -> pd.DataFrame:
    """Implied replacements as a share of installs per state and year, one column per named beta."""
    yrs = np.array(years)
    state = cohorts["poa_code"].map(poa.set_index("poa_code")["state"]).to_numpy()
    new = cohorts["year_month"].dt.year.isin(yrs).to_numpy()
    out = (cohorts[new].groupby([state[new], cohorts.loc[new, "year_month"].dt.year.to_numpy()])["installs"].sum()
           .rename_axis(["state", "year"]).to_frame())
    for name, b in betas.items():
        rep = retired_share(mid_year(cohorts["year_month"]), yrs, b, alpha) * cohorts["installs"].to_numpy()[:, None]
        out[f"replacements_{name}"] = pd.DataFrame(rep, columns=yrs).groupby(state).sum().stack().rename_axis(["state", "year"])
    out = pd.concat([out, pd.concat({"AUS": out.groupby(level="year").sum()}, names=["state"])])
    for name in betas:
        out[f"share_{name}"] = out[f"replacements_{name}"] / out["installs"]
    return out.reset_index()


def plot(main: dict, path) -> None:
    """Left: observed vs modelled excess per POA at the fitted beta. Right: RMSE across the beta grid."""
    fig, (a, b) = plt.subplots(1, 2, figsize=(13, 5.2), dpi=200, facecolor=SURFACE)
    e, m = np.array(main["poas"]["excess"]), np.array(main["poas"]["modelled"])
    top = 1.05 * max(e.max(), m.max())
    a.plot([0, top], [0, top], color=MUTED, lw=1, ls="--")
    a.annotate("1:1", (top, top), xytext=(-4, -12), textcoords="offset points", ha="right", fontsize=8.5, color=MUTED)
    a.scatter(m, e, s=28, color=INK, alpha=0.75, edgecolor=SURFACE, linewidth=0.8, zorder=3)
    a.set_xlim(0, top), a.set_ylim(0, top)
    a.set_title(f"Excess installs per postcode, {main['n_poas']} full POAs", loc="left", fontsize=12, color=INK)
    a.set_xlabel(f"Modelled replacements R(β = {main['beta']:g}) (systems)", color=MUTED)
    a.set_ylabel("Observed excess: installs − houses (systems)", color=MUTED)

    b.plot(main["grid"]["beta"], main["grid"]["rmse"], color=INK, lw=2)
    for name, beta in [("FITTED", main["beta"]), ("AU_RES", SCENARIOS["AU_RES"]["beta"]),
                       ("INTL", SCENARIOS["INTL_EARLY"]["beta"])]:
        b.axvline(beta, color=SCENARIO_COLORS.get(name, SCENARIO_COLORS["INTL_EARLY"]), lw=2)
        b.annotate(f"{name} β = {beta:g}", (beta, max(main["grid"]["rmse"])), xytext=(4, -4), textcoords="offset points",
                   va="top", fontsize=8.5, color=INK, rotation=90)
    b.set_title("Fit error across lifetimes", loc="left", fontsize=12, color=INK)
    b.set_xlabel("Weibull scale β (years), α fixed at 2.4928", color=MUTED)
    b.set_ylabel("RMSE of excess (systems per POA)", color=MUTED)
    b.set_ylim(0, None)
    for ax in (a, b):
        ax.set_facecolor(SURFACE)
        ax.grid(color=GRID, lw=0.8)
        ax.tick_params(colors=MUTED, labelsize=9)
        for side in ("top", "right"):
            ax.spines[side].set_visible(False)
        for side in ("left", "bottom"):
            ax.spines[side].set_color(GRID)
    fig.text(0.01, 0.01, f"Installs counted to {main['cutoff']} (CER), separate houses from Census 2021 (ABS G36). "
             f"POAs with ≥{FIT_MIN_HOUSES} houses, mean system ≤{FIT_MAX_MEAN_KW:g} kW in "
             f"{FIT_MEAN_KW_YEARS[0]}-{FIT_MEAN_KW_YEARS[1]}, and more installs than houses.", fontsize=8, color=MUTED)
    fig.tight_layout(rect=(0, 0.03, 1, 1))
    fig.savefig(path, facecolor=SURFACE)
    plt.close(fig)


def _summary(r: dict, **labels) -> dict:
    return {**labels, **{k: r[k] for k in ("cutoff", "n_poas", "beta", "rmse", "f15", "at_grid_edge", "states")}}


def run() -> None:
    """Fit beta, run sensitivities and the state cross-check, write fit_report.json and the fit chart."""
    cohorts = pd.read_parquet(INTERIM / "cohorts.parquet")
    poa = pd.read_parquet(INTERIM / "poa.parquet")
    cutoff = FIT_CUTOFF or default_cutoff(cohorts)
    main = fit(cohorts, poa, cutoff, poa["houses"])

    sens = [_summary(main, name="main", denominator="houses", max_mean_kw=FIT_MAX_MEAN_KW)]
    for c in FIT_SENSITIVITY_CUTOFFS:
        sens.append(_summary(fit(cohorts, poa, c, poa["houses"]), name=f"cutoff {c}", denominator="houses",
                             max_mean_kw=FIT_MAX_MEAN_KW))
    sens.append(_summary(fit(cohorts, poa, cutoff, poa["houses"] + poa["semis"]), name="houses + semis",
                         denominator="houses + semis", max_mean_kw=FIT_MAX_MEAN_KW))
    for kw in FIT_SENSITIVITY_MAX_MEAN_KW:
        sens.append(_summary(fit(cohorts, poa, cutoff, poa["houses"], max_mean_kw=kw), name=f"max mean {kw:g} kW",
                             denominator="houses", max_mean_kw=kw))

    cross = replacement_share(cohorts, poa, FIT_CROSS_CHECK_YEARS,
                              {"FITTED": main["beta"], "AU_RES": SCENARIOS["AU_RES"]["beta"]})
    report = {**{k: v for k, v in main.items() if k != "poas"},
              "denominator": "houses",
              "filters": {"min_dwellings": FIT_MIN_HOUSES, "max_mean_kw": FIT_MAX_MEAN_KW,
                          "mean_kw_years": list(FIT_MEAN_KW_YEARS)},
              "sensitivity": sens,
              "cross_check": cross.round(4).to_dict(orient="records"),
              "cross_check_reference": "over a third of new installs in some states are replacements [12]",
              "poas": main["poas"]}
    PROCESSED.mkdir(parents=True, exist_ok=True)
    (PROCESSED / "fit_report.json").write_text(json.dumps(report, indent=2) + "\n")
    FIGURES.mkdir(parents=True, exist_ok=True)
    plot(main, FIGURES / "fit_excess_vs_model.png")

    print(pd.DataFrame(sens).drop(columns="states").to_string(index=False))
    print("states in main fit:", main["states"])
    print("implied replacement share of installs (2025 includes provisional months Sep-Dec):")
    print(cross.pivot(index="state", columns="year", values=["share_FITTED", "share_AU_RES"]).round(3).to_string())
    print(f"wrote {PROCESSED / 'fit_report.json'} and {FIGURES / 'fit_excess_vs_model.png'}")
