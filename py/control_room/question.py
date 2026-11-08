"""The Million Dollar Question: a visitor's own assumptions run through the real economics tools."""

from __future__ import annotations

from datetime import date

import build_buy
import model_ledger
import roi_lens

from .engine import PRICES

DEFAULTS = {
    "monthly_requests": 9_000_000, "input_tokens": 1800, "output_tokens": 450,
    "mix": {"frontier": 15, "balanced": 35, "fast": 50}, "monthly_growth_pct": 3.0,
    "infra_monthly": 85_000, "implementation_cost": 1_800_000, "retry_pct": 4.0,
    "users": 3000, "hours_per_user_month": 3.0, "hourly_cost": 85.0, "adoption_pct": 60.0,
    "build_upfront": 3_000_000, "build_annual": 2_300_000, "build_delay_years": 1,
    "routable_pct": 35.0, "trim_pct": 20.0, "target_retry_pct": 1.0,
}


def _month_day(i: int) -> str:
    y, m = divmod(2026 * 12 + 0 + i, 12)
    return date(y, m + 1, 1).isoformat()


def _run(requests: float, tin: float, tout: float, mix: dict, growth: float, months: int, retry: float) -> model_ledger.Ledger:
    ledger = model_ledger.Ledger(PRICES)
    total_mix = sum(mix.values()) or 1
    for i in range(months):
        volume = requests * (1 + growth) ** i * (1 + retry)
        for model, share in mix.items():
            part = volume * share / total_mix
            if part <= 0:
                continue
            ledger.record(model_ledger.Usage("program", model, int(part * tin), int(part * tout), _month_day(i)))
    return ledger


