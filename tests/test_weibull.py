import pytest

from pipeline.config import SCENARIOS
from pipeline.retirement import weibull_cdf


@pytest.mark.parametrize("scenario, expected", [("AU_RES", 0.519), ("INTL_EARLY", 0.163), ("INTL_REGULAR", 0.024)])
def test_f15_matches_claude_md(scenario, expected):
    s = SCENARIOS[scenario]
    assert weibull_cdf(15.0, s["beta"], s["alpha"]) == pytest.approx(expected, abs=1e-3)


def test_zero_and_negative_age_retire_nothing():
    assert weibull_cdf(0.0, 17.0, 2.4928) == 0.0
    assert weibull_cdf(-1.0, 17.0, 2.4928) == 0.0
