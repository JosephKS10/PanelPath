import pytest

from pipeline.config import MATERIAL_SHARES, SILVER_G_PER_PANEL
from pipeline.materials import KEYS, split


def test_shares_sum_to_100_percent():
    assert sum(MATERIAL_SHARES.values()) == pytest.approx(1.0)


def test_split_conserves_mass_and_counts_silver_per_panel():
    out = split(tonnes=200.0, panels=10_000)
    assert len(out) == len(KEYS)
    assert sum(out[:len(MATERIAL_SHARES)]) == pytest.approx(200.0)
    assert out[-2:] == pytest.approx([10_000 * g / 1000 for g in SILVER_G_PER_PANEL])  # 60 to 100 kg
