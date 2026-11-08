# The AndMaverick Control Room

A private demonstration of what happens when enterprise AI goes wrong, and how real, inspectable engineering catches it.

**Live: https://andmaverick.github.io/control-room/**

You have a $12 million AI program. Choose an environment (a global investment bank, a sovereign government program, or an AI company scaling to 10 million users), break the system, and watch five of the AndMaverick tools diagnose a simulated production failure. Every analytical result on the page is the return value of a real function call, running in your browser.

| Incident | Tool that runs | What it does here |
|---|---|---|
| Cost escalation | [model.ledger](https://github.com/AndMaverick/model.ledger) | Records usage events, flags spend spikes, reports budget breaches |
| Input compromise | [guard.rails](https://github.com/AndMaverick/guard.rails) | Scores a prompt injection, redacts PII, returns a policy verdict |
| Performance degradation | [drift.watch](https://github.com/AndMaverick/drift.watch) | PSI and KS drift on evaluation scores and label mix |
| Jurisdictional exposure | [sovereign.map](https://github.com/AndMaverick/sovereign.map) | Checks data flows against residency rules |
| Economic deterioration | [roi.lens](https://github.com/AndMaverick/roi.lens) | Re-runs the return as a range, before and after |

Two more rooms share the same identity: **The Receipts** (an archive of public professional record, each entry labelled with what kind of evidence it is) and **The Million Dollar Question** (your own assumptions through model.ledger, roi.lens and build.buy, with a downloadable executive report).

## Honest by construction

- **Synthetic data, real execution.** Scenario inputs are made up and seeded. Results are produced by the tools. The page tags each item as a scenario input, an executed result, or arithmetic done by the harness, with the formula shown.
- **Nothing is hard-coded to look live.** Change an assumption and the numbers change. The test suite checks that displayed headlines match the recorded tool output, and that results respond to inputs.
- **Browser equals native.** tests/browser_equals_native.py runs every scenario in Python on your machine and in the browser, and asserts identical output.
- **The code on the page is the code on GitHub.** The Verify button downloads each tool's source file from GitHub and compares it with the copy running in the page.
- **Limits are shown.** guard.rails is a pattern heuristic. The Control Room feeds it a paraphrased attack that it misses, on purpose.
- **Prices are synthetic tiers**, not any vendor's rates. Outputs are modelled outlooks, not forecasts or financial advice.

## Architecture

```
index.html, receipts.html, question.html     the three rooms (plain HTML, no framework)
assets/shared.js                              engine loader, formatters, link and tracking helpers
assets/control-room.js, question.js, ...      each room's interface
py/<tool>/                                    verbatim copies of the six tools used
py/control_room/engine.py                     scenarios, synthetic data, the five incidents
py/control_room/question.py                   the assessment behind The Million Dollar Question
build.py                                      regenerates manifest, runtime chunks and inlined fonts
tests/                                        harness tests, browser-versus-native equality
```

The tools are dependency-free Python, so Pyodide runs them unmodified in the visitor's browser. The harness (`py/control_room`) is the only adapter: it generates seeded synthetic events, calls the tools, and returns inputs, executed calls and derived values separately. The hosted site is plain text files with no build step. The Python runtime (Pyodide 0.26.4) and the fonts load from the jsDelivr CDN, with an integrity hash on the runtime script. `python build.py path/to/node_modules` produces a fully self-contained variant that commits the runtime as gzip and base64 text chunks and inlines the fonts, for deployments that cannot reach a CDN.

## Run it

```
python -m http.server 8000      # then open http://localhost:8000
python -I -m unittest discover -s tests -t . -v
```

## Measurement and privacy

No cookies, no analytics scripts, nothing stored. The only third-party requests are the jsDelivr CDN (runtime and fonts). Outbound links to andmaverick.com and the booking page carry `utm_source=controlroom`, a medium, a campaign (the scenario or room) and a content label for the button, plus the visitor's inbound `utm_source` as `utm_term` when they arrived from a tagged link. Attribution therefore lands in the analytics already running on andmaverick.com, and this site collects nothing itself. The Verify button, when clicked, requests files from raw.githubusercontent.com.

## Adding a scenario

Add an entry to `SCENARIOS` in `py/control_room/engine.py` (teams, injection text, quality distribution, data flows and rules, value assumptions), add a card to `index.html`, and run the tests. The tests iterate every scenario and assert that the story holds: cost rises, the attack is blocked, a violation appears, the economics weaken.

MIT licensed. Built by [AndMaverick LLC](https://www.andmaverick.com).
