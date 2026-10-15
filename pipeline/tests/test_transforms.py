import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "f1"))

from transforms import (  # noqa: E402
    cumulative_distance,
    downsample_indices,
    normalise_hex,
    sector_split_indices,
    validate_laps,
)


def lap(**overrides):
    row = {
        "driver": "VER",
        "lap": 2,
        "s1": 30.0,
        "s2": 40.0,
        "s3": 20.0,
        "lapTime": 90.0,
        "isAccurate": True,
    }
    return {**row, **overrides}


def test_downsample_keeps_first_and_last():
    distance = np.array([0, 10, 20, 480, 510, 990, 1005, 1010], dtype=float)
    keep = downsample_indices(distance, 500.0)
    assert keep[0] == 0
    assert keep[-1] == len(distance) - 1
    assert np.all(np.diff(keep) > 0)


def test_downsample_empty():
    assert len(downsample_indices(np.zeros(0), 500.0)) == 0


def test_cumulative_distance_and_split():
    xs = np.array([0.0, 3.0, 3.0, 3.0])
    ys = np.array([0.0, 4.0, 4.0, 10.0])
    dist = cumulative_distance(xs, ys)
    assert dist.tolist() == [0.0, 5.0, 5.0, 11.0]
    assert sector_split_indices(dist, (0.4, 0.9)) == [1, 3]


def test_split_on_stationary_lap_does_not_crash():
    assert sector_split_indices(np.zeros(5), (0.3, 0.6)) == [0, 0]


def test_validate_laps_flags_bad_rows():
    assert validate_laps([lap()]) == []
    assert validate_laps([lap(s2=-1.0)])
    assert validate_laps([lap(lapTime=120.0)])
    # inaccurate or incomplete laps are not compared against the sector sum
    assert validate_laps([lap(lapTime=120.0, isAccurate=False)]) == []
    assert validate_laps([lap(s1=None, lapTime=120.0)]) == []


def test_normalise_hex():
    assert normalise_hex("0600ef") == "#0600EF"
    assert normalise_hex("nan") is None
    assert normalise_hex(float("nan")) is None
