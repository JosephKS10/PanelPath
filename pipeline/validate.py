"""Stage validate: national retirements vs reported figures -> validation.json and validation_national.png."""
import json

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from pipeline.config import FIGURES, PROCESSED, SCENARIO_COLORS, SCENARIOS, UNIT_ERROR_RATIO, VALIDATION_TARGETS

INK, MUTED, GRID, SURFACE = "#0b0b0b", "#52514e", "#e4e3df", "#fcfcfb"


def add_cumulative(national: pd.DataFrame) -> pd.DataFrame:
    """Add cumulative tonnes and panels per scenario, counted from the first forecast year."""
    g = national.sort_values("year").groupby("scenario")
    return national.assign(cumulative_tonnes=g["tonnes"].cumsum(), cumulative_panels=g["panels"].cumsum())


def compare(national: pd.DataFrame) -> dict:
    """Model value, ratio to target and mean |log ratio| per scenario; lowest score is closest."""
    metric_col = {"annual_tonnes": "tonnes", "cumulative_tonnes": "cumulative_tonnes",
                  "cumulative_panels": "cumulative_panels"}
    out = {}
    for name, g in national.groupby("scenario"):
        g = g.set_index("year")
        rows = [{**t, "model": float(g.loc[t["year"], metric_col[t["metric"]]]),
                 "ratio": float(g.loc[t["year"], metric_col[t["metric"]]] / t["value"])} for t in VALIDATION_TARGETS]
        out[name] = {"targets": rows, "mean_abs_log_ratio": float(np.mean([abs(np.log(r["ratio"])) for r in rows])),
                     "worst_factor": float(max(max(r["ratio"], 1 / r["ratio"]) for r in rows))}
    return out


def plot(national: pd.DataFrame, path) -> None:
    """Two panels on a shared year axis: annual tonnes, and cumulative tonnes, each with reported figures."""
    fig, axes = plt.subplots(1, 2, figsize=(13, 5.2), dpi=200, facecolor=SURFACE)
    panels = [("tonnes", 1e3, "kt", "Tonnes retired per year (kt)", "Annual national panel waste", "annual_tonnes"),
              ("cumulative_tonnes", 1e6, "Mt", "Cumulative tonnes retired since 2015 (Mt)", "Cumulative panel waste",
               "cumulative_tonnes")]
    for ax, (col, scale, unit, ylabel, title, metric) in zip(axes, panels):
        ax.set_facecolor(SURFACE)
        for name in [s for s in SCENARIOS if s in set(national["scenario"])]:  # fixed colour order
            g = national[national["scenario"] == name].sort_values("year")
            ax.plot(g["year"], g[col] / scale, color=SCENARIO_COLORS[name], lw=2, label=name)
            ax.annotate(name, (g["year"].iloc[-1], g[col].iloc[-1] / scale), xytext=(6, 0),
                        textcoords="offset points", va="center", fontsize=8.5, color=INK)
        targets = [t for t in VALIDATION_TARGETS if t["metric"] == metric]
        for t in targets:
            lower = t.get("lower_bound", False)
            ax.scatter(t["year"], t["value"] / scale, s=90, color=INK, zorder=5, edgecolor=SURFACE, linewidth=2,
                       marker="^" if lower else "o")
            text = (f"Reported {'>' if lower else '~'}{t['value'] / scale:g} {unit} "
                    f"{'by' if metric.startswith('cumulative') else 'in'} {t['year']} {t['source']}")
            ax.annotate(text, (t["year"], t["value"] / scale), xytext=(-9, 0), textcoords="offset points",
                        ha="right", va="center", fontsize=8.5, color=INK)
        ax.set_title(title, loc="left", fontsize=12, color=INK)
        ax.set_xlabel("Calendar year", color=MUTED)
        ax.set_ylabel(ylabel, color=MUTED)
        ax.set_xlim(national["year"].min(), national["year"].max() + 3.5)  # room for end labels
        ax.set_ylim(0, 1.12 * max(national[col].max(), *(t["value"] for t in targets)) / scale)
        ax.grid(axis="y", color=GRID, lw=0.8)
        ax.tick_params(colors=MUTED, labelsize=9)
        for side in ("top", "right"):
            ax.spines[side].set_visible(False)
        for side in ("left", "bottom"):
            ax.spines[side].set_color(GRID)
    axes[1].legend(frameon=False, fontsize=9, loc="upper left", title="Retirement scenario", title_fontsize=9)
    fig.text(0.01, 0.01, "Model: CER small-scale solar installs by postcode (2001 to Aug 2026), Weibull retirement "
             "curves, install-year mass table. Triangle = reported lower bound.", fontsize=8, color=MUTED)
    fig.tight_layout(rect=(0, 0.03, 1, 1))
    fig.savefig(path, facecolor=SURFACE)
    plt.close(fig)


def run() -> None:
    """Write validation.json and the national validation chart, and print the comparison."""
    national = add_cumulative(pd.read_parquet(PROCESSED / "national_retirements.parquet"))
    result = compare(national)
    closest = min(result, key=lambda s: result[s]["mean_abs_log_ratio"])

    for name, r in result.items():
        cells = " | ".join(f"{t['metric']} {t['year']}: {t['model']:,.0f} ({t['ratio']:.2f}x)" for t in r["targets"])
        print(f"{name:13s} {cells} | mean |log ratio| {r['mean_abs_log_ratio']:.2f}")
    print(f"closest scenario: {closest}")
    if min(r["worst_factor"] for r in result.values()) > UNIT_ERROR_RATIO:
        print(f"WARNING: every scenario is more than {UNIT_ERROR_RATIO}x off a target; check kW vs MW and kg vs t")

    series = {name: {"years": g["year"].tolist(), "tonnes": g["tonnes"].round(1).tolist(),
                     "cumulative_tonnes": g["cumulative_tonnes"].round(1).tolist()}
              for name, g in national.sort_values("year").groupby("scenario")}
    out = {"targets": VALIDATION_TARGETS, "scenarios": result, "closest": closest, "series": series,
           "note": f"Cumulative figures count retirements from {national['year'].min()}."}
    (PROCESSED / "validation.json").write_text(json.dumps(out, indent=2, allow_nan=False) + "\n")
    FIGURES.mkdir(parents=True, exist_ok=True)
    plot(national, FIGURES / "validation_national.png")
    print(f"wrote {PROCESSED / 'validation.json'} and {FIGURES / 'validation_national.png'}")
