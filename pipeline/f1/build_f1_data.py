"""Build static JSON for the F1 race-analysis page.

Contract: docs/F1_SPEC.md section 3. Output goes to src/data/f1/<year>-<event-slug>-<session>/.
Run locally (not in CI) and commit the generated JSON.

Status: skeleton. The FastF1 loading/transform steps are left as TODO on purpose:
implement them only after the chart spec is confirmed (docs/F1_SPEC.md section 6).
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = REPO_ROOT / "src" / "data" / "f1"
CACHE_DIR = REPO_ROOT / "pipeline" / ".fastf1-cache"

# Size limits from the spec (bytes).
MAX_LAPS_BYTES = 300_000
MAX_POS_BYTES = 150_000
MAX_TOTAL_BYTES = 2_000_000


def slugify(text: str) -> str:
    """'Spanish Grand Prix' -> 'spanish-grand-prix'."""
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def to_seconds(value) -> float | None:
    """Convert a pandas Timedelta (or NaT/None) to seconds with 3 decimals."""
    if value is None:
        return None
    try:
        seconds = value.total_seconds()
    except AttributeError:
        return None
    if seconds != seconds:  # NaN check
        return None
    return round(seconds, 3)


def write_json(path: Path, data) -> int:
    """Write compact JSON and return its size in bytes."""
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    path.write_text(payload, encoding="utf-8")
    return len(payload.encode("utf-8"))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--event", required=True, help='e.g. "Spanish Grand Prix" or round number')
    parser.add_argument("--session", default="R", help="R = race (default)")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    out_dir = args.out / f"{args.year}-{slugify(str(args.event))}-{args.session.lower()}"

    # TODO(claude): implement once docs/F1_SPEC.md section 6 is confirmed:
    #   1. fastf1.Cache.enable_cache(CACHE_DIR); session = fastf1.get_session(...); session.load()
    #   2. build meta.json, laps.json, track.json, pos/<DRIVER>.json per the contract
    #   3. downsample positions, round coordinates to ints
    #   4. validate (see spec section 4) and enforce the size limits above
    #   5. print a summary: rows, files, sizes, discarded laps
    raise NotImplementedError(f"Pipeline not implemented yet. Target folder: {out_dir}")


if __name__ == "__main__":
    main()
