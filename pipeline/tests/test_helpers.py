import sys
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "f1"))

from transforms import slugify, to_seconds  # noqa: E402


def test_slugify():
    assert slugify("Spanish Grand Prix") == "spanish-grand-prix"


def test_to_seconds():
    assert to_seconds(timedelta(minutes=1, seconds=31.2345)) == 91.234
    assert to_seconds(None) is None
