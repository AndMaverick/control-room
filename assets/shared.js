/* Shared pieces for the three rooms: engine loader, formatters, links, navigation. */
(function () {
  "use strict";
  const REPO = "https://github.com/AndMaverick/";
  const SITE = "https://www.andmaverick.com/";
  const CALENDLY = "https://calendly.com/andmaverick";
  const MAO_INDEX = "https://www.andmaverick.com/mao-index";
  const ESSAYS = {
    meter: ["The Meter Is Running. Nobody Built the Architecture to Stop It.", "https://blog.andmaverick.com/the-meter-is-running-nobody-built-the-architecture-to-stop-it"],
    agent: ["Nobody Signs for the Agent", "https://blog.andmaverick.com/nobody-signs-for-the-agent"],
    job: ["The Job Nobody Has Yet", "https://blog.andmaverick.com/the-job-nobody-has-yet"],
    passport: ["Your AI Has a Passport Problem", "https://blog.andmaverick.com/your-ai-has-a-passport-problem"],
    language: ["The Language They Did Not Build For", "https://blog.andmaverick.com/the-language-they-did-not-build-for"],
  };
  const TOOLS = {
    "model.ledger": { pkg: "model_ledger", essay: "meter", role: "Cost accounting", line: "Token and dollar accounting by team and model, with budget breaches and spike detection." },
    "guard.rails": { pkg: "guard_rails", essay: "agent", role: "Input safety", line: "PII redaction, prompt injection scoring, and policy verdicts." },
    "drift.watch": { pkg: "drift_watch", essay: "agent", role: "Model drift", line: "Population stability and KS drift detection for inputs and outputs." },
    "sovereign.map": { pkg: "sovereign_map", essay: "passport", role: "Data sovereignty", line: "Checks AI data flows against the residency rules you define." },
    "roi.lens": { pkg: "roi_lens", essay: "meter", role: "Program economics", line: "ROI as a range, with the odds of losing money." },
    "build.buy": { pkg: "build_buy", essay: "meter", role: "Build versus buy", line: "NPV, payback, and the year the cost curves cross." },
  };

  const params = new URLSearchParams(location.search);
  const inbound = { source: params.get("utm_source") || "direct", campaign: params.get("utm_campaign") || "" };

  /* Outbound links carry source, medium and content so andmaverick.com analytics can attribute them.
     Attribution rides on the link itself. This site sets no cookies. */
  function utm(url, content, campaign) {
    const u = new URL(url);
    u.searchParams.set("utm_source", "controlroom");
    u.searchParams.set("utm_medium", "experience");
    u.searchParams.set("utm_campaign", campaign || "controlroom");
    if (content) u.searchParams.set("utm_content", content);
    if (inbound.source !== "direct") u.searchParams.set("utm_term", inbound.source + (inbound.campaign ? ":" + inbound.campaign : ""));
    return u.toString();
  }
  const links = {
    site: (c, camp) => utm(SITE, c, camp),
    book: (c, camp) => utm(CALENDLY, c, camp),
    mao: (c, camp) => utm(MAO_INDEX, c, camp),
    essay: (k, c) => utm(ESSAYS[k][1], c || "essay-" + k, "controlroom"),
    repo: (name) => REPO + name,
    source: (name) => REPO + name + "/blob/main/" + TOOLS[name].pkg + "/__init__.py",
    tests: (name) => REPO + name + "/blob/main/tests/test_" + TOOLS[name].pkg + ".py",
  };

  const fmt = {
    money(n, digits) {
      const a = Math.abs(n), s = n < 0 ? "-" : "";
      if (a >= 1e9) return s + "$" + (a / 1e9).toFixed(digits ?? 2) + "B";
      if (a >= 1e6) return s + "$" + (a / 1e6).toFixed(digits ?? 2) + "M";
      if (a >= 1e4) return s + "$" + Math.round(a / 1e3).toLocaleString("en-US") + "K";
      return s + "$" + Math.round(a).toLocaleString("en-US");
    },
    full(n) { return (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US"); },
    cents(n) { return "$" + n.toFixed(n < 0.01 ? 5 : 4); },
    pct(n, d) { return (n * 100).toFixed(d ?? 0) + "%"; },
    int(n) { return Math.round(n).toLocaleString("en-US"); },
  };
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function countTo(el, to, format, ms) {
    const from = parseFloat(el.dataset.v || "0");
    el.dataset.v = to;
    if (reduced || from === to) { el.textContent = format(to); return; }
    const t0 = performance.now(), dur = ms || 1400;
    (function tick(now) {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = format(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(tick);
    })(t0);
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  function pretty(v) { return typeof v === "string" ? v : JSON.stringify(v, null, 2); }


  /* Two ways to get the Python runtime. A self-contained build ships it as base64 text chunks in blob/ (see
     build.py); they are decoded here and served to Pyodide through a narrow fetch shim. The hosted build has no
     blob/ folder and loads the pinned Pyodide release from the jsDelivr CDN, with an integrity hash. */
  const CDN = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
  const CDN_SRI = "sha384-i3R37b3tF+HWudsUf1VSEOY2YxwSNMqY8DQa9Z0O3xh+NkJ9o+yjcGyIi5huj+nB";
  async function installRuntimeBinaries() {
    const probe = await fetch("blob/manifest.json").catch(() => null);
    if (!probe || !probe.ok) return { base: CDN, sri: CDN_SRI };   // hosted build: runtime from the pinned CDN
    const manifest = await probe.json();
    const served = {};
    for (const [name, meta] of Object.entries(manifest)) {
      const parts = await Promise.all(Array.from({ length: meta.chunks }, (_, i) =>
        fetch("blob/" + name + "." + String(i).padStart(2, "0") + ".txt").then((r) => r.text())));
      const raw = Uint8Array.from(atob(parts.join("")), (c) => c.charCodeAt(0));
      let bytes = raw;
      if (meta.gzip) {
        const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("gzip"));
        bytes = new Uint8Array(await new Response(stream).arrayBuffer());
      }
      served[name] = bytes;
    }
    const realFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : (input.href || input.url || String(input));
      for (const name of Object.keys(served)) {
        if (url.split("?")[0].endsWith("/" + name)) {
          const type = name.endsWith(".wasm") ? "application/wasm" : "application/zip";
          return Promise.resolve(new Response(served[name], { status: 200, headers: { "Content-Type": type } }));
        }
      }
      return realFetch(input, init);
    };
    return { base: "pyodide/", sri: null };
  }

  /* Engine: Pyodide runs the real Python source from /py. Same code as the GitHub repositories. */
  let enginePromise = null;
  function loadEngine(onStatus) {
    if (enginePromise) return enginePromise;
    enginePromise = (async () => {
      onStatus && onStatus("Assembling the Python runtime");
      const rt = await installRuntimeBinaries();
      onStatus && onStatus("Loading the Python runtime");
      await new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = rt.base + "pyodide.js"; s.onload = res; s.onerror = () => rej(new Error("runtime failed to load"));
        if (rt.sri) { s.integrity = rt.sri; s.crossOrigin = "anonymous"; }
        document.head.appendChild(s);
      });
      const py = await loadPyodide({ indexURL: rt.base });
      onStatus && onStatus("Mounting the AndMaverick tools");
      const manifest = await (await fetch("py/manifest.json", { cache: "no-cache" })).json();
      const sources = {};
      for (const f of manifest.files) {
        const text = await (await fetch("py/" + f, { cache: "no-cache" })).text();
        sources[f] = text;
        const dir = f.split("/").slice(0, -1).join("/");
        if (dir) py.FS.mkdirTree("/app/" + dir);
        py.FS.writeFile("/app/" + f, text);
      }
      py.runPython(`
import sys, json
sys.path.insert(0, "/app")
import control_room as _c
_S = {}
def start(key, overrides):
    _S["s"] = _c.Session(key, json.loads(overrides))
    return json.dumps(_S["s"].inputs_view())
def step(name):
    return json.dumps(getattr(_S["s"], "incident_" + name)())
def summary():
    return json.dumps(_c.scenario_summary())
def mdq(payload):
    return json.dumps(_c.assess(json.loads(payload)))
`);
      const g = py.globals;
      const api = {
        sources, manifest,
        summary: () => JSON.parse(g.get("summary")()),
        start: (key, o) => JSON.parse(g.get("start")(key, JSON.stringify(o || {}))),
        step: (name) => JSON.parse(g.get("step")(name)),
        mdq: (inputs) => JSON.parse(g.get("mdq")(JSON.stringify(inputs))),
      };
      onStatus && onStatus("Ready");
      return api;
    })();
    return enginePromise;
  }

  async function sha256(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /* Compare the code running in this page with the file on GitHub, byte for byte. */
  async function verifyAgainstGitHub(engine) {
    const out = [];
    for (const [name, t] of Object.entries(TOOLS)) {
      const file = "py/" + t.pkg + "/__init__.py";
      const local = engine.sources[t.pkg + "/__init__.py"];
      if (!local) continue;
      try {
        const remote = await (await fetch("https://raw.githubusercontent.com/AndMaverick/" + name + "/main/" + t.pkg + "/__init__.py", { cache: "no-cache" })).text();
        out.push({ name, file, match: (await sha256(remote)) === (await sha256(local)), hash: (await sha256(local)).slice(0, 12) });
      } catch (e) { out.push({ name, file, match: null, hash: "", error: String(e) }); }
    }
    return out;
  }

  function mountNav(current) {
    const rooms = [["index.html", "Control Room"], ["receipts.html", "The Receipts"], ["question.html", "The Million Dollar Question"]];
    const h = document.createElement("header");
    h.className = "rooms";
    h.innerHTML = '<a class="brand" href="index.html">AndMaverick</a><nav aria-label="Rooms">' +
      rooms.map(([href, label]) => '<a href="' + href + '"' + (href === current ? ' aria-current="page"' : "") + ">" + label + "</a>").join("") + "</nav>";
    document.body.prepend(h);
    const skip = document.createElement("a");
    skip.className = "skip"; skip.href = "#main"; skip.textContent = "Skip to content";
    document.body.prepend(skip);
  }

  window.CR = { TOOLS, ESSAYS, links, fmt, reduced, countTo, esc, pretty, loadEngine, verifyAgainstGitHub, mountNav, inbound };
})();
