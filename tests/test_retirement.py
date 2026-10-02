import numpy as np
import pandas as pd
import pytest

from pipeline.cohorts import panel_specs
from pipeline.retirement import retirements, weibull_cdf


def test_one_cohort_matches_formula():
    # 1000 panels / 20 t installed Jan 2010: mid-month age origin is 2010 + 0.5/12.
    cohort = pd.DataFrame({"poa_code": ["0800"], "year_month": pd.to_datetime(["2010-01-01"]),
                           "panels": [1000.0], "tonnes": [20.0]})
    years = np.arange(2005, 2101)
    r = retirements(cohort, years, beta=17.0, alpha=2.4928).set_index("year")
    mid = 2010 + 0.5 / 12
    expected_2025 = 1000 * (weibull_cdf(2026 - mid, 17.0, 2.4928) - weibull_cdf(2025 - mid, 17.0, 2.4928))
    assert r.loc[2025, "panels"] == pytest.approx(expected_2025)
    assert r.loc[2025, "tonnes"] == pytest.approx(expected_2025 * 20 / 1000)
    assert (r.loc[:2009, "panels"] == 0).all()  # nothing retires before install
    assert r.loc[2010, "panels"] > 0  # some retire in the install year itself
    assert r["panels"].sum() == pytest.approx(1000, rel=1e-9)  # everything retires eventually
    assert (r["panels"] >= 0).all()


def test_panel_table_year_boundaries():
    watts, kg = panel_specs(np.array([2001, 2008, 2009, 2018, 2025, 2030]))
    assert watts.tolist() == [170, 170, 185, 300, 450, 450]
    assert (kg * 1000 / watts)[3] == pytest.approx(61.67, abs=0.01)  # 2018: ~62 kg/kW, CONTEXT §7
