"""Retirement curves and annual retirements (step 4 fills in the rest)."""
import numpy as np


def weibull_cdf(t: np.ndarray | float, beta: float, alpha: float) -> np.ndarray | float:
    """Share of a cohort retired by age t (years): F(t) = 1 - exp(-(t/beta)^alpha). Ages below 0 give 0."""
    t = np.clip(t, 0.0, None)
    return 1.0 - np.exp(-((t / beta) ** alpha))
