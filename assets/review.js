/* The Private Architecture Review: context kept in this tab, a restrained inquiry, cookieless funnel events.
   The inquiry is composed as an email to the address already published on andmaverick.com. Nothing is sent
   by this site; the visitor sends it from their own email client, or copies it. */
(function () {
  "use strict";
  const TO = "andrew@andmaverick.com";
  const GA = "G-J4PB83R2NK"; // the existing andmaverick.com GA4 property

  const CHALLENGES = ["AI economics and cost architecture", "Enterprise AI deployment", "AI reliability and governance", "Sovereign AI and data residency", "Vendor strategy and build versus buy", "Something else"];
  const SCALES = ["Under $1 million", "$1 million to $5 million", "$5 million to $25 million", "$25 million to $100 million", "Over $100 million", "Prefer not to say"];

  /* ---------- pure: build the inquiry (also used by the node tests) ---------- */
  function shortList(a) { return a && a.length ? a.join(", ") : "none"; }
  function buildInquiry(f, ctx, opts) {
    ctx = ctx || {}; opts = opts || {};
    const ref = opts.ref || "PAR-000000-0000";
    const mdqLine = ctx.mdq && opts.includeMdq
      ? [
          "Modeled in The Million Dollar Question (volunteered by the visitor, a model not a fact):",
          "  Assumptions: " + ctx.mdq.assumptions,
          "  Headline results: " + ctx.mdq.results,
        ]
      : [ctx.mdq ? "The Million Dollar Question: used. Assumptions not shared." : "The Million Dollar Question: not used."];
    const lines = [
      "Private Architecture Review inquiry",
      "Reference: " + ref,
      "",
      "Name: " + f.name,
      "Work email: " + f.email,
      "Organization: " + f.org,
      "Primary architectural challenge: " + f.challenge,
      "Approximate scale of the AI initiative (budget, not a fee): " + (f.scale || "not stated"),
      "",
      "What they are trying to accomplish:",
      f.goal,
      "",
      "Context from the AndMaverick Control Room",
      "Arrived from: " + (ctx.source || "direct") + (ctx.medium ? " / " + ctx.medium : "") + (ctx.campaign ? " / " + ctx.campaign : ""),
      "Opened from: " + (opts.where || "unknown") + " (page: " + (opts.page || "unknown") + ")",
      "Environment explored: " + (ctx.env ? ctx.env : "none"),
      "Incidents run: " + (ctx.incidents && ctx.incidents.length ? ctx.incidents.map((i) => i.title + " (" + i.status + ")").join(", ") : "none"),
      "Simulation completed: " + (ctx.complete ? "yes" : "no"),
      "Tools inspected: " + shortList(ctx.inspected),
      "Rooms visited: " + shortList(ctx.pages),
      ...mdqLine,
      ctx.report ? "Executive report: generated (not attached; the visitor may attach it)." : "Executive report: not generated.",
    ];
    const subject = "Private Architecture Review: " + f.org + " [" + ref + "]";
    return { subject, body: lines.join("\n") };
  }
  function mailto(q) { return "mailto:" + TO + "?subject=" + encodeURIComponent(q.subject) + "&body=" + encodeURIComponent(q.body); }
  function newRef(now, rnd) {
    const d = (now || new Date()).toISOString().slice(2, 10).replace(/-/g, "");
    return "PAR-" + d + "-" + (rnd || Math.random().toString(36).slice(2, 6)).toUpperCase();
  }

  if (typeof window === "undefined") { module.exports = { buildInquiry, mailto, newRef, TO, CHALLENGES, SCALES }; return; }

  /* ---------- context, kept in this tab only ---------- */
  const KEY = "cr.context.v1";
  const mem = {};
  const store = {
    get() { try { return JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch (e) { return mem.v || {}; } },
    set(v) { mem.v = v; try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* private mode: memory only */ } },
  };
  const q = new URLSearchParams(location.search);
  const page = location.pathname.split("/").pop() || "index.html";
  function ctxRead() {
    const c = store.get();
    if (!c.started) {
      c.started = Date.now(); c.pages = []; c.incidents = []; c.inspected = [];
      c.source = q.get("utm_source") || ""; c.medium = q.get("utm_medium") || ""; c.campaign = q.get("utm_campaign") || "";
      c.entry = page;
    } else if (q.get("utm_source") && !c.source) { c.source = q.get("utm_source"); c.medium = q.get("utm_medium") || ""; c.campaign = q.get("utm_campaign") || ""; }
    return c;
  }
  const ROOM = { "index.html": "Control Room", "receipts.html": "The Receipts", "question.html": "The Million Dollar Question", "": "Control Room" };
  const ctx = {
    get: ctxRead,
    update(fn) { const c = ctxRead(); fn(c); store.set(c); },
    visit() { this.update((c) => { const r = ROOM[page] || page; if (!c.pages.includes(r)) c.pages.push(r); }); },
    setEnv(name) { this.update((c) => { if (c.env !== name) { c.env = name; c.incidents = []; c.complete = false; } }); },
    addIncident(title, status) { this.update((c) => { c.incidents = c.incidents.filter((i) => i.title !== title); c.incidents.push({ title, status }); }); },
    complete() { this.update((c) => { c.complete = true; }); },
    inspect(tool, kind) { this.update((c) => { const k = tool + " (" + kind + ")"; if (!c.inspected.includes(k)) c.inspected.push(k); }); },
    setMdq(assumptions, results) { this.update((c) => { c.mdq = { assumptions, results }; }); },
    reportMade() { this.update((c) => { c.report = true; }); },
  };

  /* ---------- funnel events: the existing GA4 property, cookieless, no personal data ---------- */
  function initAnalytics() {
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag("consent", "default", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    gtag("js", new Date());
    gtag("config", GA, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, anonymize_ip: true });
    const s = document.createElement("script"); s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA;
    document.head.appendChild(s);
  }
  function track(name, params) { try { window.gtag && window.gtag("event", name, params || {}); } catch (e) { /* analytics must never break the page */ } }

  /* ---------- the inquiry experience ---------- */
  const AREAS = ["AI infrastructure economics and inference costs", "Reliability, evaluation and operational resilience", "Model and vendor selection", "Build versus buy decisions", "Data sovereignty and regional infrastructure", "AI investment returns and capital allocation", "Enterprise readiness and deployment architecture"];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let dlg = null, opener = null, where = "", ref = "";

  function build() {
    dlg = document.createElement("dialog");
    dlg.className = "par"; dlg.setAttribute("aria-labelledby", "par-t");
    dlg.innerHTML = '<div class="par-in"><button class="par-x" type="button" aria-label="Close">Close</button>' +
      '<div class="par-grid"><div class="par-l"><p class="eyebrow">AndMaverick</p><h2 class="big" id="par-t">Request a private <em>architecture review.</em></h2>' +
      '<p class="lede" style="margin-top:18px">You&rsquo;ve seen what the architecture reveals in a simulated environment. Let&rsquo;s examine the decisions shaping your own AI program.</p>' +
      '<p class="dim" style="margin-top:22px">A first conversation about your real technical and economic challenges, to learn whether there is a meaningful opportunity to work together. It is not a free audit, and it carries no fee or commitment.</p>' +
      '<p class="eyebrow" style="margin-top:26px">Where we can look</p><ul class="par-list">' + AREAS.map((a) => "<li>" + a + "</li>").join("") + "</ul>" +
      '<p class="eyebrow" style="margin-top:26px">How it can progress</p><ol class="par-steps"><li><b>An initial conversation.</b> We understand your architecture, your challenges and what you need.</li><li><b>A paid architecture diagnostic.</b> A defined technical or economic problem, with scope and pricing agreed together.</li><li><b>An advisory or implementation mandate.</b> Ongoing strategic and architectural leadership, if it is the right fit.</li></ol></div>' +
      '<div class="par-r"><form id="par-f" novalidate autocomplete="on">' +
      '<label class="f" for="par-name">Name<input id="par-name" name="name" type="text" autocomplete="name" required></label>' +
      '<label class="f" for="par-email">Work email<input id="par-email" name="email" type="email" autocomplete="email" required></label>' +
      '<label class="f" for="par-org">Organization<input id="par-org" name="org" type="text" autocomplete="organization" required></label>' +
      '<label class="f" for="par-ch">Your primary architectural challenge<select id="par-ch" name="challenge" required><option value="" disabled selected>Select one</option>' + CHALLENGES.map((c) => "<option>" + c + "</option>").join("") + "</select></label>" +
      '<label class="f" for="par-goal">What are you trying to accomplish?<textarea id="par-goal" name="goal" rows="4" maxlength="1200" required></textarea></label>' +
      '<label class="f" for="par-scale">Approximate scale of the AI initiative <span class="opt">optional</span><select id="par-scale" name="scale"><option value="">Select one</option>' + SCALES.map((c) => "<option>" + c + "</option>").join("") + '</select><span class="hint">The initiative&rsquo;s budget, not a consulting fee.</span></label>' +
      '<div id="par-mdq" hidden><label class="par-check"><input type="checkbox" id="par-mdq-ok"> <span>Also include the assumptions and headline results I modeled in The Million Dollar Question.</span></label><p class="hint">Off by default. To share the full executive report, download it there and attach it to the email.</p></div>' +
      '<details class="src"><summary>Exactly what will be included</summary><div class="result" id="par-preview" style="max-height:260px"></div></details>' +
      '<p class="par-err" id="par-err" role="alert" hidden></p>' +
      '<div class="controls" style="margin-top:6px"><button class="btn primary" type="submit">Prepare my inquiry</button></div>' +
      '<p class="hint">Preparing it opens an email to ' + TO + ' in your email app. Nothing is sent until you press send there.</p></form>' +
      '<div id="par-done" hidden><p class="eyebrow">Your inquiry is ready</p><p>Your email app should have opened with the inquiry addressed to ' + TO + '. Nothing has been sent until you send it there.</p>' +
      '<p class="dim">If nothing opened, copy it and send it from any mail account.</p><div class="controls"><button class="btn" type="button" id="par-copy">Copy the inquiry</button><a class="btn quiet" id="par-mail" href="#">Open the email again</a></div><p class="hint" id="par-ref"></p></div>' +
      "</div></div></div>";
    document.body.appendChild(dlg);
    dlg.querySelector(".par-x").addEventListener("click", () => dlg.close());
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener("close", () => { if (opener && opener.focus) opener.focus(); });
    const f = dlg.querySelector("#par-f");
    f.addEventListener("input", preview); f.addEventListener("change", preview);
    f.addEventListener("submit", submit);
    dlg.querySelector("#par-copy").addEventListener("click", copy);
  }
  function values() {
    const f = dlg.querySelector("#par-f");
    return { name: f.name.value.trim(), email: f.email.value.trim(), org: f.org.value.trim(), challenge: f.challenge.value, scale: f.scale.value, goal: f.goal.value.trim() };
  }
  function compose() {
    const c = ctx.get(), v = values();
    const fill = { name: v.name || "(your name)", email: v.email || "(your work email)", org: v.org || "(your organization)", challenge: v.challenge || "(your challenge)", scale: v.scale, goal: v.goal || "(what you are trying to accomplish)" };
    const includeMdq = !!(c.mdq && dlg.querySelector("#par-mdq-ok").checked);
    let qy = buildInquiry(fill, c, { ref, where, page, includeMdq });
    if (mailto(qy).length > 1900 && includeMdq) { qy = buildInquiry(fill, Object.assign({}, c, { mdq: { assumptions: c.mdq.assumptions.slice(0, 220), results: c.mdq.results.slice(0, 220) } }), { ref, where, page, includeMdq }); }
    return qy;
  }
  function preview() { dlg.querySelector("#par-preview").textContent = compose().body; }
  function err(m) { const e = dlg.querySelector("#par-err"); e.textContent = m || ""; e.hidden = !m; }
  function submit(e) {
    e.preventDefault(); err("");
    const f = dlg.querySelector("#par-f");
    if (!f.checkValidity()) { f.reportValidity(); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values().email)) { err("Please enter a valid work email."); f.email.focus(); return; }
    const qy = compose(), url = mailto(qy);
    const a = dlg.querySelector("#par-mail"); a.href = url;
    track("par_compose", { where, scenario: ctx.get().env || "none", challenge: values().challenge, scale: values().scale || "unstated" });
    f.hidden = true; dlg.querySelector("#par-done").hidden = false;
    dlg.querySelector("#par-ref").textContent = "Reference " + ref;
    a.click();
  }
  async function copy() {
    const t = "To: " + TO + "\nSubject: " + compose().subject + "\n\n" + compose().body;
    const b = dlg.querySelector("#par-copy");
    try { await navigator.clipboard.writeText(t); b.textContent = "Copied"; track("par_copy", { where }); } catch (e) { b.textContent = "Copy failed. Write to " + TO; }
  }
  function open(from, trigger) {
    if (!dlg) build();
    where = from || "unknown"; opener = trigger || null; ref = newRef();
    const f = dlg.querySelector("#par-f"); f.hidden = false; dlg.querySelector("#par-done").hidden = true; err("");
    dlg.querySelector("#par-mdq").hidden = !ctx.get().mdq;
    preview();
    if (!dlg.open) dlg.showModal();
    track("par_open", { where, scenario: ctx.get().env || "none" });
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-par]");
    if (t) { e.preventDefault(); open(t.getAttribute("data-par"), t); }
  });

  ctx.visit(); initAnalytics();
  track("cr_page", { room: ROOM[page] || page, source: q.get("utm_source") || "direct", campaign: q.get("utm_campaign") || "none", page_location: location.href });
  window.CR = window.CR || {};
  CR.ctx = ctx; CR.track = track; CR.review = { open, buildInquiry, mailto };
  if (location.hash === "#review") setTimeout(() => open("deep-link"), 400);
})();
