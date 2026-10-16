"""Small client for the open Energi Data Service API (Energinet).

The API needs no key but rate-limits anonymous callers hard: after a handful of
requests it answers 429 with the seconds to wait. Requests are therefore few,
large (``limit=0``), cached on disk and retried after the advertised wait.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import time
from pathlib import Path
from typing import Any

import requests

BASE_URL = "https://api.energidataservice.dk/dataset"
CACHE_DIR = Path(__file__).resolve().parent / ".cache"
MAX_RETRIES = 8


def _cache_path(dataset: str, params: dict[str, Any]) -> Path:
    key = json.dumps([dataset, params], sort_keys=True).encode()
    return CACHE_DIR / f"{dataset}-{hashlib.sha1(key).hexdigest()[:10]}.json"


def wait_seconds(response: requests.Response) -> int:
    """Seconds the API asks us to wait after a 429."""
    header = response.headers.get("Retry-After")
    if header and header.isdigit():
        return int(header) + 2
    match = re.search(r"(\d+) seconds", response.text)
    return int(match.group(1)) + 2 if match else 60


def fetch_records(
    dataset: str,
    params: dict[str, Any],
    *,
    use_cache: bool = True,
    verify_ssl: bool | None = None,
) -> list[dict[str, Any]]:
    """Download every record of ``dataset`` that matches ``params``.

    Args:
        dataset: Dataset name, for example ``"InertiaNordicSyncharea"``.
        params: Query parameters (``start``, ``end``, ``filter``, ``columns``...).
        use_cache: Reuse a previous download of the same query.
        verify_ssl: Set to False only on networks that re-sign TLS traffic. When
            None, the ``ENERGINET_INSECURE=1`` environment variable decides.

    Returns:
        The ``records`` list of the response.
    """
    path = _cache_path(dataset, params)
    if use_cache and path.exists():
        return json.loads(path.read_text(encoding="utf-8"))

    if verify_ssl is None:
        verify_ssl = os.environ.get("ENERGINET_INSECURE") != "1"
    query = {"limit": 0, "sort": "HourUTC asc", "timezone": "utc", **params}
    for _ in range(MAX_RETRIES):
        response = requests.get(
            f"{BASE_URL}/{dataset}", params=query, timeout=300, verify=verify_ssl
        )
        if response.status_code == 429:
            pause = wait_seconds(response)
            print(f"  {dataset}: rate limited, waiting {pause}s", flush=True)
            time.sleep(pause)
            continue
        response.raise_for_status()
        records = response.json()["records"]
        CACHE_DIR.mkdir(exist_ok=True)
        path.write_text(json.dumps(records), encoding="utf-8")
        return records
    raise RuntimeError(f"{dataset}: still rate limited after {MAX_RETRIES} tries")
