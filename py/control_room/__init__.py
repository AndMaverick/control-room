"""Control Room harness.

This package is the adapter between the AndMaverick tools and the interface. It does three things:
generates seeded synthetic scenario data, calls the real tool functions, and reports every call
with its inputs and outputs. Anything computed here rather than by a tool is labelled "derived".
"""

from .engine import SCENARIOS, Session, scenario_summary
from .question import assess

__all__ = ["SCENARIOS", "Session", "scenario_summary", "assess"]
