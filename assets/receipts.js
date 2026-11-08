/* The Receipts: every entry carries an honest evidence label and a source. */
(function () {
  "use strict";
  const { esc, links, TOOLS, ESSAYS } = CR;
  const $ = (s) => document.querySelector(s);
  CR.mountNav("receipts.html");
  $("#explore").href = links.site("receipts-explore", "receipts");

  const EVIDENCE = {
    press: ["Third-party press", "Reported by an independent publication."],
    conversation: ["Public conversation", "A recorded conversation hosted by someone else."],
    published: ["Published by me", "Writing and code I published myself."],
    self: ["Self-reported", "My own account, as published on andmaverick.com."],
  };
  $("#legend").innerHTML = Object.entries(EVIDENCE).map(([k, [n, d]]) => `<span class="tag ${k === "press" || k === "conversation" ? "exec" : k === "self" ? "input" : ""}" title="${esc(d)}">${n}</span>`).join("");

  const SF = ["https://sfstandard.com/2026/07/14/ai-job-coach-industry/", "The San Francisco Standard, July 2026: Can't get an AI job? Hire someone who already has one"];
  const HOME = [links.site("receipts-site", "receipts"), "andmaverick.com"];
  const THEMES = { economics: "Economics and capital", reliability: "Reliability and control", strategy: "Enterprise strategy", sovereignty: "Sovereignty and language" };

  const INSTITUTIONS = [
    { name: "OpenAI", text: "I worked at OpenAI in the GPT-2 and GPT-3 era.", ev: [["press", SF], ["self", HOME]], note: "The San Francisco Standard describes me as a former product strategist at OpenAI." },
    { name: "Spotify", text: "Head of AI for Product Experience.", ev: [["press", SF], ["self", HOME]], note: "The San Francisco Standard describes me as head of AI at Spotify." },
    { name: "Coinbase", text: "Advisor.", ev: [["self", HOME]] },
    { name: "Stripe", text: "Early, helping build infrastructure.", ev: [["self", HOME]] },
    { name: "Yale School of Management", text: "MBA, 2020.", ev: [["self", HOME]] },
    { name: "AndMaverick LLC", text: "Founder and Principal AI Strategist, based in Dubai, working across North America, Europe, Asia-Pacific and the Gulf. I lead each mandate personally.", ev: [["self", HOME]] },
  ];
  const ORGS = ["Government of Australia", "Government of New Zealand", "Blackstone", "Mayo Clinic", "JPMorgan Chase", "Microsoft", "Suno", "Temasek", "G42", "Sea Group"];

  const PRESS = [
    { ev: "press", title: SF[1], url: SF[0], theme: [] },
    { ev: "conversation", title: "What OpenAI, Spotify, and Coinbase Taught Me About Building AI People Actually Use", url: "https://open.spotify.com/episode/0BfreIuQSjRs6YAEiin5qy", by: "Celia's Corner", theme: ["strategy"] },
    { ev: "conversation", title: "Why Your AI Strategy Is Burning Cash (And How to Fix It)", url: "https://podcasts.apple.com/us/podcast/why-your-ai-strategy-is-burning-cash-and-how-to-fix/id1755720920?i=1000788232215", by: "KAJ Business and Money Live", theme: ["economics"] },
  ];

  const THREADS = [
    { theme: "economics", essay: "meter", question: "Who is accountable for what an AI system costs?", repos: ["model.ledger", "token.econ", "roi.lens", "build.buy", "route.sense"], room: true },
    { theme: "reliability", essay: "agent", question: "When an AI system fails, who answers for it, and where do the controls live?", repos: ["guard.rails", "drift.watch", "eval.forge", "prompt.vault", "incident.log", "agent.trace", "lex.machine"], room: true },
    { theme: "strategy", essay: "job", question: "What should an organization build, buy and fund, and who is responsible for deciding?", repos: ["readiness.index", "vendor.score", "orchestra.dsl", "context.engine", "playbook.compiler"] },
    { theme: "sovereignty", essay: "passport", question: "What happens when data, language or jurisdiction sits outside American assumptions?", repos: ["sovereign.map", "lisan", "nusantara"], room: true },
  ];
  const INTEGRATED = new Set(["model.ledger", "guard.rails", "drift.watch", "sovereign.map", "roi.lens", "build.buy"]);

  const evTag = (k, src) => `<a class="tag ${k === "press" || k === "conversation" ? "exec" : k === "self" ? "input" : ""}" href="${esc(src[0])}" title="${esc(EVIDENCE[k][1])}" style="border-bottom-width:1px">${EVIDENCE[k][0]}${src[1] ? ": " + esc(src[1].length > 38 ? src[1].slice(0, 36) + "…" : src[1]) : ""}</a>`;

  function section(num, title, lede, body, attrs) {
    return `<div class="era" ${attrs || ""}><div class="when">${num}</div><div><h3>${title}</h3><p class="dim" style="max-width:60ch">${lede}</p>${body}</div></div>`;
  }

  const filterState = { theme: null };
  function render() {
    const f = filterState.theme;
    const inst = section("I", "Settings", "The institutions where I developed these views. The repositories below are independent work and were not built for any of them.",
      `<div class="grid g3" style="margin-top:22px">${INSTITUTIONS.map((i) => `<div class="panel card"><h3>${i.name}</h3><p style="margin:0">${esc(i.text)}</p>${i.note ? `<p class="dim" style="font-size:13px;margin:0">${esc(i.note)}</p>` : ""}<div class="ev">${i.ev.map(([k, s]) => evTag(k, s)).join("")}</div></div>`).join("")}</div>
       <p class="dim" style="margin-top:22px">Advisory organizations, as published at <a href="${HOME[0]}">andmaverick.com</a>: ${ORGS.join(", ")}. This page does not describe the scope or outcome of any engagement. The questions behind this work are the subject of a <button type="button" class="linklike" data-par="receipts">private architecture review</button>.</p>`);
    const press = section("II", "Public record", "What others have published or recorded.",
      `<div class="grid g3" style="margin-top:22px">${PRESS.filter((p) => !f || !p.theme.length || p.theme.includes(f)).map((p) => `<div class="panel card"><h3 style="font-size:22px;line-height:1.1">${esc(p.title)}</h3>${p.by ? `<p class="dim" style="margin:0">${esc(p.by)}</p>` : ""}<div class="ev">${evTag(p.ev, [p.url, ""])}<a href="${esc(p.url)}">Read or listen</a></div></div>`).join("")}</div>`);
    const threads = section("III", "The questions I keep working on", "Each essay asks a question. Each set of repositories explores part of it in code. Open one thread at a time.",
      THREADS.filter((t) => !f || t.theme === f).map((t) => `<div class="panel pad" style="margin-top:22px" id="thread-${t.theme}"><p class="eyebrow">${THEMES[t.theme]}</p><h3 style="margin:10px 0 12px;font-size:clamp(26px,3vw,38px)">${esc(t.question)}</h3>
        <div class="ev">${evTag("published", [links.essay(t.essay, "receipts-" + t.theme), ESSAYS[t.essay][0]])}</div>
        <div class="ev" style="margin-top:16px">${t.repos.map((r) => `<a class="chip" href="${links.repo(r)}" style="border-bottom:1px solid var(--line)">${r}${INTEGRATED.has(r) ? " ·&nbsp;runs in the Control Room" : ""}</a>`).join("")}</div>
        ${t.room ? `<p style="margin:20px 0 0"><a href="index.html">Watch this problem unfold in the Control Room</a></p>` : ""}</div>`).join(""));
    $("#archive").innerHTML = inst + press + threads;
  }
  $("#filters").innerHTML = [["", "Everything"], ...Object.entries(THEMES)].map(([k, l]) => `<button class="btn quiet" data-t="${k}" aria-pressed="${k === ""}">${l}</button>`).join("");
  $("#filters").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    filterState.theme = b.dataset.t || null;
    [...$("#filters").children].forEach((x) => { x.setAttribute("aria-pressed", String(x === b)); x.style.borderColor = x === b ? "var(--gold)" : ""; x.style.color = x === b ? "var(--soft)" : ""; });
    render();
  });
  $("#filters").firstChild.style.borderColor = "var(--gold)";
  render();
})();
