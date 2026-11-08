"""model.ledger: LLM spend accounting with a price book, team budgets, and spike detection."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from statistics import mean, pstdev

__version__ = "0.1.0"


class UnknownModel(KeyError):
    """A usage event referenced a model with no price."""


@dataclass(frozen=True)
class Price:
    input_per_1k: float
    output_per_1k: float


@dataclass(frozen=True)
class Usage:
    team: str
    model: str
    input_tokens: int
    output_tokens: int
    day: str  # ISO date, YYYY-MM-DD


class Ledger:
    def __init__(self, prices: dict, budgets: dict | None = None) -> None:
        self.prices = dict(prices)
        self.budgets = dict(budgets or {})
        self.events: list = []

    def cost(self, usage: Usage) -> float:
        price = self.prices.get(usage.model)
        if price is None:
            raise UnknownModel(usage.model)
        return round(usage.input_tokens / 1000 * price.input_per_1k
                     + usage.output_tokens / 1000 * price.output_per_1k, 6)

    def record(self, usage: Usage) -> float:
        cost = self.cost(usage)
        self.events.append((usage, cost))
        return cost

    def _select(self, team=None):
        return [(u, c) for u, c in self.events if team is None or u.team == team]

    def total(self, team: str | None = None) -> float:
        return round(sum(c for _, c in self._select(team)), 6)

    def by_team(self) -> dict:
        out: dict = defaultdict(float)
        for usage, cost in self.events:
            out[usage.team] += cost
        return {k: round(v, 6) for k, v in sorted(out.items())}

    def by_model(self) -> dict:
        out: dict = defaultdict(float)
        for usage, cost in self.events:
            out[usage.model] += cost
        return {k: round(v, 6) for k, v in sorted(out.items())}

    def over_budget(self) -> dict:
        """Teams whose spend exceeds their budget, as {team: (spend, budget)}."""
        spend = self.by_team()
        return {t: (spend[t], b) for t, b in self.budgets.items() if spend.get(t, 0.0) > b}

    def daily(self, team: str | None = None) -> dict:
        out: dict = defaultdict(float)
        for usage, cost in self._select(team):
            out[usage.day] += cost
        return {k: round(v, 6) for k, v in sorted(out.items())}

    def spikes(self, z: float = 3.0, team: str | None = None, min_history: int = 3) -> list:
        """Days whose spend exceeds the mean of all prior days by z deviations.

        The deviation is floored at 10 percent of the mean so a perfectly flat
        history does not flag trivial noise.
        """
        days = list(self.daily(team).items())
        flagged = []
        for index in range(min_history, len(days)):
            history = [v for _, v in days[:index]]
            base = mean(history)
            spread = max(pstdev(history), 0.1 * base)
            day, value = days[index]
            if value > base + z * spread:
                flagged.append(day)
        return flagged
