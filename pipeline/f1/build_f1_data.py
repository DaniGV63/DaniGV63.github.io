"""Build static JSON for the F1 race-analysis page.

Contract: docs/F1_SPEC.md section 3. Output goes to
src/data/f1/<year>-<event-slug>-<session>/. Run locally (not in CI) and commit
the generated JSON.

Example:
    python pipeline/f1/build_f1_data.py --year 2021 \
        --event "Abu Dhabi Grand Prix" --session R
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import fastf1
import fastf1.plotting
import numpy as np
import pandas as pd
from fastf1.core import Session

from transforms import (
    SECTOR_KEYS,
    cumulative_distance,
    downsample_indices,
    normalise_hex,
    sector_split_indices,
    slugify,
    to_seconds,
    validate_laps,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = REPO_ROOT / "src" / "data" / "f1"
CACHE_DIR = REPO_ROOT / "pipeline" / ".fastf1-cache"

# Size limits from the spec (bytes).
MAX_LAPS_BYTES = 300_000
MAX_POS_BYTES = 150_000
MAX_TOTAL_BYTES = 2_000_000

LAP_SPACING = 500.0  # 50 m between kept samples of a driver lap
OUTLINE_SPACING = 300.0  # 30 m for the circuit outline


def write_json(path: Path, data: Any) -> int:
    """Write compact JSON and return its size in bytes."""
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    path.write_text(payload, encoding="utf-8")
    return len(payload.encode("utf-8"))


def load_session(year: int, event: str, code: str) -> Session:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    fastf1.Cache.enable_cache(str(CACHE_DIR))
    session = fastf1.get_session(year, event, code)
    session.load(telemetry=True, weather=False, messages=False)
    return session


def optional_int(value: Any) -> int | None:
    return None if pd.isna(value) else int(value)


def build_laps(session: Session) -> list[dict[str, Any]]:
    laps = session.laps.sort_values(["Driver", "LapNumber"])
    rows: list[dict[str, Any]] = []
    for lap in laps.itertuples():
        rows.append(
            {
                "driver": lap.Driver,
                "lap": int(lap.LapNumber),
                "s1": to_seconds(lap.Sector1Time),
                "s2": to_seconds(lap.Sector2Time),
                "s3": to_seconds(lap.Sector3Time),
                "lapTime": to_seconds(lap.LapTime),
                "compound": None if pd.isna(lap.Compound) else str(lap.Compound),
                "tyreLife": optional_int(lap.TyreLife),
                "pitIn": bool(pd.notna(lap.PitInTime)),
                "pitOut": bool(pd.notna(lap.PitOutTime)),
                "isAccurate": bool(lap.IsAccurate),
                "position": optional_int(lap.Position),
                "trackStatus": None if pd.isna(lap.TrackStatus) else str(lap.TrackStatus),
            }
        )
    return rows


def team_color(session: Session, team: str, fallback: Any) -> str | None:
    try:
        return normalise_hex(fastf1.plotting.get_team_color(team, session=session))
    except Exception:  # unknown team in the plotting colour map
        return normalise_hex(fallback)


def build_meta(session: Session, codes: list[str], total_laps: int) -> dict[str, Any]:
    results = session.results.set_index("Abbreviation")
    drivers = []
    for code in codes:
        row = results.loc[code]
        drivers.append(
            {
                "code": code,
                "name": str(row["FullName"]),
                "team": str(row["TeamName"]),
                "teamColor": team_color(session, row["TeamName"], row["TeamColor"]),
                "finish": optional_int(row["Position"]),
                "status": str(row["Status"]),
            }
        )
    drivers.sort(key=lambda d: (d["finish"] is None, d["finish"] or 0, d["code"]))
    event = session.event
    return {
        "year": int(event["EventDate"].year),
        "event": str(event["EventName"]),
        "session": session.name,
        "circuit": str(event["Location"]),
        "totalLaps": total_laps,
        "drivers": drivers,
        "source": f"FastF1 {fastf1.__version__}",
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def lap_samples(pos: pd.DataFrame, start: pd.Timedelta, end: pd.Timedelta):
    """X, Y arrays and session seconds of position samples inside [start, end]."""
    seconds = pos["SessionTime"].dt.total_seconds().to_numpy()
    lo, hi = np.searchsorted(seconds, [start.total_seconds(), end.total_seconds()])
    window = pos.iloc[lo:hi]
    return window["X"].to_numpy(), window["Y"].to_numpy(), seconds[lo:hi]


def build_track(session: Session) -> tuple[dict[str, Any], tuple[float, float]]:
    """Circuit outline from the fastest lap, plus S1/S2 fractions of lap distance."""
    ref = session.laps.pick_fastest()
    pos = session.pos_data[ref["DriverNumber"]]
    xs, ys, seconds = lap_samples(pos, ref["LapStartTime"], ref["Time"])
    dist = cumulative_distance(xs, ys)
    keep = downsample_indices(dist, OUTLINE_SPACING)

    boundary_times = [
        ref["Sector1SessionTime"].total_seconds(),
        ref["Sector2SessionTime"].total_seconds(),
    ]
    fractions = tuple(float(np.interp(t, seconds, dist) / dist[-1]) for t in boundary_times)
    boundaries = [
        [int(np.interp(t, seconds, xs)), int(np.interp(t, seconds, ys))]
        for t in boundary_times
    ]
    info = session.get_circuit_info()
    corners = [
        {
            "number": f"{int(c.Number)}{c.Letter or ''}",
            "x": int(c.X),
            "y": int(c.Y),
        }
        for c in info.corners.itertuples()
    ]
    track = {
        "outline": [[int(xs[i]), int(ys[i])] for i in keep],
        "sectorBoundaries": boundaries,
        "rotationDeg": float(info.rotation),
        "corners": corners,
    }
    return track, (fractions[0], fractions[1])


def build_positions(
    session: Session, code: str, fractions: tuple[float, float]
) -> tuple[dict[str, Any], int]:
    """Per-lap downsampled trajectory of one driver; returns data and laps skipped."""
    laps = session.laps.pick_drivers(code)
    pos = session.pos_data[laps.iloc[0]["DriverNumber"]]
    out: dict[str, Any] = {}
    skipped = 0
    for lap in laps.itertuples():
        start = lap.LapStartTime
        if pd.isna(start) and pd.notna(lap.LapTime):
            start = lap.Time - lap.LapTime
        if pd.isna(start) or pd.isna(lap.Time):
            skipped += 1
            continue
        xs, ys, _ = lap_samples(pos, start, lap.Time)
        if len(xs) < 10:
            skipped += 1
            continue
        dist = cumulative_distance(xs, ys)
        keep = downsample_indices(dist, LAP_SPACING)
        flat = np.column_stack([xs[keep], ys[keep]]).astype(int).ravel().tolist()
        out[str(int(lap.LapNumber))] = {
            "p": flat,
            "s": sector_split_indices(dist[keep], fractions),
        }
    return {"driver": code, "laps": out}, skipped


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--event", required=True, help='e.g. "Abu Dhabi Grand Prix"')
    parser.add_argument("--session", default="R", help="R = race (default)")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    folder = f"{args.year}-{slugify(args.event)}-{args.session.lower()}"
    out_dir = args.out / folder

    session = load_session(args.year, args.event, args.session)
    lap_rows = build_laps(session)
    codes = sorted({row["driver"] for row in lap_rows})
    no_laps = [c for c in session.results["Abbreviation"] if c not in codes]
    total_laps = max(row["lap"] for row in lap_rows)

    problems = validate_laps(lap_rows)
    if problems:
        print(f"{len(problems)} lap validation problems:", *problems[:15], sep="\n  ")
        sys.exit(1)

    sizes: dict[str, int] = {}
    meta = build_meta(session, codes, total_laps)
    sizes["meta.json"] = write_json(out_dir / "meta.json", meta)
    sizes["laps.json"] = write_json(out_dir / "laps.json", lap_rows)
    track, fractions = build_track(session)
    sizes["track.json"] = write_json(out_dir / "track.json", track)

    skipped_total = 0
    for code in codes:
        data, skipped = build_positions(session, code, fractions)
        skipped_total += skipped
        sizes[f"pos/{code}.json"] = write_json(out_dir / "pos" / f"{code}.json", data)

    total = sum(sizes.values())
    print(f"\n{folder}: {len(lap_rows)} lap rows, {len(codes)} drivers, {total_laps} laps")
    print(f"drivers without laps (not started): {no_laps or 'none'}")
    print(f"laps without usable position data: {skipped_total}")
    print(f"sector fractions of lap distance: {fractions[0]:.3f}, {fractions[1]:.3f}")
    for name, size in sizes.items():
        print(f"  {name:<14}{size / 1024:8.1f} KB")
    print(f"  {'TOTAL':<14}{total / 1024:8.1f} KB (limit {MAX_TOTAL_BYTES // 1024})")

    too_big = [n for n, s in sizes.items() if n == "laps.json" and s > MAX_LAPS_BYTES]
    too_big += [n for n, s in sizes.items() if n.startswith("pos/") and s > MAX_POS_BYTES]
    if too_big or total > MAX_TOTAL_BYTES:
        print(f"SIZE LIMIT EXCEEDED: {too_big or 'total'}")
        sys.exit(1)


if __name__ == "__main__":
    main()
