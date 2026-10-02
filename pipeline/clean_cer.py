"""Stage clean: CER wide postcode CSVs -> data/interim/cer_installs.parquet (one row per postcode x month)."""
import pandas as pd

from pipeline.config import INTERIM, PROVISIONAL_MONTHS, QA, RAW

POSTCODE_COL = "Small Unit Installation Postcode"


def tidy(old: pd.DataFrame, new: pd.DataFrame, value: str) -> pd.DataFrame:
    """Turn the 2001-2010 and 2011-present wide tables into long (postcode, year_month, value).

    The 2011-present file's 'Historic Total' column equals the 2001-2010 file's row sums and its
    'Total' column is a row sum, so both are dropped and only month columns are kept.
    """
    frames = []
    for wide in (old, new):
        months = [c for c in wide.columns if c != POSTCODE_COL and "Total" not in c]
        long = wide.melt(id_vars=POSTCODE_COL, value_vars=months, var_name="col", value_name=value)
        frames.append(long)
    df = pd.concat(frames, ignore_index=True)
    return pd.DataFrame({
        "postcode": df[POSTCODE_COL].astype(str).str.strip().str.zfill(4),
        "year_month": pd.to_datetime(df["col"].str.split(" - ").str[0], format="%b %Y"),
        value: pd.to_numeric(df[value].astype(str).str.replace(",", "").str.strip()),
    })


def clean(installs_old: pd.DataFrame, installs_new: pd.DataFrame,
          kw_old: pd.DataFrame, kw_new: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Return (clean installs table, dropped rows with a reason column)."""
    df = tidy(installs_old, installs_new, "installs").merge(
        tidy(kw_old, kw_new, "kw"), on=["postcode", "year_month"], how="outer")
    df[["installs", "kw"]] = df[["installs", "kw"]].fillna(0)

    bad = df[(df["installs"] < 0) | (df["kw"] < 0)].assign(reason="negative value")
    dup = df[df.duplicated(["postcode", "year_month"], keep=False)].assign(reason="duplicate postcode-month")
    dropped = pd.concat([bad, dup])
    df = df.drop(dropped.index)
    df = df[(df["installs"] > 0) | (df["kw"] > 0)]  # empty postcode-months carry no information

    last = df["year_month"].max()
    df = df.assign(
        installs=df["installs"].astype("int64"),
        provisional=df["year_month"] > last - pd.DateOffset(months=PROVISIONAL_MONTHS),
    )
    return df.sort_values(["postcode", "year_month"]).reset_index(drop=True), dropped


def _read(name: str) -> pd.DataFrame:
    return pd.read_csv(RAW / name, dtype=str)


def run() -> None:
    """Clean the CER files, write the parquet and the dropped-row log, and print QA totals."""
    io = {k: _read(f"cer_solar_{k}.csv") for k in
          ["installations_2001_2010", "installations_2011_present", "capacity_2001_2010", "capacity_2011_present"]}
    df, dropped = clean(*io.values())

    # Cross-check against the CER's own Total columns.
    for key, col in [("installations_2011_present", "installs"), ("capacity_2011_present", "kw")]:
        total_col = [c for c in io[key].columns if c.startswith("Total")][0]
        cer_total = pd.to_numeric(io[key][total_col].str.replace(",", "").str.strip()).sum()
        print(f"{col}: ours {df[col].sum():,.1f} vs CER Total column {cer_total:,.1f}")

    INTERIM.mkdir(parents=True, exist_ok=True)
    QA.mkdir(parents=True, exist_ok=True)
    df.to_parquet(INTERIM / "cer_installs.parquet", index=False)
    dropped.to_csv(QA / "cer_dropped.csv", index=False)
    print(f"dropped rows: {len(dropped)} ({dropped['kw'].sum() / (df['kw'].sum() + dropped['kw'].sum()):.4%} of national kW)"
          f" -> {QA / 'cer_dropped.csv'}")

    by_year = df.groupby(df["year_month"].dt.year)[["installs", "kw"]].sum()
    by_year["cum_installs"] = by_year["installs"].cumsum()
    by_year["mean_kw"] = by_year["kw"] / by_year["installs"]
    print(by_year.round(2).to_string())
    print(f"rows {len(df):,}, postcodes {df['postcode'].nunique():,}, "
          f"months {df['year_month'].min():%Y-%m} to {df['year_month'].max():%Y-%m}, "
          f"provisional from {df.loc[df['provisional'], 'year_month'].min():%Y-%m}")
    print(f"cumulative installs {df['installs'].sum():,}, kW {df['kw'].sum():,.0f}")
    print(f"postcode-months with installs but no kW: {((df['installs'] > 0) & (df['kw'] == 0)).sum()}, "
          f"kW but no installs: {((df['installs'] == 0) & (df['kw'] > 0)).sum()}")
