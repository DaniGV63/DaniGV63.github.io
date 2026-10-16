"""Build static JSON for the Danish power-system page.

Downloads open data from Energinet's Energi Data Service, builds an hourly table
for DK2 (the Danish area inside the Nordic synchronous system) plus the
renewable coverage of Aarhus, clusters the hours and writes two JSON files to
src/data/energinet/. The same script runs daily in GitHub Actions.

Example:
    python pipeline/energinet/build_energinet_data.py
    ENERGINET_INSECURE=1 python pipeline/energinet/build_energinet_data.py  # local TLS proxy
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

import grid_analysis as analysis
import grid_model
from grid_api import fetch_records
from grid_transforms import (
    SYSTEM_FEATURES,
    WIND_SOLAR_COLUMNS,
    assemble,
    fcr_hourly,
    imbalance_hourly,
    inertia_hourly,
    municipality_hourly,
    settlement_hourly,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = REPO_ROOT / "src" / "data" / "energinet"
START = "2025-03-04T00:00"  # first day of the imbalance-price dataset
AARHUS = "751"

FEATURE_INFO = {
    "re_share_dk1": ("Wind and solar share, DK1", "of consumption", 100),
    "re_share_dk2": ("Wind and solar share, DK2", "of consumption", 100),
    "inertia_dk2": ("DK2 inertia", "GWs", 1),
    "inertia_nordic": ("Nordic inertia", "GWs", 1),
    "fcr_mw": ("Frequency reserve bought in DK2", "MW", 1),
    "imbalance_gap_eur": ("Imbalance price distance to spot, DK2", "EUR/MWh", 1),
}


def download(use_cache: bool) -> dict[str, list[dict[str, Any]]]:
    """Five large requests, one per dataset."""
    dk2 = {"PriceArea": ["DK2"]}
    base = {"start": START}

    def settlement(area: str) -> dict[str, str]:
        return {
            "filter": json.dumps({"PriceArea": [area]}),
            "columns": ",".join(["HourUTC", *WIND_SOLAR_COLUMNS, "GrossConsumptionMWh"]),
        }

    def get(name: str, **extra: Any) -> list[dict[str, Any]]:
        print(f"Downloading {name}", flush=True)
        return fetch_records(name, {**base, **extra}, use_cache=use_cache)

    return {
        "inertia": get(
            "InertiaNordicSyncharea",
            columns="HourUTC,InertiaDK2GWs,InertiaNordicGWs",
        ),
        "fcr": get(
            "FcrNdDK2",
            filter=json.dumps({**dk2, "AuctionType": ["Total"]}),
            columns="HourUTC,ProductName,AuctionType,PurchasedVolumeLocal,PriceTotalEUR",
        ),
        "imbalance": get(
            "ImbalancePrice",
            filter=json.dumps(dk2),
            sort="TimeUTC asc",
            columns="TimeUTC,ImbalancePriceEUR,SpotPriceEUR",
        ),
        "settlement_dk1": get("ProductionConsumptionSettlement", **settlement("DK1")),
        "settlement_dk2": get("ProductionConsumptionSettlement", **settlement("DK2")),
        "local": get(
            "ReCoverageMunicipality",
            filter=json.dumps({"MunicipalityNo": [AARHUS]}),
            columns="HourUTC,MunicipalityNo,REshare,ConsumptionkWh",
        ),
    }


def build_table(raw: dict[str, list[dict[str, Any]]]) -> pd.DataFrame:
    """Hourly DK2 table with the clustering variables and Aarhus coverage."""
    return assemble(
        [
            settlement_hourly(raw["settlement_dk1"], "dk1"),
            settlement_hourly(raw["settlement_dk2"], "dk2"),
            inertia_hourly(raw["inertia"]),
            fcr_hourly(raw["fcr"]),
            imbalance_hourly(raw["imbalance"]),
        ],
        municipality_hourly(raw["local"], AARHUS),
        START,
    )


def latest_day(table: pd.DataFrame, labels: np.ndarray) -> dict[str, Any]:
    """Summary of the most recent UTC day that has all 24 hours."""
    days = table.index.floor("D")
    complete = [d for d, n in pd.Series(days).value_counts().items() if n == 24]
    day = max(complete)
    mask = days == day
    sub = table[mask]
    hours = sub.index
    low = sub["inertia_dk2"].idxmin()
    high = sub["re_share_dk1"].idxmax()
    peak = sub["imbalance_gap_eur"].idxmax()
    local = sub["local_re_share"].dropna()
    mix = pd.Series(labels[mask]).value_counts().sort_index()
    return {
        "date": day.strftime("%Y-%m-%d"),
        "hours": int(len(hours)),
        "lowestInertia": {"hour": low.isoformat(), "value": round(sub.loc[low, "inertia_dk2"], 2)},
        "highestRenewablesDK1": {"hour": high.isoformat(), "value": round(sub.loc[high, "re_share_dk1"], 3)},
        "widestImbalanceGap": {"hour": peak.isoformat(), "value": round(sub.loc[peak, "imbalance_gap_eur"], 1)},
        "aarhusRenewableMedian": None if local.empty else round(float(local.median()), 3),
        "clusterHours": {int(k): int(v) for k, v in mix.items()},
    }


def compact(values: pd.Series | np.ndarray, digits: int) -> list[float | None]:
    return [None if pd.isna(v) else round(float(v), digits) for v in values]


def write_outputs(table: pd.DataFrame, out_dir: Path) -> dict[str, Any]:
    fit = analysis.fit_clusters(table)
    labels = analysis.order_by_renewables(table, fit["labels"])
    clusters = analysis.describe(table, labels, fit["scaled"])
    first = table.index[0]
    hours_since = ((table.index - first) / pd.Timedelta(hours=1)).astype(int)

    columns: dict[str, Any] = {
        "t": hours_since.tolist(),
        "c": labels.astype(int).tolist(),
        "x": compact(fit["coordinates"][:, 0], 2),
        "y": compact(fit["coordinates"][:, 1], 2),
        "o": fit["outlier"].astype(int).tolist(),
        "local": compact(table["local_re_share"], 3),
    }
    for name in SYSTEM_FEATURES:
        columns[name] = compact(table[name], 3 if name.startswith("re_share") else 2)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "hours.json").write_text(
        json.dumps({"start": first.isoformat(), **columns}, separators=(",", ":")),
        encoding="utf-8",
    )

    meta = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "window": {"from": first.isoformat(), "to": table.index[-1].isoformat()},
        "hours": int(len(table)),
        "localHours": int(table["local_re_share"].notna().sum()),
        "localExcludedHours": int(table["local_re_share"].isna().sum()),
        "area": "DK2",
        "municipality": {"no": AARHUS, "name": "Aarhus"},
        "features": {
            name: {"label": info[0], "unit": info[1], "scale": info[2]}
            for name, info in FEATURE_INFO.items()
        },
        "k": fit["k"],
        "silhouette": {str(k): round(v, 3) for k, v in fit["silhouette"].items()},
        "explained": [round(v, 3) for v in fit["explained"]],
        "outliers": int(fit["outlier"].sum()),
        "localOverall": analysis.overall_local(table),
        "clusters": clusters,
        "model": grid_model.low_inertia_model(table),
        "correlations": analysis.correlations(table),
        "localByHour": analysis.profile(table, labels, "hour"),
        "localByMonth": analysis.profile(table, labels, "month"),
        "latestDay": latest_day(table, labels),
    }
    (out_dir / "meta.json").write_text(
        json.dumps(meta, indent=1, ensure_ascii=False), encoding="utf-8"
    )
    return meta


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--refresh", action="store_true", help="ignore cached downloads")
    args = parser.parse_args()

    table = build_table(download(use_cache=not args.refresh))
    meta = write_outputs(table, args.out)
    sizes = {p.name: p.stat().st_size // 1024 for p in args.out.glob("*.json")}
    print(f"{meta['hours']} hours, {meta['localHours']} with Aarhus data, k={meta['k']}")
    print(f"Written to {args.out}: {sizes} KB")


if __name__ == "__main__":
    main()
