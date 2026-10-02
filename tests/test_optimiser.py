import numpy as np

from pipeline.optimiser import coverage_matrix, exact, greedy


def _grid():
    # 10x10 unit grid of demand points (weight 1) with a candidate site on every point. Radius 1.5 covers a 3x3
    # block, so 9 sites can cover at most 81 points, reached by 9 disjoint blocks: the known optimum is 81.
    xy = np.array([(x, y) for x in range(10) for y in range(10)], dtype=float)
    return xy, coverage_matrix(xy, xy, 1.5), np.ones(len(xy))


def test_greedy_and_exact_reach_known_optimum():
    xy, cover, w = _grid()
    state = np.array(["A"] * len(xy))
    g = greedy(cover, w, state, n_sites=9, min_per_state=2)
    covered = np.asarray(cover[g].sum(axis=0)).ravel() > 0
    assert len(g) == 9 and w[covered].sum() == 81
    ex = exact(cover, w, state, n_sites=9, min_per_state=2, time_limit=30)
    assert len(ex["chosen"]) == 9 and ex["objective"] == 81


def test_greedy_respects_min_sites_per_state():
    xy, cover, w = _grid()
    w[xy[:, 0] >= 8] = 0  # state B (x >= 8) has no demand of its own
    state = np.where(xy[:, 0] >= 8, "B", "A")
    g = greedy(cover, w, state, n_sites=5, min_per_state=2)
    assert (state[g] == "B").sum() >= 2 and len(set(g)) == 5
