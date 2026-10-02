"""Stage retire: Weibull retirements per POA, year and scenario -> data/processed/retirements.parquet."""
import numpy as np
import pandas as pd

from pipeline.config import FORECAST_YEARS, INTERIM, PROCESSED, SCENARIOS


def weibull_cdf(t: np.ndarray | float, beta: float, alpha: float) -> np.ndarray | float:
    """Share of a cohort retired by age t (years): F(t) = 1 - exp(-(t/beta)^alpha). Ages below 0 give 0."""
    t = np.clip(t, 0.0, None)
    return 1.0 - np.exp(-((t / beta) ** alpha))


def mid_year(year_month: pd.Series) -> np.ndarray:
    """Decimal year at the middle of each install month, e.g. Jan 2010 -> 2010 + 0.5/12."""
    return (year_month.dt.year + (year_month.dt.month - 0.5) / 12).to_numpy()


def retired_share(mid: np.ndarray, years: np.ndarray, beta: float, alpha: float) -> np.ndarray:
    """Share of each cohort (rows) retired in each calendar year (columns): F(age at end) - F(age at start), >= 0."""
    age_start = years[None, :] - mid[:, None]
    return np.maximum(weibull_cdf(age_start + 1, beta, alpha) - weibull_cdf(age_start, beta, alpha), 0.0)


def retirements(cohorts: pd.DataFrame, years: np.ndarray, beta: float, alpha: float) -> pd.DataFrame:
    """Panels and tonnes retired per (poa_code, year) for one scenario."""
    share = retired_share(mid_year(cohorts["year_month"]), years, beta, alpha)
    poa = cohorts["poa_code"].to_numpy()
    cols = {m: pd.DataFrame(share * cohorts[m].to_numpy()[:, None], columns=years).groupby(poa).sum().stack()
            for m in ("panels", "tonnes")}
    return pd.DataFrame(cols).rename_axis(["poa_code", "year"]).reset_index()


def run() -> None:
    """Write retirements.parquet and national_retirements.parquet, and print national checks."""
    cohorts = pd.read_parquet(INTERIM / "cohorts.parquet")
    years = np.arange(FORECAST_YEARS[0], FORECAST_YEARS[1] + 1)
    frames, ever = [], {}
    for name, s in SCENARIOS.items():
        if s["beta"] is None:
            print(f"{name}: beta not set yet (fitted in step 6), skipped")
            continue
        frames.append(retirements(cohorts, years, s["beta"], s["alpha"]).assign(scenario=name))
        # Everything retired from first install to the end of the last forecast year.
        f_end = weibull_cdf(years[-1] + 1 - mid_year(cohorts["year_month"]), s["beta"], s["alpha"])
        ever[name] = {m: (cohorts[m] * f_end).sum() for m in ("panels", "tonnes")}

    df = pd.concat(frames)[["scenario", "poa_code", "year", "panels", "tonnes"]]
    PROCESSED.mkdir(parents=True, exist_ok=True)
    df.to_parquet(PROCESSED / "retirements.parquet", index=False)
    national = df.groupby(["scenario", "year"], as_index=False)[["panels", "tonnes"]].sum()
    national.to_parquet(PROCESSED / "national_retirements.parquet", index=False)

    print(f"retirements.parquet: {len(df):,} rows")
    print("national tonnes retired per year:")
    print(national.pivot(index="year", columns="scenario", values="tonnes").round(0).astype("int64").to_string())
    for name, g in national.groupby("scenario"):
        t = g.set_index("year")["tonnes"]
        print(f"{name:13s} 2025 {t[2025]:>9,.0f} t | 2030 {t[2030]:>9,.0f} t | 2035 {t[2035]:>9,.0f} t | "
              f"sum {years[0]}-{years[-1]} {t.sum() / 1e6:.2f} Mt | all retired by end {years[-1]} "
              f"{ever[name]['tonnes'] / 1e6:.2f} Mt, {ever[name]['panels'] / 1e6:.1f}M panels")
