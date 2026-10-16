"""Pure transformations from raw Energinet records to one hourly table.

Every function takes the ``records`` list returned by the API and gives back a
DataFrame indexed by UTC hour, so they can be tested without network access.
"""

from __future__ import annotations

from typing import Any

import pandas as pd

WIND_SOLAR_COLUMNS = [
    "OffshoreWindLt100MW_MWh",
    "OffshoreWindGe100MW_MWh",
    "OnshoreWindLt50kW_MWh",
    "OnshoreWindGe50kW_MWh",
    "SolarPowerLt10kW_MWh",
    "SolarPowerGe10Lt40kW_MWh",
    "SolarPowerGe40kW_MWh",
    "SolarPowerSelfConMWh",
]

#: Variables used for clustering (one value per hour). Aarhus is in DK1; the
#: inertia, reserve and imbalance data describe the Nordic system around DK2.
SYSTEM_FEATURES = [
    "re_share_dk1",
    "re_share_dk2",
    "inertia_dk2",
    "inertia_nordic",
    "fcr_mw",
    "imbalance_gap_eur",
]


def _frame(records: list[dict[str, Any]], time_column: str) -> pd.DataFrame:
    frame = pd.DataFrame.from_records(records)
    if frame.empty:
        return frame
    frame["hour"] = pd.to_datetime(frame[time_column], utc=True).dt.floor("h")
    return frame


def inertia_hourly(records: list[dict[str, Any]]) -> pd.DataFrame:
    """Rotating mass (GWs) of the Nordic synchronous area and of DK2."""
    frame = _frame(records, "HourUTC")
    out = frame.rename(
        columns={"InertiaDK2GWs": "inertia_dk2", "InertiaNordicGWs": "inertia_nordic"}
    )
    return out.groupby("hour")[["inertia_dk2", "inertia_nordic"]].mean()


def fcr_hourly(records: list[dict[str, Any]]) -> pd.DataFrame:
    """Frequency containment reserve bought in DK2: total MW and price (EUR/MW)."""
    frame = _frame(records, "HourUTC")
    frame = frame[frame["AuctionType"] == "Total"].copy()
    frame["weighted"] = frame["PriceTotalEUR"] * frame["PurchasedVolumeLocal"]
    grouped = frame.groupby("hour")
    volume = grouped["PurchasedVolumeLocal"].sum()
    price = grouped["weighted"].sum() / volume.where(volume > 0)
    return pd.DataFrame({"fcr_mw": volume, "fcr_price_eur": price})


def imbalance_hourly(records: list[dict[str, Any]]) -> pd.DataFrame:
    """Imbalance price and its distance to the spot price, averaged per hour."""
    frame = _frame(records, "TimeUTC")
    frame["gap"] = (frame["ImbalancePriceEUR"] - frame["SpotPriceEUR"]).abs()
    grouped = frame.groupby("hour")
    return pd.DataFrame(
        {
            "imbalance_eur": grouped["ImbalancePriceEUR"].mean(),
            "imbalance_gap_eur": grouped["gap"].mean(),
        }
    )


def settlement_hourly(records: list[dict[str, Any]], area: str) -> pd.DataFrame:
    """Wind and solar generation as a share of gross consumption, for one area."""
    frame = _frame(records, "HourUTC")
    renewable = frame[WIND_SOLAR_COLUMNS].sum(axis=1, min_count=1)
    out = pd.DataFrame(
        {
            "hour": frame["hour"],
            f"re_share_{area}": renewable
            / frame["GrossConsumptionMWh"].where(frame["GrossConsumptionMWh"] > 0),
        }
    )
    return out.groupby("hour").mean()


def mask_zero_runs(series: pd.Series, min_hours: int = 24) -> pd.Series:
    """Set runs of at least ``min_hours`` consecutive exact zeros to NaN.

    A municipality that reports 0 % renewable coverage for days is almost
    certainly a plant outage or a reporting gap, not a real zero.
    """
    zero = series.eq(0)
    run_id = (zero != zero.shift()).cumsum()
    run_length = zero.groupby(run_id).transform("size")
    return series.mask(zero & (run_length >= min_hours))


def municipality_hourly(
    records: list[dict[str, Any]], municipality: str
) -> pd.DataFrame:
    """Renewable coverage (0-1) and consumption of one municipality."""
    frame = _frame(records, "HourUTC")
    frame = frame[frame["MunicipalityNo"].astype(str) == municipality]
    out = frame.rename(
        columns={"REshare": "local_re_share", "ConsumptionkWh": "local_kwh"}
    )
    # The API documents a fraction, but guard against percentages.
    if out["local_re_share"].max() > 1.5:
        out["local_re_share"] = out["local_re_share"] / 100
    hourly = out.groupby("hour")[["local_re_share", "local_kwh"]].mean().sort_index()
    hourly["local_re_share"] = mask_zero_runs(hourly["local_re_share"])
    return hourly


def assemble(
    system: list[pd.DataFrame], local: pd.DataFrame, start: str
) -> pd.DataFrame:
    """Join system variables (inner) and the local series (left) from ``start``."""
    table = system[0]
    for frame in system[1:]:
        table = table.join(frame, how="inner")
    table = table.join(local, how="left")
    table = table[table.index >= pd.Timestamp(start, tz="UTC")]
    return table.dropna(subset=SYSTEM_FEATURES).sort_index()
