/* The Million Dollar Question: visitor assumptions in, real tool outputs out, board-ready report. */
(function () {
  "use strict";
  const { fmt, esc, pretty, links } = CR;
  const $ = (s, r) => (r || document).querySelector(s);
  CR.mountNav("question.html");

  const FIELDS = [
    ["monthly_requests", "AI requests per month", 9000000, "1000"],
    ["input_tokens", "Input tokens per request", 1800, "50"],
    ["output_tokens", "Output tokens per request", 450, "10"],
    ["mix_frontier", "Share on frontier models (%)", 15, "1"],
    ["mix_balanced", "Share on balanced models (%)", 35, "1"],
    ["mix_fast", "Share on fast models (%)", 50, "1"],
    ["monthly_growth_pct", "Monthly volume growth (%)", 3, "0.5"],
    ["retry_pct", "Failed calls retried (%)", 4, "0.5"],
    ["infra_monthly", "Infrastructure per month ($)", 85000, "1000"],
    ["implementation_cost", "Implementation cost, one-off ($)", 1800000, "10000"],
    ["users", "People using it", 3000, "10"],
    ["hours_per_user_month", "Hours saved per person per month", 3, "0.1"],
    ["hourly_cost", "Value of an hour ($)", 85, "1"],
    ["adoption_pct", "Expected adoption (%)", 60, "1"],
    ["build_upfront", "Build it yourself: upfront ($)", 3000000, "10000"],
    ["build_annual", "Build it yourself: yearly run cost ($)", 2300000, "10000"],
    ["build_delay_years", "Build it yourself: years until live", 1, "1"],
    ["routable_pct", "Frontier traffic that could use a smaller model (%)", 35, "1"],
    ["trim_pct", "Input tokens you could trim (%)", 20, "1"],
    ["target_retry_pct", "Achievable retry rate (%)", 1, "0.5"],
  ];
  $("#fields").innerHTML = FIELDS.map(([id, label, v, step]) => `<label class="f" for="${id}">${label}<input type="number" id="${id}" value="${v}" step="${step}" min="0" inputmode="decimal"></label>`).join("");

  function read() {
    const g = (id) => parseFloat($("#" + id).value) || 0;
    const p = {};
    FIELDS.forEach(([id]) => (p[id] = g(id)));
    p.mix = { frontier: p.mix_frontier, balanced: p.mix_balanced, fast: p.mix_fast };
    ["mix_frontier", "mix_balanced", "mix_fast"].forEach((k) => delete p[k]);
    return p;
  }

  let engine = null, last = null, timer = null;
  CR.loadEngine().then((e) => { engine = e; run(); });
  $("#form").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 250); });
  $("#form").addEventListener("submit", (e) => e.preventDefault());

  function run() {
    if (!engine) return;
    try { last = engine.mdq(read()); render(last); } catch (e) { $("#out").innerHTML = `<div class="panel pad"><p>That combination of inputs could not be calculated: ${esc(e.message)}</p></div>`; }
  }

  function bars(rows, key, labelKey, f) {
    const max = Math.max(...rows.map((r) => r[key]));
    return rows.map((r) => `<div style="display:grid;grid-template-columns:70px 1fr 90px;gap:12px;align-items:center;margin:8px 0"><span class="dim">${esc(r[labelKey])}</span><span style="height:8px;background:linear-gradient(90deg,var(--gold),var(--soft));width:${Math.max(2, (r[key] / max) * 100)}%"></span><span class="num" style="font-size:20px;text-align:right">${f(r[key])}</span></div>`).join("");
  }

  function render(r) {
    const c = r.cost_outlook, u = r.unit_economics, roi = r.roi, bb = r.build_vs_buy, s = roi.simulate;
    const best = bb.ranked[0], other = bb.ranked[1];
    $("#out").innerHTML = `
    <div class="grid g3" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr))">
      <div class="panel pad kpi"><div class="label">Monthly cost now</div><div class="num">${fmt.money(c.monthly_now)}</div><div class="sub">inference plus infrastructure</div></div>
      <div class="panel pad kpi"><div class="label">Year one</div><div class="num">${fmt.money(c.year1)}</div><div class="sub">year three ${fmt.money(c.year3)}</div></div>
      <div class="panel pad kpi"><div class="label">Cost per request</div><div class="num">${fmt.cents(u.cost_per_request_year1)}</div><div class="sub">${fmt.cents(u.inference_only_per_request)} inference only</div></div>
      <div class="panel pad kpi ${s.p50 < 0 ? "bad" : "good"}"><div class="label">Median 12-month return</div><div class="num">${fmt.money(s.p50)}</div><div class="sub">${fmt.pct(s.prob_positive)} chance it pays back</div></div>
    </div>
    <div class="panel pad" style="margin-top:18px"><p class="eyebrow">AI cost outlook <span class="tag exec">Executed</span></p>
      <table class="t" style="margin-top:12px"><tbody><tr><td>Year one</td><td class="r num" style="font-size:22px">${fmt.full(c.year1)}</td></tr><tr><td>Year two</td><td class="r num" style="font-size:22px">${fmt.full(c.year2)}</td></tr><tr><td>Year three</td><td class="r num" style="font-size:22px">${fmt.full(c.year3)}</td></tr><tr><td>Inference share of year one</td><td class="r num" style="font-size:22px">${fmt.pct(c.inference_share_year1)}</td></tr></tbody></table></div>
    <div class="panel pad" style="margin-top:18px"><p class="eyebrow">Scaling sensitivity <span class="tag exec">Executed</span></p>
      <p class="dim" style="margin:8px 0 6px">Monthly cost at a multiple of today's volume, including fixed infrastructure.</p>${bars(r.scaling.map((x) => ({ ...x, label: x.multiple + "×" })), "monthly_cost", "label", (v) => fmt.money(v))}
      <p class="dim" style="font-size:13px">Cost per request falls from ${fmt.cents(r.scaling[0].cost_per_request)} at half volume to ${fmt.cents(r.scaling[4].cost_per_request)} at ten times, because infrastructure is fixed. Inference cost itself scales linearly.</p></div>
    <div class="panel pad" style="margin-top:18px"><p class="eyebrow">Build versus buy <span class="tag exec">Executed</span></p>
      <table class="t" style="margin-top:12px"><tr><th>Option</th><th class="r">5-year NPV</th><th class="r">Total cost</th><th class="r">Payback year</th></tr>${bb.ranked.map((o) => `<tr><td>${esc(o.name)}</td><td class="r">${fmt.money(o.npv)}</td><td class="r">${fmt.money(o.total_cost)}</td><td class="r">${o.payback_year === null ? "none" : o.payback_year}</td></tr>`).join("")}</table>
      <p style="margin-top:12px">${esc(best.name)} leads by ${fmt.money(best.npv - other.npv)} on net present value at a 10% discount rate.${bb.crossover_year !== null ? ` Cumulative cost lines cross in year ${bb.crossover_year}.` : " The cumulative cost lines do not cross within the horizon."} Per-use cost is assumed to grow ${fmt.pct(bb.buy_cost_growth, 1)} a year, taken from your growth input.</p></div>
    <div class="panel pad" style="margin-top:18px"><p class="eyebrow">Return on investment <span class="tag exec">Executed</span></p>
      <p style="margin-top:10px">Hours and adoption are spread into ranges (${roi.ranges.hours[0]} to ${roi.ranges.hours[2]} hours; ${fmt.pct(roi.ranges.adoption[0])} to ${fmt.pct(roi.ranges.adoption[2])} adoption). Over 12 months the 10th, median and 90th percentile net values are <b>${fmt.money(s.p10)}</b>, <b>${fmt.money(s.p50)}</b> and <b>${fmt.money(s.p90)}</b>. The point estimate is ${fmt.money(roi.point.net)}.</p></div>
    <div class="panel pad" style="margin-top:18px"><p class="eyebrow">Architectural opportunities <span class="tag exec">Executed</span> <span class="tag input">Your assumptions</span></p>
      <table class="t" style="margin-top:12px"><tbody>${r.opportunities.map((o) => `<tr><td><b>${esc(o.title)}</b><br><span class="dim">${esc(o.assumption)}</span></td><td class="r num" style="font-size:22px">${fmt.money(o.annual_saving)}<br><span class="dim" style="font:300 11px var(--ui)">a year</span></td></tr>`).join("")}</tbody></table>
      <p class="dim" style="font-size:13px">Each saving is the difference between two model.ledger runs. Whether the assumption holds is an engineering question, and the most valuable one to examine first.</p></div>
    <details class="panel pad src" style="margin-top:18px"><summary>The calls behind these numbers</summary>${r.executed.map((e) => `<div><span class="tag exec">${esc(e.tool)}</span><div class="call">${esc(e.call)}</div><div class="result">${esc(pretty(e.result))}</div></div>`).join("")}<ul class="dim">${r.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></details>
    <div class="controls" style="margin-top:26px"><button class="btn primary" id="gen">Generate the executive report</button><a class="btn" href="${links.book("question-book", "question")}">Discuss this analysis</a></div>`;
    $("#gen").addEventListener("click", makeReport);
  }

  /* ---------- executive report ---------- */
  function reportHtml(r, forFile) {
    const c = r.cost_outlook, u = r.unit_economics, roi = r.roi, bb = r.build_vs_buy, s = roi.simulate, p = r.inputs;
    const date = new Date().toISOString().slice(0, 10);
    const book = links.book("report-book", "question-report"), site = links.site("report-site", "question-report");
    const row = (a, b) => `<tr><td>${a}</td><td style="text-align:right">${b}</td></tr>`;
    const interp = s.p50 > 0
      ? `On these assumptions the program is expected to pay for itself, with a median 12-month net value of ${fmt.money(s.p50)} and a ${fmt.pct(s.prob_positive)} modelled chance of a positive return. The result is most sensitive to adoption and to growth in usage cost.`
      : `On these assumptions the program is not expected to pay for itself within 12 months (median ${fmt.money(s.p50)}, ${fmt.pct(s.prob_positive)} modelled chance of a positive return). Adoption, value per hour and run cost are the levers to examine first.`;
    const css = forFile ? `<style>body{font:15px/1.6 Georgia,serif;color:#111;max-width:820px;margin:40px auto;padding:0 24px}h1{font-size:40px;font-weight:500;margin:.2em 0}h2{font-size:20px;margin:1.6em 0 .4em;border-bottom:1px solid #c9a96e;padding-bottom:4px}table{width:100%;border-collapse:collapse}td,th{padding:6px 4px;border-bottom:1px solid #ddd;text-align:left}.k{letter-spacing:.2em;text-transform:uppercase;font:11px sans-serif;color:#8a6d2f}a{color:#8a6d2f}small{color:#555}</style>` : "";
    return `${css}<div class="k gold" style="font:11px var(--ui);letter-spacing:.3em;text-transform:uppercase;color:var(--gold)">AndMaverick &middot; Executive report &middot; ${date}</div>
    <h1 style="font-size:clamp(34px,5vw,60px);margin:12px 0 6px">The economics of your AI architecture</h1>
    <p style="font-style:italic">Prepared with AndMaverick&rsquo;s open source tools. Synthetic price tiers; replace with your contracts.</p>
    <h2>Summary</h2><p>${interp}</p>
    <table><tbody>${row("Monthly cost now", fmt.full(c.monthly_now))}${row("Year one / two / three", fmt.full(c.year1) + " / " + fmt.full(c.year2) + " / " + fmt.full(c.year3))}${row("Cost per request, year one", fmt.cents(u.cost_per_request_year1))}${row("Median 12-month net value", fmt.full(s.p50))}${row("Range (10th to 90th percentile)", fmt.full(s.p10) + " to " + fmt.full(s.p90))}${row("Modelled chance of positive return", fmt.pct(s.prob_positive))}</tbody></table>
    <h2>Scaling sensitivity</h2><table><thead><tr><th>Volume</th><th style="text-align:right">Monthly cost</th><th style="text-align:right">Per request</th></tr></thead><tbody>${r.scaling.map((x) => `<tr><td>${x.multiple}&times;</td><td style="text-align:right">${fmt.full(x.monthly_cost)}</td><td style="text-align:right">${fmt.cents(x.cost_per_request)}</td></tr>`).join("")}</tbody></table>
    <h2>Build versus buy</h2><table><thead><tr><th>Option</th><th style="text-align:right">5-year NPV</th><th style="text-align:right">Total cost</th><th style="text-align:right">Payback</th></tr></thead><tbody>${bb.ranked.map((o) => `<tr><td>${esc(o.name)}</td><td style="text-align:right">${fmt.full(o.npv)}</td><td style="text-align:right">${fmt.full(o.total_cost)}</td><td style="text-align:right">${o.payback_year === null ? "none" : "year " + o.payback_year}</td></tr>`).join("")}</tbody></table>
    <h2>Architectural opportunities</h2><table><tbody>${r.opportunities.map((o) => row(`${esc(o.title)}<br><small>${esc(o.assumption)}</small>`, fmt.full(o.annual_saving) + " a year")).join("")}</tbody></table>
    <h2>Assumptions</h2><table><tbody>${row("Requests per month", fmt.int(p.monthly_requests))}${row("Tokens per request (in / out)", fmt.int(p.input_tokens) + " / " + fmt.int(p.output_tokens))}${row("Model mix (frontier / balanced / fast)", p.mix.frontier + "% / " + p.mix.balanced + "% / " + p.mix.fast + "%")}${row("Monthly growth, retries", p.monthly_growth_pct + "%, " + p.retry_pct + "%")}${row("Infrastructure per month", fmt.full(p.infra_monthly))}${row("Implementation cost", fmt.full(p.implementation_cost))}${row("Users, hours saved, value of an hour, adoption", fmt.int(p.users) + ", " + p.hours_per_user_month + ", " + fmt.full(p.hourly_cost) + ", " + p.adoption_pct + "%")}${row("Build: upfront, yearly, years until live", fmt.full(p.build_upfront) + ", " + fmt.full(p.build_annual) + ", " + p.build_delay_years)}</tbody></table>
    <h2>How these numbers were produced</h2><p><small>Cost and scaling: model.ledger. Return: roi.lens (seeded Monte Carlo over ranges around your inputs). Build versus buy: build.buy at a 10% discount rate over five years. Source and tests: github.com/AndMaverick. The outlook is a model of your assumptions, not a forecast, and is not financial advice.</small></p>
    <h2>Next step</h2><p>If these numbers surprised you, the next conversation is about which assumptions to test first. <a href="${book}">Book a conversation with Andrew Quillen</a> or visit <a href="${site}">andmaverick.com</a>.</p>`;
  }
  function makeReport() {
    if (!last) return;
    $("#report-wrap").hidden = false;
    $("#report").innerHTML = reportHtml(last, false) +
      `<div class="controls no-print" style="margin-top:30px"><button class="btn primary" id="dl">Download the report</button><button class="btn" id="pr">Print or save as PDF</button></div>`;
    $("#report-wrap").scrollIntoView({ behavior: CR.reduced ? "auto" : "smooth" });
    $("#dl").onclick = () => {
      const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>AndMaverick executive report</title><body>${reportHtml(last, true)}</body></html>`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([html], { type: "text/html" })); a.download = "andmaverick-ai-architecture-report.html"; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    };
    $("#pr").onclick = () => window.print();
  }
})();
