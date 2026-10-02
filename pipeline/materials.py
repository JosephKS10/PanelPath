"""Materials layer: split retiring panel mass into recoverable materials (CONTEXT §6.6)."""
from pipeline.config import MATERIAL_SHARES

KEYS = list(MATERIAL_SHARES)  # column order for compact arrays in materials.json


def split(tonnes: float) -> list[float]:
    """Tonnes of each material, in MATERIAL_SHARES order."""
    return [tonnes * s for s in MATERIAL_SHARES.values()]
