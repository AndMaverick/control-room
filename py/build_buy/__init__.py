"""build.buy: compare build and buy options for an AI capability over several years."""

from __future__ import annotations

from dataclasses import dataclass

__version__ = "0.1.0"


@dataclass(frozen=True)
class Option:
    name: str
    upfront: float          # one-time cost in year 0
    annual: float           # recurring cost per year
    annual_growth: float = 0.0   # yearly growth of the recurring cost, as a fraction
    annual_benefit: float = 0.0
    delay_years: int = 0    # years before benefits start

    def costs(self, years: int) -> list:
        return [self.annual * (1 + self.annual_growth) ** y for y in range(years)]

    def benefits(self, years: int) -> list:
        return [self.annual_benefit if y >= self.delay_years else 0.0 for y in range(years)]


def npv(cash_flows: list, rate: float) -> float:
    """Net present value where cash_flows[0] happens now."""
    return sum(cf / (1 + rate) ** t for t, cf in enumerate(cash_flows))


def net_flows(option: Option, years: int) -> list:
    """Yearly net cash flow. Year 0 carries the upfront cost; years run 0 to years-1."""
    flows = [b - c for b, c in zip(option.benefits(years), option.costs(years))]
    flows[0] -= option.upfront
    return flows


def evaluate(option: Option, years: int, rate: float) -> dict:
    flows = net_flows(option, years)
    total_cost = option.upfront + sum(option.costs(years))
    return {"name": option.name, "npv": round(npv(flows, rate), 2),
            "total_cost": round(total_cost, 2), "payback_year": payback(flows)}


def payback(flows: list):
    """First year index where cumulative net cash flow turns non-negative, or None."""
    running = 0.0
    for year, flow in enumerate(flows):
        running += flow
        if running >= 0:
            return year
    return None


def compare(options: list, years: int = 5, rate: float = 0.1) -> list:
    """Options ranked by net present value, best first."""
    if years < 1:
        raise ValueError("years must be at least 1")
    return sorted((evaluate(o, years, rate) for o in options), key=lambda r: (-r["npv"], r["name"]))


def crossover_year(a: Option, b: Option, horizon: int = 15):
    """First year when the cumulative-cost ordering of a and b flips, or None within the horizon.

    Year 0 sets the starting order (including each option's first recurring cost). A flip means
    the option that started cheaper has become the more expensive one.
    """
    cum_a, cum_b = a.upfront, b.upfront
    start = None
    for year in range(horizon):
        cum_a += a.annual * (1 + a.annual_growth) ** year
        cum_b += b.annual * (1 + b.annual_growth) ** year
        order = (cum_a > cum_b) - (cum_a < cum_b)
        if start is None:
            start = order
        elif order != start and order != 0:
            return year
    return None
