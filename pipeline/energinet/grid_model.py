"""Can wind and solar share tell us which hours will have low inertia?

A small, honest supervised check: predict the lowest-inertia hours of DK2 from
the time of day and month alone (baseline) and from the same plus the wind and
solar share. The split is chronological, so the test months are always after
the training months.

"Low" is relative to the previous 30 days. DK2 inertia shifts level between
seasons and years, so a fixed threshold learned in the past stops meaning
anything later (in the held-out months it flagged 40 % of hours instead of 10 %).
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import average_precision_score, roc_auc_score

SEED = 42
LOW_INERTIA_SHARE = 0.10  # the lowest 10 % of training deviations count as "low"
WINDOW_HOURS = 24 * 30
TEST_SHARE = 0.20  # the last 20 % of the period is held out


def calendar_features(index: pd.DatetimeIndex) -> pd.DataFrame:
    """Cyclical hour of day, month and a weekend flag (Copenhagen time)."""
    local = index.tz_convert("Europe/Copenhagen")
    return pd.DataFrame(
        {
            "hour_sin": np.sin(2 * np.pi * local.hour / 24),
            "hour_cos": np.cos(2 * np.pi * local.hour / 24),
            "month_sin": np.sin(2 * np.pi * local.month / 12),
            "month_cos": np.cos(2 * np.pi * local.month / 12),
            "weekend": (local.dayofweek >= 5).astype(int),
        },
        index=index,
    )


def _fit_score(
    train_x: pd.DataFrame,
    train_y: np.ndarray,
    test_x: pd.DataFrame,
    test_y: np.ndarray,
) -> dict[str, float]:
    model = HistGradientBoostingClassifier(
        max_depth=3, max_iter=150, learning_rate=0.08, random_state=SEED
    )
    model.fit(train_x, train_y)
    scores = model.predict_proba(test_x)[:, 1]
    return {
        "auc": float(roc_auc_score(test_y, scores)),
        "average_precision": float(average_precision_score(test_y, scores)),
    }


def deviation_from_recent(inertia: pd.Series) -> pd.Series:
    """Inertia minus the median of the previous 30 days (never uses the future)."""
    recent = inertia.rolling(WINDOW_HOURS, min_periods=WINDOW_HOURS // 2).median()
    return (inertia - recent.shift(1)).dropna()


def low_inertia_model(table: pd.DataFrame) -> dict[str, Any]:
    """Compare a calendar-only baseline with a model that also sees wind and solar."""
    table = table.sort_index()
    deviation = deviation_from_recent(table["inertia_dk2"])
    table = table.loc[deviation.index]
    cut = int(len(table) * (1 - TEST_SHARE))
    train, test = table.iloc[:cut], table.iloc[cut:]
    threshold = float(deviation.iloc[:cut].quantile(LOW_INERTIA_SHARE))
    train_y = (deviation.iloc[:cut] <= threshold).to_numpy()
    test_y = (deviation.iloc[cut:] <= threshold).to_numpy()

    calendar_train = calendar_features(train.index)
    calendar_test = calendar_features(test.index)
    renewables = ["re_share_dk1", "re_share_dk2"]
    baseline = _fit_score(calendar_train, train_y, calendar_test, test_y)
    full = _fit_score(
        calendar_train.join(train[renewables]),
        train_y,
        calendar_test.join(test[renewables]),
        test_y,
    )
    return {
        "target": "DK2 inertia well below its level of the previous 30 days",
        "thresholdGWs": round(threshold, 2),
        "trainHours": int(len(train)),
        "testHours": int(len(test)),
        "testFrom": test.index[0].isoformat(),
        "lowShareTest": round(float(test_y.mean()), 3),
        "baseline": {k: round(v, 3) for k, v in baseline.items()},
        "withRenewables": {k: round(v, 3) for k, v in full.items()},
        "aucGain": round(full["auc"] - baseline["auc"], 3),
        "chance": round(float(test_y.mean()), 3),
    }
