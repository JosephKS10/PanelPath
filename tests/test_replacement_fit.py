from datetime import date

import pandas as pd
import pytest

from pipeline.replacement_fit import decimal_year, fit
from pipeline.retirement import mid_year, weibull_cdf


def test_fit_recovers_known_beta():
    # Three POAs with cohorts in 2005, 2010, 2016 and 2019; houses set so the excess equals R(beta=20) exactly.
    months = pd.to_datetime(["2005-03-01", "2010-06-01", "2016-01-01", "2019-09-01"])
    cohorts = pd.concat([pd.DataFrame({"poa_code": code, "year_month": months, "installs": n, "kw": n * 5.0,
                                       "provisional": False}) for code, n in [("1000", 1500), ("2000", 2500),
                                                                             ("3000", 4000)]], ignore_index=True)
    cutoff = date(2022, 1, 1)
    age = decimal_year(cutoff) - mid_year(cohorts["year_month"])
    replaced = (cohorts["installs"] * weibull_cdf(age, 20.0, 2.4928)).groupby(cohorts["poa_code"]).sum()
    total = cohorts.groupby("poa_code")["installs"].sum()
    poa = pd.DataFrame({"poa_code": total.index, "state": "SA", "houses": (total - replaced).to_numpy()})

    r = fit(cohorts, poa, cutoff, poa["houses"])
    assert r["n_poas"] == 3
    assert r["beta"] == pytest.approx(20.0)
    assert r["rmse"] == pytest.approx(0.0, abs=1e-6)
    assert not r["at_grid_edge"]


def test_fit_drops_business_heavy_and_unfull_poas():
    months = pd.to_datetime(["2010-06-01", "2018-06-01"])
    cohorts = pd.DataFrame({"poa_code": ["1000", "1000", "2000", "2000"], "year_month": months.append(months),
                            "installs": [1000, 1000, 1000, 1000], "kw": [5000.0, 5000.0, 30000.0, 30000.0],
                            "provisional": False})
    poa = pd.DataFrame({"poa_code": ["1000", "2000"], "state": "SA", "houses": [2500, 1500]})
    r = fit(cohorts, poa, date(2022, 1, 1), poa["houses"])
    assert r["n_poas"] == 0  # 1000 is not full; 2000 averages 30 kW per system
    assert r["beta"] is None and r["rmse"] is None
