import geopandas as gpd
from shapely.geometry import box

from pipeline.geography import largest_overlap


def test_largest_overlap_picks_biggest_share():
    regions = gpd.GeoDataFrame({"code": ["L", "R"]}, geometry=[box(0, 0, 10, 10), box(10, 0, 20, 10)])
    polys = gpd.GeoSeries([
        box(1, 1, 3, 3),     # inside L
        box(8, 1, 18, 3),    # 20% L, 80% R
        box(5, 1, 10, 3),    # inside L, touching R's edge (zero-area overlap)
        box(50, 50, 51, 51),  # outside both
    ])
    assert largest_overlap(polys, regions, "code").tolist()[:3] == ["L", "R", "L"]
    assert largest_overlap(polys, regions, "code").isna().tolist() == [False, False, False, True]
