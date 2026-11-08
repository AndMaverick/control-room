"""roi.lens: estimate AI use-case ROI as a range, not a single hopeful number."""

from __future__ import annotations

import random
from dataclasses import dataclass

__version__ = "0.1.0"


@dataclass(frozen=True)
class UseCase:
    name: str
    users: int
    hours_saved_per_user_month: tuple   # (low, expected, high)
    hourly_cost: float
    adoption: tuple                     # (low, expected, high) share of users who use it, 0 to 1
    monthly_run_cost: float
    build_cost: float


def triangular(rng: random.Random, spec: tuple) -> float:
    low, mode, high = spec
    if not low <= mode <= high:
        raise ValueError("expected low <= expected <= high")
    return rng.triangular(low, high, mode)


def monthly_value(case: UseCase, hours: float, adoption: float) -> float:
    return case.users * adoption * hours * case.hourly_cost


def point_estimate(case: UseCase, months: int = 12) -> dict:
    """ROI using the expected value of every input."""
    value = monthly_value(case, case.hours_saved_per_user_month[1], case.adoption[1])
    net = (value - case.monthly_run_cost) * months - case.build_cost
    return {"net": round(net, 2), "roi": round(net / case.build_cost, 4) if case.build_cost else None}


def simulate(case: UseCase, months: int = 12, trials: int = 5000, seed: int = 7) -> dict:
    """Monte Carlo over the uncertain inputs. Seeded, so results are reproducible."""
    rng = random.Random(seed)
    nets = []
    for _ in range(trials):
        hours = triangular(rng, case.hours_saved_per_user_month)
        adopt = triangular(rng, case.adoption)
        value = monthly_value(case, hours, adopt)
        nets.append((value - case.monthly_run_cost) * months - case.build_cost)
    nets.sort()

    def pct(p: float) -> float:
        return round(nets[min(len(nets) - 1, int(p * len(nets)))], 2)

    return {"p10": pct(0.10), "p50": pct(0.50), "p90": pct(0.90),
            "prob_positive": round(sum(n > 0 for n in nets) / len(nets), 4)}


def rank(cases: list, months: int = 12, trials: int = 2000, seed: int = 7) -> list:
    """Use cases ordered by median net value, with the odds of losing money alongside."""
    rows = []
    for case in cases:
        result = simulate(case, months, trials, seed)
        rows.append({"name": case.name, **result})
    return sorted(rows, key=lambda r: (-r["p50"], r["name"]))
