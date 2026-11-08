/* The Control Room: scenario choice, simulated incident sequence, real tool execution. */
(function () {
  "use strict";
  const { fmt, esc, pretty, links, TOOLS, reduced } = CR;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  CR.mountNav("index.html");

  const ORDER = ["cost", "injection", "drift", "sovereignty", "economics"];
  const META = {
    cost: { n: "01", title: "Cost escalation", tool: "model.ledger" },
    injection: { n: "02", title: "Input compromise", tool: "guard.rails" },
    drift: { n: "03", title: "Performance degradation", tool: "drift.watch" },
    sovereignty: { n: "04", title: "Jurisdictional exposure", tool: "sovereign.map" },
    economics: { n: "05", title: "Economic deterioration", tool: "roi.lens" },
  };
  const NAMES = { bank: "Global Investment Bank", sovereign: "Sovereign Government AI Program", scale: "AI Company Scaling to 10 Million Users" };
  const state = { engine: null, key: null, overrides: {}, results: {}, idx: 0, paused: false, timer: null, running: false, summary: null };

  /* ---------- engine ---------- */
  const loader = $("#loader");
  CR.loadEngine((m) => { loader.textContent = m; }).then((e) => {
    state.engine = e; state.summary = e.summary();
    loader.textContent = "Engine ready"; loader.classList.add("ok");
    setTimeout(() => (loader.hidden = true), 2400);
    if (state.key) prepare();
  }).catch((e) => { loader.textContent = "The engine could not start: " + e.message; });

  /* ---------- scenario selection ---------- */
  $$("#scenarios .scn").forEach((b) => b.addEventListener("click", () => {
    $$("#scenarios .scn").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    state.key = b.dataset.key; state.overrides = {}; CR.ctx.setEnv(NAMES[state.key]); CR.track("cr_scenario", { scenario: state.key });
    $("#brief").hidden = false;
    $("#brief").scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
    if (state.engine) prepare(); else $("#engine-note").textContent = "Starting the engine. This takes a few seconds the first time.";
  }));

  function prepare() {
    const inputs = state.engine.start(state.key, state.overrides);
    const s = state.summary[state.key];
    $("#b-name").textContent = s.name; $("#b-tag").textContent = s.tagline;
    const p = inputs.program;
    $("#b-program").innerHTML =
      row("Program budget", fmt.full(p.total), "input") + row("Build and integration", fmt.full(p.build), "input") +
      row("Remaining for run costs", fmt.full(p.total - p.build), "derived", "total minus build") +
      row("Quality threshold", inputs.quality.label + " ≥ " + inputs.quality.pass_at, "input") +
      row("Users in scope", fmt.int(inputs.value.users), "input") +
      row("Hourly value", inputs.value.hourly === 1 ? "$1 per unit (revenue per paying user)" : "$" + inputs.value.hourly, "input");
    $("#b-teams").innerHTML = '<tr><th>Team</th><th>Tier</th><th class="r">Requests / day</th><th class="r">Tokens in / out</th></tr>' +
      inputs.teams.map((t) => `<tr><td>${esc(t[0])}</td><td>${esc(t[1])}</td><td class="r">${fmt.int(t[2])}</td><td class="r">${fmt.int(t[3])} / ${fmt.int(t[4])}</td></tr>`).join("");
    $("#b-prices").textContent = Object.entries(inputs.prices_per_1k_tokens).map(([k, v]) => `${k} $${v[0]} in, $${v[1]} out`).join("; ");
    const a = inputs.assumptions;
    setKnob("k1", a.escalation_out_multiplier, (v) => v.toFixed(1) + "×", "escalation_out_multiplier");
    setKnob("k2", inputs.quality.regression, (v) => "−" + v.toFixed(3), "regression");
    setKnob("k3", inputs.value.adoption_drop, (v) => fmt.pct(v), "adoption_drop");
    setKnob("k4", inputs.value.remediation, (v) => fmt.full(v), "remediation");
    $("#break").disabled = false; $("#engine-note").textContent = "";
  }
  function row(l, v, kind, how) {
    return `<div style="display:flex;justify-content:space-between;gap:14px;padding:9px 0;border-bottom:1px solid rgba(201,169,110,.08);flex-wrap:wrap"><span class="dim">${l} <span class="tag ${kind}" ${how ? 'title="' + esc(how) + '"' : ""}>${kind === "input" ? "Input" : "Derived"}</span></span><span class="num" style="font-size:22px">${esc(v)}</span></div>`;
  }
  function setKnob(id, value, f, field) {
    const el = $("#" + id), out = $("#" + id + "v");
    el.value = value; out.textContent = f(parseFloat(value));
    el.oninput = () => { out.textContent = f(parseFloat(el.value)); state.overrides[field] = parseFloat(el.value); };
  }

  /* ---------- theatre ---------- */
  $("#break").addEventListener("click", begin);
  function begin() {
    if (!state.engine || !state.key) return;
    clearTimeout(state.timer);
    state.engine.start(state.key, state.overrides);
    state.results = {}; state.idx = 0; state.paused = false; state.running = true; CR.track("cr_break", { scenario: state.key });
    $("#pause").textContent = "Pause";
    $("#theatre").hidden = false; $("#findings").hidden = true;
    renderKpis(); renderLog(); drawDiagram(); $("#incident").innerHTML = '<p class="eyebrow">Initiating a simulated production incident</p>';
    $("#theatre").scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
    state.timer = setTimeout(runStep, reduced ? 0 : 1200);
  }
  function note(id, r) { CR.ctx.addIncident(META[id].title, r.status); CR.track("cr_incident", { incident: id, status: r.status, scenario: state.key }); }
  function runStep() {
    if (state.idx >= ORDER.length) return finish();
    const id = ORDER[state.idx];
    const res = state.engine.step(id);
    state.results[id] = res; note(id, res);
    highlight(id, res.status);
    renderIncident(id, res);
    updateKpis(id, res);
    renderLog();
    state.idx++;
    if (state.idx >= ORDER.length) { state.timer = setTimeout(finish, reduced ? 0 : 5200); return; }
    if (!state.paused && !reduced) state.timer = setTimeout(runStep, 7500);
  }
  $("#next").addEventListener("click", () => { clearTimeout(state.timer); if (state.idx < ORDER.length) runStep(); else finish(); });
  $("#pause").addEventListener("click", () => {
    state.paused = !state.paused; $("#pause").textContent = state.paused ? "Resume" : "Pause";
    clearTimeout(state.timer);
    if (!state.paused && state.idx < ORDER.length) state.timer = setTimeout(runStep, 800);
  });
  $("#skip").addEventListener("click", () => { clearTimeout(state.timer); while (state.idx < ORDER.length) { const id = ORDER[state.idx]; const r = state.engine.step(id); state.results[id] = r; note(id, r); updateKpis(id, r); renderIncident(id, r); state.idx++; } finish(); });
  $("#rerun").addEventListener("click", () => { $("#knobs").open = true; $("#brief").scrollIntoView({ behavior: reduced ? "auto" : "smooth" }); });

  function finish() {
    if (!state.running) return;
    state.running = false; clearTimeout(state.timer); CR.ctx.complete(); CR.track("cr_complete", { scenario: state.key });
    highlight(null); renderLog();
    renderFindings();
    $("#findings").hidden = false;
    $("#findings").scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  }

  /* ---------- KPIs ---------- */
  const KPI = [
    ["spend", "Annual AI spend"], ["cpr", "Cost per request"], ["pass", "Evaluation pass rate"],
    ["viol", "Residency violations"], ["roi", "Median 12-month return"], ["prob", "Chance the program pays back"],
  ];
  function renderKpis() {
    $("#kpis").innerHTML = KPI.map(([k, l]) => `<div class="panel pad kpi" id="kpi-${k}"><div class="label">${l}</div><div class="num idle" data-v="0">Standing by</div><div class="sub">&nbsp;</div></div>`).join("");
  }
  function setKpi(k, value, f, sub, cls) {
    const box = $("#kpi-" + k); if (!box) return;
    box.className = "panel pad kpi " + (cls || "");
    $(".num", box).classList.remove("idle"); CR.countTo($(".num", box), value, f); $(".sub", box).textContent = sub;
  }
  function updateKpis(id, r) {
    const d = (label) => (r.derived.find((x) => x.label === label) || {}).value;
    if (id === "cost") {
      setKpi("spend", r.headline.after, (v) => fmt.money(v), "was " + fmt.money(r.headline.before) + " a year", "bad");
      setKpi("cpr", d("Cost per request now"), (v) => fmt.cents(v), "was " + fmt.cents(d("Cost per request before")), "warn");
    } else if (id === "drift") {
      setKpi("pass", d("Pass rate after"), (v) => fmt.pct(v, 1), "was " + fmt.pct(d("Pass rate before"), 1), "warn");
    } else if (id === "sovereignty") {
      setKpi("viol", r.headline.after, (v) => String(Math.round(v)), "was " + r.headline.before, r.headline.after ? "bad" : "good");
    } else if (id === "economics") {
      setKpi("roi", r.headline.p50_after, (v) => fmt.money(v), "was " + fmt.money(r.headline.p50_before), r.headline.p50_after < 0 ? "bad" : "warn");
      setKpi("prob", r.headline.prob_after, (v) => fmt.pct(v), "was " + fmt.pct(r.headline.prob_before), r.headline.prob_after < 0.5 ? "bad" : "warn");
    }
  }

  /* ---------- log ---------- */
  function renderLog() {
    $("#log").innerHTML = ORDER.map((id, i) => {
      const done = state.results[id], cur = i === state.idx - 1 && state.running;
      return `<span class="pip ${done ? "on" : ""} ${done && /BREACH|EXPOSED|MAJOR|WEAKENED/.test(done.status) ? "bad" : ""}" ${cur ? 'aria-current="step"' : ""}>${META[id].n} ${META[id].title}</span>`;
    }).join("");
  }

  /* ---------- architecture diagram ---------- */
  const NODES = {
    workflows: { x: 14, y: 176, w: 112, h: 64, label: "Workflows" },
    "guard.rails": { x: 168, y: 176, w: 130, h: 64, tool: true },
    models: { x: 340, y: 176, w: 112, h: 64, label: "Models" },
    outputs: { x: 494, y: 176, w: 112, h: 64, label: "Outputs" },
    "model.ledger": { x: 322, y: 306, w: 148, h: 64, tool: true },
    "drift.watch": { x: 478, y: 306, w: 148, h: 64, tool: true },
    "sovereign.map": { x: 232, y: 40, w: 160, h: 64, tool: true },
    "roi.lens": { x: 476, y: 40, w: 150, h: 64, tool: true },
  };
  const EDGES = {
    a: ["workflows", "guard.rails", "M126 208 H168"], b: ["guard.rails", "models", "M298 208 H340"], c: ["models", "outputs", "M452 208 H494"],
    d: ["models", "model.ledger", "M396 240 V306"], e: ["outputs", "drift.watch", "M550 240 V306"],
    f: ["sovereign.map", "guard.rails", "M262 104 V176"], g: ["sovereign.map", "models", "M360 104 V150 H396 V176"],
    h: ["model.ledger", "roi.lens", "M470 338 H452 V72 H476"], i: ["drift.watch", "roi.lens", "M602 306 V104"],
  };
  const ACTIVE = {
    cost: { nodes: ["models", "model.ledger"], edges: ["d"] },
    injection: { nodes: ["workflows", "guard.rails"], edges: ["a"] },
    drift: { nodes: ["outputs", "drift.watch"], edges: ["c", "e"] },
    sovereignty: { nodes: ["sovereign.map", "guard.rails", "models"], edges: ["f", "g"] },
    economics: { nodes: ["roi.lens", "model.ledger", "drift.watch"], edges: ["h", "i"] },
  };
  function drawDiagram() {
    const edges = Object.entries(EDGES).map(([k, [, , d]]) => `<path class="edge" id="e-${k}" d="${d}"/>`).join("");
    const nodes = Object.entries(NODES).map(([k, n]) => {
      const inner = n.tool
        ? `<text x="${n.x + n.w / 2}" y="${n.y + 24}" text-anchor="middle">${TOOLS[k].role}</text><text class="repo" x="${n.x + n.w / 2}" y="${n.y + 49}" text-anchor="middle">${k}</text>`
        : `<text x="${n.x + n.w / 2}" y="${n.y + n.h / 2 + 4}" text-anchor="middle">${n.label}</text>`;
      return `<g class="node" id="n-${k.replace(".", "-")}" ${n.tool ? `tabindex="0" role="link" aria-label="${k}: jump to findings" data-tool="${k}"` : ""}><rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}"/>${inner}</g>`;
    }).join("");
    $("#diagram").innerHTML = `<svg viewBox="0 0 640 400" role="img" aria-label="Architecture: workflows pass through guard.rails to models and outputs. model.ledger meters the models, drift.watch watches the outputs, sovereign.map governs where data may flow, and roi.lens recomputes the program economics."><rect class="zone" x="150" y="140" width="320" height="130" rx="2"/><text class="zone-label" x="162" y="134">Production path</text>${edges}${nodes}</svg>`;
    $$("#diagram .node[data-tool]").forEach((n) => {
      const go = () => { if (!$("#findings").hidden) { const c = document.getElementById("card-" + n.dataset.tool.replace(".", "-")); c && c.scrollIntoView({ behavior: reduced ? "auto" : "smooth" }); } };
      n.addEventListener("click", go); n.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    });
  }
  function highlight(id, status) {
    $$("#diagram .node").forEach((n) => n.classList.remove("live", "bad"));
    $$("#diagram .edge").forEach((e) => e.classList.remove("live"));
    if (!id) return;
    const a = ACTIVE[id], bad = /BREACH|EXPOSED|MAJOR|WEAKENED/.test(status || "");
    a.nodes.forEach((k) => { const n = document.getElementById("n-" + k.replace(".", "-")); n && n.classList.add("live"); });
    const primary = document.getElementById("n-" + META[id].tool.replace(".", "-")); if (primary && bad) primary.classList.add("bad");
    a.edges.forEach((k) => document.getElementById("e-" + k).classList.add("live"));
  }

  /* ---------- incident renderers ---------- */
  function callList(r) {
    return `<details class="src"><summary>Executed calls (${r.executed.length})</summary>${r.executed.map((c) => `<div class="call">${esc(c.call)}</div>`).join("")}</details>`;
  }
  function derivedRows(r) {
    return `<table class="t"><tbody>${r.derived.map((d) => `<tr><td>${esc(d.label)} <span class="tag derived" title="${esc(d.how)}">Derived</span></td><td class="r num" style="font-size:20px">${fmtDerived(d)}</td></tr>`).join("")}</tbody></table>`;
  }
  function fmtDerived(d) {
    const l = d.label.toLowerCase(), v = d.value;
    if (typeof v === "string") return esc(v);
    if (/pass rate|share of/.test(l)) return fmt.pct(v, 1);
    if (/cost per request/.test(l)) return fmt.cents(v);
    if (/scaled by/.test(l)) return v.toFixed(3);
    if (/violations/.test(l)) return String(v);
    return fmt.money(v);
  }
  function head(id, r) {
    return `<div class="head"><div><p class="eyebrow">Incident ${META[id].n}</p><h3>${META[id].title}</h3></div><span class="status ${r.status}">${r.status}</span></div>`;
  }
  const renderers = {
    cost(r) {
      const W = 520, H = 170, pad = 8, s = r.series, max = Math.max(...s) * 1.08, min = 0;
      const x = (i) => pad + (i / (s.length - 1)) * (W - pad * 2), y = (v) => H - pad - ((v - min) / (max - min)) * (H - pad * 2);
      const line = s.map((v, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1)).join(" ");
      const spikes = Object.values(r.executed[2].result).flat();
      return `${head("cost", r)}<svg viewBox="0 0 ${W} ${H + 24}" style="width:100%" role="img" aria-label="Daily AI spend across 30 days, rising sharply from day 19"><path d="${line} L${x(s.length - 1)} ${H} L${x(0)} ${H} Z" fill="rgba(201,169,110,.10)"/><path d="${line}" fill="none" stroke="#c9a96e" stroke-width="1.6"/><line x1="${x(r.escalation_day)}" x2="${x(r.escalation_day)}" y1="0" y2="${H}" stroke="#e0a44a" stroke-dasharray="3 5"/><text x="${x(r.escalation_day) + 6}" y="14" fill="#e0a44a" font-size="10" letter-spacing="2">CHANGE SHIPPED</text><text x="${pad}" y="${H + 18}" fill="#8c8678" font-size="10" letter-spacing="2">DAY 1</text><text x="${W - pad}" y="${H + 18}" fill="#8c8678" font-size="10" letter-spacing="2" text-anchor="end">DAY 30</text></svg>
        <p>${Object.keys(r.executed[2].result).length ? `<span class="tag exec">Executed</span> <code>Ledger.spikes()</code> flagged <b>${esc(Object.keys(r.executed[2].result).join(", "))}</b> on ${esc(spikes.join(" and "))}. ` : ""}${Object.keys(r.executed[3].result).length ? `<code>over_budget()</code> reports <b>${esc(Object.keys(r.executed[3].result).join(", "))}</b> past budget.` : ""}</p>${derivedRows(r)}${callList(r)}`;
    },
    injection(r) {
      const f = r.executed[1].result, ev = r.executed[3].result;
      return `${head("injection", r)}<p class="dim">${esc(r.channel)} <span class="tag input">Scenario input</span></p><div class="result" style="border-left-color:var(--amber);max-height:none">${esc(r.input_text)}</div>
        <p><span class="tag exec">Executed</span> <b>Verdict: ${f.allowed ? "ALLOWED" : "BLOCKED"}.</b> ${f.reasons.map(esc).join("; ")}.</p>
        <p>${f.pii_found.map((p) => `<span class="chip">${esc(p.kind)}</span> `).join("")} <span class="dim">redacted before anything reaches a model</span></p><div class="result" style="max-height:none">${esc(r.redacted_text)}</div>
        <p style="margin-top:14px"><span class="tag exec">Executed</span> <b>A paraphrased attempt: ${ev.allowed ? "ALLOWED" : "BLOCKED"}.</b> Score ${ev.injection_score}.</p><div class="note">${ev.allowed ? "Pattern heuristics do not catch a rephrased attack. This is a real limit of the tool, and it is why input checks are one layer and action gating is another." : ""}</div>${callList(r)}`;
    },
    drift(r) {
      const W = 520, H = 150, b = r.hist_before, a = r.hist_after, m = Math.max(...b, ...a), bw = (W - 16) / b.length;
      const bars = (arr, cls) => arr.map((v, i) => `<rect x="${8 + i * bw + 1}" y="${H - (v / m) * (H - 10)}" width="${bw - 2}" height="${(v / m) * (H - 10)}" ${cls}/>`).join("");
      const rep = r.executed[0].result;
      return `${head("drift", r)}<p class="dim">${esc(r.label)}. Change shipped: ${esc(r.change)}. <span class="tag input">Scenario input</span></p>
        <svg viewBox="0 0 ${W} ${H + 24}" style="width:100%" role="img" aria-label="Evaluation score distribution before and after the change"><g>${bars(b, 'fill="none" stroke="#c9a96e" stroke-width="1"')}${bars(a, 'fill="rgba(224,164,74,.35)"')}</g><line x1="${8 + r.pass_at * (W - 16)}" x2="${8 + r.pass_at * (W - 16)}" y1="0" y2="${H}" stroke="#ece7db" stroke-dasharray="3 5" opacity=".6"/><text x="${8 + r.pass_at * (W - 16) + 6}" y="12" fill="#ece7db" font-size="10" letter-spacing="2">PASS LINE</text><text x="8" y="${H + 18}" fill="#8c8678" font-size="10" letter-spacing="2">SCORE 0</text><text x="${W - 8}" y="${H + 18}" fill="#8c8678" font-size="10" letter-spacing="2" text-anchor="end">1.0</text></svg>
        <p><span class="tag exec">Executed</span> <code>drift_watch.report()</code>: PSI <b>${rep.psi}</b>, KS <b>${rep.ks}</b>, status <b>${esc(rep.status)}</b>. Gold outline is before, amber is after.</p>${derivedRows(r)}${callList(r)}`;
    },
    sovereignty(r) {
      const names = Object.keys(r.nodes), zones = [...new Set(Object.values(r.nodes))];
      const W = 520, colW = W / zones.length, pos = {}, rowsPer = {};
      names.forEach((n) => { const z = r.nodes[n]; const zi = zones.indexOf(z); rowsPer[z] = (rowsPer[z] || 0) + 1; pos[n] = { x: zi * colW + colW / 2, y: 54 + (rowsPer[z] - 1) * 52 }; });
      const H = 54 + Math.max(...Object.values(rowsPer)) * 52 + 10;
      const bad = new Set(r.violations.map((v) => v.src + ">" + v.dst + ">" + v.data));
      const edge = (f, inc) => { const [s, d, c] = f, p = pos[s], q = pos[d], v = bad.has(s + ">" + d + ">" + c); return `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" stroke="${v ? "#c8574a" : "#c9a96e"}" stroke-width="${v ? 1.8 : 1}" ${inc ? 'stroke-dasharray="5 4"' : ""} opacity="${v ? 1 : .55}"/>`; };
      const zoneSvg = zones.map((z, i) => `<rect x="${i * colW + 4}" y="6" width="${colW - 8}" height="${H - 12}" fill="none" stroke="rgba(201,169,110,.2)" stroke-dasharray="2 6"/><text x="${i * colW + colW / 2}" y="24" fill="${z === r.home ? "#e7d3a7" : "#8c8678"}" font-size="10" letter-spacing="3" text-anchor="middle">${esc(z)}${z === r.home ? " (HOME)" : ""}</text>`).join("");
      const nodeSvg = names.map((n) => `<g><rect x="${pos[n].x - 62}" y="${pos[n].y - 14}" width="124" height="28" fill="#0a0a0d" stroke="rgba(201,169,110,.4)"/><text x="${pos[n].x}" y="${pos[n].y + 4}" fill="#ece7db" font-size="10.5" text-anchor="middle">${esc(n)}</text></g>`).join("");
      return `${head("sovereignty", r)}<p class="dim">${esc(r.cause)} <span class="tag input">Scenario input</span></p>
        <svg viewBox="0 0 ${W} ${H}" style="width:100%" role="img" aria-label="Data flows between systems grouped by jurisdiction. Violating flows are highlighted.">${zoneSvg}${r.baseline_flows.map((f) => edge(f, false)).join("")}${r.incident_flows.map((f) => edge(f, true)).join("")}${nodeSvg}</svg>
        <table class="t"><tbody>${r.violations.map((v) => `<tr><td><span class="tag exec">Executed</span> ${esc(v.src)} → ${esc(v.dst)} <span class="dim">(${esc(v.data)})</span></td><td>${esc(v.reason)}</td></tr>`).join("") || '<tr><td colspan="2">No violations.</td></tr>'}</tbody></table>${derivedRows(r)}${callList(r)}`;
    },
    economics(r) {
      const s0 = r.executed[0].result, s1 = r.executed[1].result, W = 520, H = 120, pad = 20;
      const lo = Math.min(s0.p10, s1.p10, 0), hi = Math.max(s0.p90, s1.p90, 0), x = (v) => pad + ((v - lo) / (hi - lo)) * (W - pad * 2);
      const bar = (s, y, c, label) => `<line x1="${x(s.p10)}" x2="${x(s.p90)}" y1="${y}" y2="${y}" stroke="${c}" stroke-width="2"/><line x1="${x(s.p10)}" x2="${x(s.p10)}" y1="${y - 7}" y2="${y + 7}" stroke="${c}"/><line x1="${x(s.p90)}" x2="${x(s.p90)}" y1="${y - 7}" y2="${y + 7}" stroke="${c}"/><circle cx="${x(s.p50)}" cy="${y}" r="5" fill="${c}"/><text x="${pad}" y="${y - 14}" fill="#8c8678" font-size="10" letter-spacing="2">${label}</text>`;
      return `${head("economics", r)}<svg viewBox="0 0 ${W} ${H + 20}" style="width:100%" role="img" aria-label="Range of 12-month net value before and after the incidents"><line x1="${x(0)}" x2="${x(0)}" y1="6" y2="${H}" stroke="#ece7db" stroke-dasharray="3 5" opacity=".6"/><text x="${x(0) + 6}" y="${H + 14}" fill="#ece7db" font-size="10" letter-spacing="2">BREAK EVEN</text>${bar(s0, 40, "#c9a96e", "BEFORE")}${bar(s1, 92, "#c8574a", "AFTER THE INCIDENTS")}</svg>
        <p><span class="tag exec">Executed</span> <code>roi_lens.simulate()</code> before: 10th ${fmt.money(s0.p10)}, median <b>${fmt.money(s0.p50)}</b>, 90th ${fmt.money(s0.p90)}, ${fmt.pct(s0.prob_positive)} chance of paying back. After: median <b>${fmt.money(s1.p50)}</b>, ${fmt.pct(s1.prob_positive)}.</p>${derivedRows(r)}${callList(r)}`;
    },
  };
  function renderIncident(id, r) {
    const el = $("#incident"); el.innerHTML = `<div class="reveal">${renderers[id](r)}</div>`;
  }

  /* ---------- findings ---------- */
  function renderFindings() {
    const owners = { cost: "model.ledger", injection: "guard.rails", drift: "drift.watch", sovereignty: "sovereign.map", economics: "roi.lens" };
    $("#cards").innerHTML = ORDER.map((id) => {
      const r = state.results[id], tool = owners[id], t = TOOLS[tool], cid = "card-" + tool.replace(".", "-");
      return `<article class="panel pad" id="${cid}"><div class="head" style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:baseline"><div><p class="eyebrow">${t.role}</p><h3>${tool}</h3></div><span class="status ${r.status}">${r.status}</span></div>
        <p class="dim" style="margin-top:10px">${esc(t.line)}</p>
        ${r.executed.map((c) => `<div><span class="tag exec">Executed</span><div class="call">${esc(c.call)}</div><div class="result">${esc(pretty(c.result))}</div>${c.note ? `<div class="note">${esc(c.note)}</div>` : ""}</div>`).join("")}
        <details class="src"><summary>Derived by the harness</summary><table class="t"><tbody>${r.derived.map((d) => `<tr><td>${esc(d.label)}</td><td class="r">${fmtDerived(d)}</td><td class="dim">${esc(d.how)}</td></tr>`).join("")}</tbody></table></details>
        <div class="links"><a href="${links.source(tool)}">Source code</a><a href="${links.repo(tool)}#readme">Architecture and design</a><a href="${links.tests(tool)}">Reproduce: the tests</a><a href="${links.essay(t.essay, "findings-" + tool)}">Related writing: ${esc(CR.ESSAYS[t.essay][0])}</a></div>
        <details class="src"><summary>Run it yourself</summary><div class="call">git clone ${links.repo(tool)}\ncd ${tool}\npython -m unittest discover -s tests -t . -v</div></details></article>`;
    }).join("");
    $("#rooms-links").innerHTML = [
      ["receipts.html", "The Receipts", "The professional and published history behind the engineering, with sources."],
      ["question.html", "The Million Dollar Question", "Run your own assumptions through the same tools and take the report to your board."],
    ].map(([h, t, d]) => `<a class="panel pad" href="${h}" style="border-bottom:0;display:block"><h3>${t}</h3><p class="dim" style="margin-top:8px">${d}</p></a>`).join("");
  }
  $("#verify").addEventListener("click", async () => {
    const out = $("#verify-out"); out.textContent = "Comparing with GitHub…";
    const res = await CR.verifyAgainstGitHub(state.engine);
    const ok = res.filter((r) => r.match).length, bad = res.filter((r) => r.match === false), err = res.filter((r) => r.match === null);
    out.innerHTML = `${ok} of ${res.length} files identical to GitHub.` + (bad.length ? ` Different: ${bad.map((b) => esc(b.name)).join(", ")}.` : "") + (err.length ? " Some could not be reached." : "");
  });

  /* what the visitor looked into, so an inquiry can say what motivated it */
  const KINDS = ["source code", "architecture notes", "tests", "related essay"];
  const toolOf = (el) => el.closest("#cards article").querySelector("h3").textContent;
  document.addEventListener("click", (e) => {
    const a = e.target.closest("#cards .links a");
    if (a) { const k = KINDS[[...a.parentNode.children].indexOf(a)] || "link"; CR.ctx.inspect(toolOf(a), k); CR.track("cr_tool_inspect", { tool: toolOf(a), kind: k }); }
  });
  document.addEventListener("toggle", (e) => {
    const d = e.target;
    if (d.open && d.closest && d.closest("#cards article")) { CR.ctx.inspect(toolOf(d), "executed calls"); CR.track("cr_tool_inspect", { tool: toolOf(d), kind: "executed calls" }); }
  }, true);

  /* ---------- finale ---------- */
  const curtain = $("#curtain");
  $("#conclude").addEventListener("click", () => {
    $("#cta-site").href = links.site("finale-explore", state.key); CR.track("par_invite_view", { where: "control-room-finale" });
    curtain.hidden = false; document.body.style.overflow = "hidden";
    requestAnimationFrame(() => { curtain.style.opacity = 1; });
    ["f1", "f2", "f3"].forEach((id, i) => setTimeout(() => $("#" + id).classList.add("in"), reduced ? 0 : 1400 + i * 1500));
    $("#curtain-close").focus({ preventScroll: true });
  });
  $("#curtain-close").addEventListener("click", closeCurtain);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !curtain.hidden && !document.querySelector("dialog[open]")) closeCurtain(); });
  function closeCurtain() { curtain.style.opacity = 0; setTimeout(() => { curtain.hidden = true; document.body.style.overflow = ""; ["f1", "f2", "f3"].forEach((i) => $("#" + i).classList.remove("in")); }, reduced ? 0 : 900); }
})();
