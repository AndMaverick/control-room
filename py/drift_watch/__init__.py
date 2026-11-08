"""drift.watch: population stability and distribution drift for model inputs and outputs."""

from __future__ import annotations

import math
from bisect import bisect_right

__version__ = "0.1.0"

EPS = 1e-4


def _quantile_edges(values, bins: int) -> list:
    ordered = sorted(values)
    edges = {ordered[min(len(ordered) - 1, int(i * len(ordered) / bins))] for i in range(1, bins)}
    return sorted(edges)


def _proportions(values, edges) -> list:
    counts = [0] * (len(edges) + 1)
    for value in values:
        counts[bisect_right(edges, value)] += 1
    total = len(values)
    return [max(c / total, EPS) for c in counts]


def _psi_from(expected, actual) -> float:
    return sum((a - e) * math.log(a / e) for e, a in zip(expected, actual))


def psi(expected, actual, bins: int = 10) -> float:
    """Population Stability Index of actual against expected, using expected's quantile bins."""
    if not expected or not actual:
        raise ValueError("both samples must be non-empty")
    edges = _quantile_edges(expected, bins)
    return _psi_from(_proportions(expected, edges), _proportions(actual, edges))


def categorical_psi(expected: dict, actual: dict) -> float:
    keys = sorted(set(expected) | set(actual))
    e_total, a_total = sum(expected.values()), sum(actual.values())
    e = [max(expected.get(k, 0) / e_total, EPS) for k in keys]
    a = [max(actual.get(k, 0) / a_total, EPS) for k in keys]
    return _psi_from(e, a)


def ks_stat(a, b) -> float:
    """Two-sample Kolmogorov-Smirnov statistic: the largest gap between empirical CDFs."""
    left, right = sorted(a), sorted(b)
    points = sorted(set(left) | set(right))
    worst = 0.0
    for point in points:
        gap = abs(bisect_right(left, point) / len(left) - bisect_right(right, point) / len(right))
        worst = max(worst, gap)
    return worst


def status(value: float) -> str:
    if value < 0.1:
        return "stable"
    if value < 0.25:
        return "moderate"
    return "major"


def report(expected, actual, bins: int = 10) -> dict:
    p = psi(expected, actual, bins)
    return {"psi": round(p, 4), "ks": round(ks_stat(expected, actual), 4), "status": status(p)}
