"""Pure helpers for the F1 pipeline.

No FastF1 import here so they can be unit-tested without network or cache.
Coordinates are FastF1 position units (1/10 of a metre).
"""

from __future__ import annotations

import re
from typing import Any

import numpy as np

SECTOR_KEYS = ("s1", "s2", "s3")


def slugify(text: str) -> str:
    """Turn 'Spanish Grand Prix' into 'spanish-grand-prix'."""
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def to_seconds(value: Any) -> float | None:
    """Convert a Timedelta-like value (or NaT/None) to seconds, 3 decimals."""
    if value is None:
        return None
    try:
        seconds = value.total_seconds()
    except AttributeError:
        return None
    if seconds != seconds:  # NaN check, covers pandas NaT
        return None
    return round(seconds, 3)


def normalise_hex(color: Any) -> str | None:
    """Return '#RRGGBB' for '0600EF' / '#0600ef'; None if not a hex colour."""
    if not isinstance(color, str):
        return None
    match = re.fullmatch(r"#?([0-9a-fA-F]{6})", color.strip())
    return f"#{match.group(1).upper()}" if match else None


def cumulative_distance(xs: np.ndarray, ys: np.ndarray) -> np.ndarray:
    """Distance travelled along the polyline at each sample, starting at 0."""
    if len(xs) == 0:
        return np.zeros(0)
    steps = np.hypot(np.diff(xs), np.diff(ys))
    return np.concatenate(([0.0], np.cumsum(steps)))


def downsample_indices(distance: np.ndarray, spacing: float) -> np.ndarray:
    """Pick one sample per `spacing` of travelled distance.

    The first and the last sample are always kept so the lap closes.
    """
    if len(distance) == 0:
        return np.zeros(0, dtype=int)
    bins = np.floor(distance / spacing).astype(int)
    keep = np.flatnonzero(np.diff(bins, prepend=bins[0] - 1) != 0)
    last = len(distance) - 1
    if keep[-1] != last:
        keep = np.append(keep, last)
    return keep


def sector_split_indices(
    distance: np.ndarray, fractions: tuple[float, float]
) -> list[int]:
    """Index of the first sample in sector 2 and in sector 3.

    `fractions` are the share of lap distance at the end of S1 and S2,
    measured once on a reference lap and reused for every lap.
    """
    if len(distance) == 0 or distance[-1] <= 0:
        return [0, 0]
    total = distance[-1]
    return [int(np.searchsorted(distance, f * total)) for f in fractions]


def validate_laps(rows: list[dict[str, Any]], tolerance: float = 0.5) -> list[str]:
    """Return human-readable problems found in lap rows (empty list = valid)."""
    errors: list[str] = []
    for row in rows:
        label = f"{row['driver']} lap {row['lap']}"
        values = {key: row[key] for key in (*SECTOR_KEYS, "lapTime")}
        for key, value in values.items():
            if value is not None and value <= 0:
                errors.append(f"{label}: non-positive {key}={value}")
        sectors = [row[key] for key in SECTOR_KEYS]
        lap_time = row["lapTime"]
        if row["isAccurate"] and lap_time is not None and None not in sectors:
            if abs(sum(sectors) - lap_time) > tolerance:
                errors.append(f"{label}: sectors sum {sum(sectors):.3f} != {lap_time}")
    return errors
