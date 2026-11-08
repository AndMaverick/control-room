"""Harness tests. They run the same Python the browser runs, natively, with the standard library only."""
import json, pathlib, sys, unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
PY = ROOT / "py"
sys.path.insert(0, str(PY))

import model_ledger, sovereign_map, control_room  # noqa: E402
from control_room import SCENARIOS, Session, assess  # noqa: E402


def run_all(key, overrides=None):
    s = Session(key, overrides)
    out = {}
    for name in ("cost", "injection", "drift", "sovereignty", "economics"):
        out[name] = getattr(s, "incident_" + name)()
    return out


class ScenarioTests(unittest.TestCase):
    def test_every_scenario_runs_and_tells_a_coherent_story(self):
        for key in SCENARIOS:
            r = run_all(key)
            self.assertGreater(r["cost"]["headline"]["after"], r["cost"]["headline"]["before"] * 1.3, key)
            self.assertEqual(r["cost"]["status"], "BREACH", key)
            self.assertTrue(r["injection"]["headline"]["attack_blocked"], key)
            self.assertEqual(r["drift"]["headline"]["status"] in ("moderate", "major"), True, key)
            self.assertEqual(r["sovereignty"]["headline"]["before"], 0, key)
            self.assertGreater(r["sovereignty"]["headline"]["after"], 0, key)
            self.assertLess(r["economics"]["headline"]["p50_after"], r["economics"]["headline"]["p50_before"], key)

    def test_results_are_reproducible(self):
        self.assertEqual(json.dumps(run_all("bank"), sort_keys=True), json.dumps(run_all("bank"), sort_keys=True))

    def test_results_respond_to_inputs(self):
        calm = run_all("bank", {"escalation_out_multiplier": 1.0, "escalation_in_multiplier": 1.0, "escalation_request_multiplier": 1.0})
        wild = run_all("bank", {"escalation_out_multiplier": 6.0})
        self.assertLess(calm["cost"]["headline"]["after"], wild["cost"]["headline"]["after"])
        self.assertEqual(calm["cost"]["status"], "NORMAL")

    def test_headline_matches_the_tool_call(self):
        """Displayed numbers must be recomputable from the recorded tool output."""
        r = run_all("sovereign")["economics"]
        self.assertEqual(r["headline"]["p50_after"], r["executed"][1]["result"]["p50"])
        total = run_all("bank")["cost"]["executed"][1]["result"]
        s = Session("bank"); s.incident_cost()
        self.assertEqual(total, s.ledger.total())

    def test_economics_requires_prior_incidents(self):
        with self.assertRaises(RuntimeError):
            Session("bank").incident_economics()

    def test_sovereignty_uses_the_tool_not_a_script(self):
        cfg = SCENARIOS["bank"]["sovereignty"]
        nodes = {n: sovereign_map.Node(n, j) for n, j in cfg["nodes"].items()}
        flows = [sovereign_map.Flow(*f) for f in cfg["baseline_flows"] + cfg["incident_flows"]]
        expected = len(sovereign_map.check(nodes, flows, {k: set(v) for k, v in cfg["allowed"].items()}))
        self.assertEqual(run_all("bank")["sovereignty"]["headline"]["after"], expected)


class QuestionTests(unittest.TestCase):
    def test_defaults_produce_every_section(self):
        r = assess({})
        for k in ("cost_outlook", "unit_economics", "scaling", "roi", "build_vs_buy", "opportunities", "executed"):
            self.assertIn(k, r)
        self.assertEqual(len(r["scaling"]), 5)

    def test_cost_scales_with_volume(self):
        low, high = assess({"monthly_requests": 1_000_000}), assess({"monthly_requests": 8_000_000})
        self.assertLess(low["cost_outlook"]["year1"], high["cost_outlook"]["year1"])

    def test_year_one_matches_an_independent_ledger_run(self):
        r = assess({"monthly_growth_pct": 0, "retry_pct": 0, "infra_monthly": 0, "monthly_requests": 1_000_000,
                    "mix": {"frontier": 0, "balanced": 0, "fast": 100}})
        price = control_room.engine.PRICES["fast"]
        expected = 12 * (1_000_000 * 1800 / 1000 * price.input_per_1k + 1_000_000 * 450 / 1000 * price.output_per_1k)
        self.assertAlmostEqual(r["cost_outlook"]["year1"], expected, delta=12)

    def test_savings_are_positive_when_assumptions_are_sensible(self):
        for o in assess({})["opportunities"]:
            self.assertGreater(o["annual_saving"], 0)

    def test_zero_volume_does_not_crash(self):
        assess({"monthly_requests": 0})


class VendoredSourceTests(unittest.TestCase):
    """The tools shipped here must be the tools in the repositories."""
    def test_manifest_lists_every_file(self):
        listed = set(json.loads((PY / "manifest.json").read_text())["files"])
        actual = {str(p.relative_to(PY)) for p in PY.rglob("*.py")}
        self.assertEqual(listed, actual)


if __name__ == "__main__":
    unittest.main()