def _year_sums(ledger: model_ledger.Ledger, months: int) -> list:
    daily = ledger.daily()
    values = [daily.get(_month_day(i), 0.0) for i in range(months)]
    return [sum(values[y * 12:(y + 1) * 12]) for y in range(months // 12)]


def assess(raw: dict) -> dict:
    p = {**DEFAULTS, **{k: v for k, v in raw.items() if v is not None}}
    p["mix"] = {**DEFAULTS["mix"], **(raw.get("mix") or {})}
    g = p["monthly_growth_pct"] / 100
    retry = p["retry_pct"] / 100
    months = 36
    calls = []

    ledger = _run(p["monthly_requests"], p["input_tokens"], p["output_tokens"], p["mix"], g, months, retry)
    y1, y2, y3 = _year_sums(ledger, months)
    infra_year = p["infra_monthly"] * 12
    inference_month1 = ledger.daily().get(_month_day(0), 0.0)
    calls.append({"tool": "model.ledger", "call": "Ledger.record(Usage(...)) x %d, Ledger.daily()" % len(ledger.events),
                  "result": {"year1_inference": round(y1), "year2_inference": round(y2), "year3_inference": round(y3)}})

    year1_requests = sum(p["monthly_requests"] * (1 + g) ** i * (1 + retry) for i in range(12))
    cost_outlook = {
        "monthly_now": round(inference_month1 + p["infra_monthly"]),
        "year1": round(y1 + infra_year), "year2": round(y2 + infra_year), "year3": round(y3 + infra_year),
        "inference_share_year1": round(y1 / (y1 + infra_year), 4),
    }
    unit = {"cost_per_request_year1": round((y1 + infra_year) / year1_requests, 5) if year1_requests else 0.0,
            "inference_only_per_request": round(y1 / year1_requests, 5) if year1_requests else 0.0}

    scaling = []
    for mult in (0.5, 1, 2, 5, 10):
        led = _run(p["monthly_requests"] * mult, p["input_tokens"], p["output_tokens"], p["mix"], 0.0, 1, retry)
        month = led.total() + p["infra_monthly"]
        scaling.append({"multiple": mult, "monthly_cost": round(month),
                        "cost_per_request": round(month / (p["monthly_requests"] * mult * (1 + retry)), 5) if p["monthly_requests"] else 0.0})
    calls.append({"tool": "model.ledger", "call": "Ledger.total() at 0.5x, 1x, 2x, 5x, 10x volume",
                  "result": [{k: s[k] for k in ("multiple", "monthly_cost")} for s in scaling]})

    adoption = p["adoption_pct"] / 100
    hours = (p["hours_per_user_month"] * 0.5, p["hours_per_user_month"], p["hours_per_user_month"] * 1.5)
    adopt = (max(0.01, adoption - 0.15), adoption, min(1.0, adoption + 0.15))
    case = roi_lens.UseCase("your-program", p["users"], hours, p["hourly_cost"], adopt,
                            (y1 + infra_year) / 12, p["implementation_cost"])
    sim, point = roi_lens.simulate(case), roi_lens.point_estimate(case)
    calls.append({"tool": "roi.lens", "call": "simulate(UseCase) and point_estimate(UseCase)", "result": {"simulate": sim, "point": point}})

    annual_value = p["users"] * adoption * p["hours_per_user_month"] * p["hourly_cost"] * 12
    cagr = (y3 + infra_year) / (y1 + infra_year)
    cagr = cagr ** 0.5 - 1 if cagr > 0 else 0.0
    buy = build_buy.Option("buy (keep paying per use)", upfront=p["implementation_cost"], annual=y1 + infra_year,
                           annual_growth=cagr, annual_benefit=annual_value)
    build = build_buy.Option("build (own the stack)", upfront=p["build_upfront"], annual=p["build_annual"],
                             annual_growth=0.05, annual_benefit=annual_value, delay_years=int(p["build_delay_years"]))
    compared = build_buy.compare([buy, build], years=5, rate=0.10)
    cross = build_buy.crossover_year(build, buy)
    calls.append({"tool": "build.buy", "call": "compare([buy, build], years=5, rate=0.10), crossover_year(build, buy)",
                  "result": {"ranked": compared, "crossover_year": cross}})

    def y1_cost(requests=None, tin=None, tout=None, mix=None, retry_rate=None):
        led = _run(requests or p["monthly_requests"], tin or p["input_tokens"], tout or p["output_tokens"],
                   mix or p["mix"], g, 12, retry if retry_rate is None else retry_rate)
        return sum(_year_sums(led, 12))

    base_y1 = y1_cost()
    routable = p["routable_pct"] / 100
    moved = dict(p["mix"])
    shift = moved["frontier"] * routable
    moved["frontier"] -= shift
    moved["balanced"] += shift
    opportunities = [
        {"title": "Route simple work to a smaller model",
         "assumption": f"{p['routable_pct']:.0f}% of frontier traffic can be served by the balanced tier",
         "annual_saving": round(base_y1 - y1_cost(mix=moved))},
        {"title": "Trim prompts and context",
         "assumption": f"{p['trim_pct']:.0f}% fewer input tokens per request",
         "annual_saving": round(base_y1 - y1_cost(tin=p["input_tokens"] * (1 - p["trim_pct"] / 100)))},
        {"title": "Reduce failed calls and retries",
         "assumption": f"retry rate from {p['retry_pct']:.1f}% to {p['target_retry_pct']:.1f}%",
         "annual_saving": round(base_y1 - y1_cost(retry_rate=p["target_retry_pct"] / 100))},
    ]
    calls.append({"tool": "model.ledger", "call": "Ledger re-run with each change applied",
                  "result": [{o["title"]: o["annual_saving"]} for o in opportunities]})

    return {
        "inputs": p,
        "cost_outlook": cost_outlook, "unit_economics": unit, "scaling": scaling,
        "roi": {"simulate": sim, "point": point, "annual_value": round(annual_value),
                "ranges": {"hours": [round(x, 3) for x in hours], "adoption": [round(x, 3) for x in adopt]}},
        "build_vs_buy": {"ranked": compared, "crossover_year": cross, "buy_cost_growth": round(cagr, 4)},
        "opportunities": opportunities,
        "executed": calls,
        "notes": [
            "Prices are synthetic tiers, not any vendor's published rates. Replace them with yours.",
            "Value per user comes from your hours and hourly cost inputs. roi.lens spreads them into a range.",
            "Build vs buy assumes both paths deliver the same benefit once live. The build path starts late.",
        ],
    }
