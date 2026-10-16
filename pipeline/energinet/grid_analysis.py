"""Statistics and clustering of the hourly table.

Nothing here touches the network: it takes the table built by ``transforms`` and
returns plain dictionaries ready to be written as JSON.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.ensemble import IsolationForest
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import QuantileTransformer

from grid_transforms import SYSTEM_FEATURES

SEED = 42
K_RANGE = range(3, 7)
OUTLIER_SHARE = 0.01

FEATURE_WORDS = {
    "re_share_dk1": ("low wind and solar in DK1", "high wind and solar in DK1"),
    "re_share_dk2": ("low wind and solar in DK2", "high wind and solar in DK2"),
    "inertia_dk2": ("low local inertia", "high local inertia"),
    "inertia_nordic": ("low Nordic inertia", "high Nordic inertia"),
    "fcr_mw": ("little reserve bought", "much reserve bought"),
    "imbalance_gap_eur": ("calm balancing", "stressed balancing"),
}


def scale(table: pd.DataFrame) -> np.ndarray:
    """Map each feature to a normal shape by rank.

    Prices have extreme spikes; a rank-based transform keeps a few hours with
    prices in the thousands from defining a cluster of their own.
    """
    transformer = QuantileTransformer(
        n_quantiles=1000, output_distribution="normal", random_state=SEED
    )
    return transformer.fit_transform(table[SYSTEM_FEATURES])


def choose_k(scaled: np.ndarray) -> tuple[int, dict[int, float]]:
    """Pick the number of clusters with the best silhouette score."""
    scores: dict[int, float] = {}
    sample = min(len(scaled), 4000)
    for k in K_RANGE:
        labels = KMeans(k, n_init=10, random_state=SEED).fit_predict(scaled)
        scores[k] = float(
            silhouette_score(scaled, labels, sample_size=sample, random_state=SEED)
        )
    return max(scores, key=scores.get), scores


def fit_clusters(table: pd.DataFrame) -> dict[str, Any]:
    """Cluster hours, project them on two axes and flag unusual hours."""
    scaled = scale(table)
    k, scores = choose_k(scaled)
    labels = KMeans(k, n_init=10, random_state=SEED).fit_predict(scaled)
    pca = PCA(n_components=2, random_state=SEED)
    coordinates = pca.fit_transform(scaled)
    forest = IsolationForest(contamination=OUTLIER_SHARE, random_state=SEED)
    outlier = forest.fit_predict(scaled) == -1
    return {
        "k": k,
        "silhouette": scores,
        "labels": labels,
        "coordinates": coordinates,
        "explained": pca.explained_variance_ratio_.tolist(),
        "outlier": outlier,
        "scaled": scaled,
    }


def order_by_renewables(table: pd.DataFrame, labels: np.ndarray) -> np.ndarray:
    """Renumber clusters so that 0 has the lowest wind and solar share."""
    means = table.groupby(labels)["re_share_dk1"].mean().sort_values()
    mapping = {old: new for new, old in enumerate(means.index)}
    return np.array([mapping[label] for label in labels])


def describe(table: pd.DataFrame, labels: np.ndarray, scaled: np.ndarray) -> list[dict]:
    """One summary per cluster: size, typical values and a short plain label."""
    z = pd.DataFrame(scaled, columns=SYSTEM_FEATURES, index=table.index)
    out = []
    for cluster in sorted(set(labels)):
        mask = labels == cluster
        sub = table[mask]
        zmean = z[mask].mean()
        strong = zmean.abs().sort_values(ascending=False).head(2)
        words = [
            FEATURE_WORDS[name][1 if zmean[name] > 0 else 0]
            for name in strong.index
            if abs(zmean[name]) >= 0.4
        ]
        local = sub["local_re_share"].dropna()
        out.append(
            {
                "id": int(cluster),
                "hours": int(mask.sum()),
                "share": round(float(mask.mean()), 4),
                "label": " · ".join(words) if words else "close to average",
                "mean": {f: round(float(sub[f].mean()), 3) for f in SYSTEM_FEATURES},
                "local": {
                    "hours": int(local.size),
                    "median": _round(local.median()),
                    "p25": _round(local.quantile(0.25)),
                    "p75": _round(local.quantile(0.75)),
                },
            }
        )
    return out


def _round(value: float, digits: int = 3) -> float | None:
    return None if pd.isna(value) else round(float(value), digits)


def overall_local(table: pd.DataFrame) -> dict[str, Any]:
    """Median and quartiles of the local renewable coverage over all hours."""
    local = table["local_re_share"].dropna()
    return {
        "hours": int(local.size),
        "median": _round(local.median()),
        "p25": _round(local.quantile(0.25)),
        "p75": _round(local.quantile(0.75)),
    }


def correlations(table: pd.DataFrame) -> dict[str, Any]:
    """Pearson correlations between the system features and the local share."""
    columns = [*SYSTEM_FEATURES, "local_re_share"]
    matrix = table[columns].corr(method="pearson")
    return {
        "columns": columns,
        "matrix": [[_round(v, 2) for v in row] for row in matrix.to_numpy()],
    }


def profile(table: pd.DataFrame, labels: np.ndarray, by: str) -> list[dict]:
    """Median local renewable share by hour of day or month, per cluster."""
    local = table["local_re_share"]
    index = table.index.tz_convert("Europe/Copenhagen")
    key = index.hour if by == "hour" else index.month
    frame = pd.DataFrame({"key": key, "cluster": labels, "local": local.to_numpy()})
    frame = frame.dropna(subset=["local"])
    grouped = frame.groupby("key")["local"]
    return [
        {"key": int(k), "median": _round(m), "hours": int(n)}
        for k, m, n in zip(
            grouped.median().index, grouped.median(), grouped.size(), strict=True
        )
    ]
