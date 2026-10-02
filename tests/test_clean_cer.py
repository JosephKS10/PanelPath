from io import StringIO

import pandas as pd

from pipeline.clean_cer import clean


def _csv(text: str) -> pd.DataFrame:
    return pd.read_csv(StringIO(text), dtype=str)


# Same shape as the real files: 2011+ files carry 'Historic Total' and 'Total' columns and thousands commas.
INST_OLD = _csv("""Small Unit Installation Postcode,Nov 2010 - Installations Quantity,Dec 2010 - Installations Quantity
0800,1,0
2000,0,0
""")
INST_NEW = _csv("""Small Unit Installation Postcode,Historic Total Installation Quantity (2001 - 2010),Jan 2011 - Installation Quantity,Feb 2011 - Installation Quantity,Total Installation Quantity
0800,1,2,0,3
2000,0,"1,200 ",0,"1,200 "
""")
KW_OLD = _csv("""Small Unit Installation Postcode,Nov 2010 - SGU Rated Output In kW,Dec 2010 - SGU Rated Output In kW
0800,1.5,0
2000,0,0
""")
KW_NEW = _csv("""Small Unit Installation Postcode,Historic Total Rated Power Output In kW (2001 - 2010),Jan 2011 - Rated Power Output in kW,Feb 2011 - Rated Power Output in kW,Total Rated Power Output In kW
0800,1.5,3.000 ,0,4.5
2000,0,"6,000.250 ",0,"6,000.250 "
""")


def test_clean_reshapes_and_drops_totals():
    df, dropped = clean(INST_OLD, INST_NEW, KW_OLD, KW_NEW)
    assert dropped.empty
    assert list(df.columns) == ["postcode", "year_month", "installs", "kw", "provisional"]
    assert df["postcode"].tolist() == ["0800", "0800", "2000"]  # leading zero kept, empty months removed
    assert df["year_month"].dt.strftime("%Y-%m").tolist() == ["2010-11", "2011-01", "2011-01"]
    assert df["installs"].sum() == 1203  # historic/total columns not double counted
    assert df["kw"].sum() == 6004.75
    assert df["provisional"].all()  # all within 12 months of the last month


def test_clean_logs_negative_rows():
    bad = INST_NEW.copy()
    bad.loc[0, "Jan 2011 - Installation Quantity"] = "-2"
    df, dropped = clean(INST_OLD, bad, KW_OLD, KW_NEW)
    assert dropped["reason"].tolist() == ["negative value"]
    assert len(df) == 2
