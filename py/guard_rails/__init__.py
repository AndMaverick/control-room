"""guard.rails: defensive input and output checks. PII redaction, injection heuristics, policy rules."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

__version__ = "0.1.0"

EMAIL = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
PHONE = re.compile(r"(?<!\d)(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)\d{3,4}[\s.-]?\d{3,4}(?!\d)")
CARD = re.compile(r"(?<!\d)(?:\d[ -]?){13,19}(?!\d)")
IPV4 = re.compile(r"\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b")

INJECTION_PATTERNS = [
    (re.compile(r"ignore (?:all |any )?(?:previous|prior|above) (?:instructions|prompts?)", re.I), 3),
    (re.compile(r"disregard (?:the |your )?(?:system|previous|above)", re.I), 3),
    (re.compile(r"reveal (?:your |the )?(?:system|hidden) prompt", re.I), 3),
    (re.compile(r"you are now (?:in )?(?:developer|dan|jailbreak)", re.I), 2),
    (re.compile(r"pretend (?:you have|there are) no (?:rules|restrictions)", re.I), 2),
    (re.compile(r"</?(?:system|assistant)>", re.I), 1),
]


def luhn_valid(digits: str) -> bool:
    nums = [int(c) for c in digits if c.isdigit()]
    if not 13 <= len(nums) <= 19:
        return False
    total = 0
    for index, value in enumerate(reversed(nums)):
        if index % 2 == 1:
            value *= 2
            if value > 9:
                value -= 9
        total += value
    return total % 10 == 0


@dataclass
class Finding:
    kind: str
    value: str


def redact(text: str):
    """Replace PII with typed placeholders. Returns (clean_text, findings)."""
    findings: list = []

    def swap(kind, pattern, source, check=None):
        def repl(match):
            if check and not check(match.group(0)):
                return match.group(0)
            findings.append(Finding(kind, match.group(0)))
            return f"[{kind}]"
        return pattern.sub(repl, source)

    text = swap("EMAIL", EMAIL, text)
    text = swap("CARD", CARD, text, luhn_valid)
    text = swap("IP", IPV4, text)
    text = swap("PHONE", PHONE, text, lambda s: sum(c.isdigit() for c in s) >= 9)
    return text, findings


def injection_score(text: str) -> int:
    return sum(weight for pattern, weight in INJECTION_PATTERNS if pattern.search(text))


@dataclass
class Verdict:
    allowed: bool
    reasons: list
    clean_text: str
    findings: list = field(default_factory=list)


@dataclass
class Policy:
    max_chars: int = 8000
    injection_threshold: int = 3
    blocked_terms: tuple = ()
    redact_pii: bool = True

    def check(self, text: str) -> Verdict:
        reasons = []
        if len(text) > self.max_chars:
            reasons.append(f"length {len(text)} exceeds {self.max_chars}")
        score = injection_score(text)
        if score >= self.injection_threshold:
            reasons.append(f"injection score {score}")
        lowered = text.lower()
        reasons += [f"blocked term: {t}" for t in self.blocked_terms if t.lower() in lowered]
        clean, findings = redact(text) if self.redact_pii else (text, [])
        return Verdict(not reasons, reasons, clean, findings)
