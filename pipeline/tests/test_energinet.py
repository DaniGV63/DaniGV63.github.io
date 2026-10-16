"""Tests for the Energinet transformations and analysis (no network needed)."""

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "energinet"))

import grid_analysis as analysis  # noqa: E402
import grid_model  # noqa: E402
from grid_transforms import (  # noqa: E402
    SYSTEM_FEATURES,
    assemble,
    fcr_hourly,
    imbalance_hourly,
    mask_zero_runs,
    municipality_hourly,
    settlement_hourly,
)


def test_imbalance_averages_quarters_into_hours():
    records = [
        {"TimeUTC": f"2025-03-04T00:{m:02d}:00", "ImbalancePriceEUR": p, "SpotPriceEUR": 100}
        for m, p in [(0, 100), (15, 120), (30, 80), (45, 140)]
    ]
    hourly = imbalance_hourly(records)
    assert len(hourly) == 1
    assert hourly["imbalance_eur"].iloc[0] == pytest.approx(110)
    # |0| + |20| + |-20| + |40| over 4 quarters
    assert hourly["imbalance_gap_eur"].iloc[0] == pytest.approx(20)


def test_fcr_uses_total_auction_and_weights_price_by_volume():
    rows = [
        ("FCR-N", "Total", 10, 20.0),
        ("FCR-D up", "Total", 30, 40.0),
        ("FCR-N", "D-1 early", 99, 1.0),
    ]
    records = [
        {"HourUTC": "2025-03-04T00:00:00", "ProductName": n, "AuctionType": a,
         "PurchasedVolumeLocal": v, "PriceTotalEUR": p}
        for n, a, v, p in rows
    ]
    out = fcr_hourly(records)
    assert out["fcr_mw"].iloc[0] == 40
    assert out["fcr_price_eur"].iloc[0] == pytest.approx((10 * 20 + 30 * 40) / 40)


def test_settlement_share_ignores_zero_consumption():
    base = {col: 0.0 for col in (
        "OffshoreWindLt100MW_MWh", "OffshoreWindGe100MW_MWh", "OnshoreWindLt50kW_MWh",
        "OnshoreWindGe50kW_MWh", "SolarPowerLt10kW_MWh", "SolarPowerGe10Lt40kW_MWh",
        "SolarPowerGe40kW_MWh", "SolarPowerSelfConMWh")}
    records = [
        {**base, "HourUTC": "2025-03-04T00:00:00", "OnshoreWindGe50kW_MWh": 50.0,
         "SolarPowerGe40kW_MWh": 50.0, "GrossConsumptionMWh": 200.0},
        {**base, "HourUTC": "2025-03-04T01:00:00", "GrossConsumptionMWh": 0.0},
    ]
    out = settlement_hourly(records, "dk2")
    assert out["re_share_dk2"].iloc[0] == pytest.approx(0.5)
    assert np.isnan(out["re_share_dk2"].iloc[1])


def test_municipality_filters_and_converts_percent_to_fraction():
    records = [
        {"HourUTC": "2025-03-04T00:00:00", "MunicipalityNo": "751", "REshare": 80.0, "ConsumptionkWh": 5},
        {"HourUTC": "2025-03-04T00:00:00", "MunicipalityNo": "101", "REshare": 10.0, "ConsumptionkWh": 9},
    ]
    out = municipality_hourly(records, "751")
    assert out["local_re_share"].iloc[0] == pytest.approx(0.8)


def test_long_zero_runs_are_treated_as_missing_but_short_ones_are_kept():
    values = [5.0] + [0.0] * 30 + [4.0, 0.0, 0.0, 3.0]
    index = pd.date_range("2025-03-04", periods=len(values), freq="h", tz="UTC")
    out = mask_zero_runs(pd.Series(values, index=index))
    assert out.iloc[1:31].isna().all()
    assert out.iloc[32] == 0 and out.iloc[33] == 0
    assert out.iloc[0] == 5.0


def synthetic_table(hours: int = 600) -> pd.DataFrame:
    rng = np.random.default_rng(0)
    index = pd.date_range("2025-03-04", periods=hours, freq="h", tz="UTC")
    calm = rng.random(hours) < 0.5  # two clearly different kinds of hour
    table = pd.DataFrame(
        {
            "re_share_dk1": np.where(calm, 0.2, 1.1) + rng.normal(0, 0.05, hours),
            "re_share_dk2": np.where(calm, 0.1, 0.9) + rng.normal(0, 0.05, hours),
            "inertia_dk2": np.where(calm, 9.0, 5.0) + rng.normal(0, 0.2, hours),
            "inertia_nordic": np.where(calm, 200, 150) + rng.normal(0, 5, hours),
            "fcr_mw": np.where(calm, 50, 90) + rng.normal(0, 3, hours),
            "imbalance_gap_eur": np.where(calm, 5, 30) + rng.normal(0, 1, hours),
            "local_re_share": np.where(calm, 0.3, 0.9),
        },
        index=index,
    )
    table.index.name = "hour"
    return table


def test_clustering_finds_the_two_regimes_and_is_reproducible():
    table = synthetic_table()
    first = analysis.fit_clusters(table)
    second = analysis.fit_clusters(table)
    assert first["k"] in analysis.K_RANGE
    assert (first["labels"] == second["labels"]).all()


def test_clusters_are_ordered_by_renewable_share():
    table = synthetic_table()
    fit = analysis.fit_clusters(table)
    labels = analysis.order_by_renewables(table, fit["labels"])
    means = table.groupby(labels)["re_share_dk1"].mean()
    assert list(means.index) == sorted(means.index)
    assert means.is_monotonic_increasing


def test_describe_reports_every_hour_once():
    table = synthetic_table()
    fit = analysis.fit_clusters(table)
    labels = analysis.order_by_renewables(table, fit["labels"])
    summary = analysis.describe(table, labels, fit["scaled"])
    assert sum(c["hours"] for c in summary) == len(table)
    assert all(c["label"] for c in summary)


def test_assemble_drops_hours_with_missing_system_values():
    index = pd.date_range("2025-03-04", periods=3, freq="h", tz="UTC")
    frames = [
        pd.DataFrame({name: [1.0, np.nan, 3.0]}, index=index)
        for name in SYSTEM_FEATURES
    ]
    local = pd.DataFrame({"local_re_share": [0.5, 0.5, np.nan]}, index=index)
    table = assemble(frames, local, "2025-03-04T00:00")
    assert len(table) == 2
    assert table["local_re_share"].isna().sum() == 1


def test_low_inertia_model_uses_a_chronological_split_and_beats_chance():
    table = synthetic_table(1500)
    # Make low inertia depend on wind, so the renewables model has something to learn.
    table["inertia_dk2"] = 10 - 5 * table["re_share_dk1"]
    result = grid_model.low_inertia_model(table)
    assert result["testFrom"] > table.index[int(len(table) * 0.7)].isoformat()
    assert result["withRenewables"]["auc"] > 0.8
    assert result["withRenewables"]["auc"] > result["baseline"]["auc"]
    # the first weeks only feed the 30-day reference window
    assert result["trainHours"] + result["testHours"] < len(table)


def test_deviation_from_recent_never_uses_the_future():
    values = [5.0] * 400 + [1.0] * 5
    series = pd.Series(values, index=pd.date_range("2025-01-01", periods=405, freq="h", tz="UTC"))
    deviation = grid_model.deviation_from_recent(series)
    assert deviation.iloc[-1] == pytest.approx(-4.0)  # compared with the past, not itself
