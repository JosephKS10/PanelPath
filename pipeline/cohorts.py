"""Stage cohorts: CER postcode-months matched to POAs, with panels and tonnes from the install-year table."""
import numpy as np
import pandas as pd

from pipeline.config import INTERIM, PANEL_TABLE


def panel_specs(install_year: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Watts per panel and kg per panel for each install year, from PANEL_TABLE."""
    last, watts, kg = (np.array(col) for col in zip(*PANEL_TABLE))
    i = np.searchsorted(last, install_year)  # first row whose last year >= install year
    return watts[i], kg[i]


def build(cer: pd.DataFrame, poa_codes: pd.Series) -> pd.DataFrame:
    """Keep postcodes that are POAs and add panels and tonnes: panels = kW*1000/W, tonnes = kW*kg_per_kW/1000."""
    df = cer[cer["postcode"].isin(poa_codes)].rename(columns={"postcode": "poa_code"})
    watts, kg = panel_specs(df["year_month"].dt.year.to_numpy())
    kg_per_kw = kg * 1000 / watts
    return df.assign(panels=df["kw"] * 1000 / watts, tonnes=df["kw"] * kg_per_kw / 1000).reset_index(drop=True)


def run() -> None:
    """Write data/interim/cohorts.parquet and print installed panels and tonnes."""
    cer = pd.read_parquet(INTERIM / "cer_installs.parquet")
    df = build(cer, pd.read_parquet(INTERIM / "poa.parquet")["poa_code"])
    df.to_parquet(INTERIM / "cohorts.parquet", index=False)
    print(f"cohorts {len(df):,} (unmatched postcodes left out: {1 - df['kw'].sum() / cer['kw'].sum():.3%} of kW,"
          f" logged in step 3 to qa/unmatched_postcodes.csv)")
    by_year = df.groupby(df["year_month"].dt.year)[["installs", "kw", "panels", "tonnes"]].sum()
    print(by_year.round(0).astype("int64").to_string())
    print(f"installed to date: {df['panels'].sum() / 1e6:.1f}M panels, {df['tonnes'].sum() / 1e6:.2f} Mt, "
          f"{df['kw'].sum() / 1e6:.2f} GW")
