"""sovereign.map: check AI data flows against residency rules you define. Not legal advice."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

__version__ = "0.1.0"


@dataclass(frozen=True)
class Node:
    name: str
    jurisdiction: str  # any label you choose: "AE", "EU", "US-East", "on-prem"


@dataclass(frozen=True)
class Flow:
    src: str
    dst: str
    data_class: str


@dataclass(frozen=True)
class Violation:
    flow: Flow
    reason: str


def check(nodes: dict, flows, allowed: dict) -> list:
    """Return every flow that breaks a rule.

    allowed maps a data class to the set of jurisdictions it may be processed in.
    A data class with no entry is unrestricted. Both ends of a flow must comply,
    because data is processed at the source as well as at the destination.
    """
    violations = []
    for flow in flows:
        missing = [n for n in (flow.src, flow.dst) if n not in nodes]
        if missing:
            violations.append(Violation(flow, f"unknown node: {', '.join(missing)}"))
            continue
        permitted = allowed.get(flow.data_class)
        if permitted is None:
            continue
        for end in (flow.src, flow.dst):
            where = nodes[end].jurisdiction
            if where not in permitted:
                violations.append(Violation(flow, f"{flow.data_class} may not be processed in {where} ({end})"))
    return violations


def exposure(nodes: dict, flows) -> dict:
    """For each data class, the set of jurisdictions it touches."""
    touched: dict = defaultdict(set)
    for flow in flows:
        for end in (flow.src, flow.dst):
            if end in nodes:
                touched[flow.data_class].add(nodes[end].jurisdiction)
    return {k: sorted(v) for k, v in sorted(touched.items())}


def egress(nodes: dict, flows, home: str) -> list:
    """Flows that leave the home jurisdiction."""
    return [f for f in flows if f.src in nodes and f.dst in nodes
            and nodes[f.src].jurisdiction == home and nodes[f.dst].jurisdiction != home]
