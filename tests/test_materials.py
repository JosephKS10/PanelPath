import pytest

from pipeline.config import MATERIAL_SHARES
from pipeline.materials import KEYS, split


def test_shares_sum_to_100_percent():
    # The published column sums to 99.99%; allow that 0.01-point rounding gap plus float error.
    assert sum(MATERIAL_SHARES.values()) == pytest.approx(1.0, abs=1.5e-4)


def test_split_follows_shares():
    out = split(200.0)
    assert len(out) == len(KEYS)
    assert out[KEYS.index("silver")] == pytest.approx(200.0 * MATERIAL_SHARES["silver"])  # 0.1 t
    assert sum(out) == pytest.approx(200.0 * sum(MATERIAL_SHARES.values()))
