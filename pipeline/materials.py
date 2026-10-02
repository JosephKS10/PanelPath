"""Materials layer: split retiring panel mass into recoverable materials (CONTEXT §6.6)."""
from pipeline.config import MATERIAL_SHARES, SILVER_G_PER_PANEL

# Column order for compact arrays in materials.json: tonnes per material, then silver in kg (low, high).
KEYS = [*MATERIAL_SHARES, "silver_kg_low", "silver_kg_high"]


def split(tonnes: float, panels: float) -> list[float]:
    """Tonnes of each material in MATERIAL_SHARES order, then silver kg from the grams-per-panel range."""
    return [tonnes * s for s in MATERIAL_SHARES.values()] + [panels * g / 1000 for g in SILVER_G_PER_PANEL]
