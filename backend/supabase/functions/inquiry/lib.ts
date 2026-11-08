// Pure logic for the Private Architecture Review inquiry service: validation and the notification email.
// No network, no secrets. Everything here is covered by backend/tests/inquiry_test.ts.

export const CHALLENGES = [
  "AI economics and cost architecture",
  "Enterprise AI deployment",
  "AI reliability and governance",
  "Sovereign AI and data residency",
  "Vendor strategy and build versus buy",
  "Something else",
];
export const SCALES = [
  "Under $1 million",
  "$1 million to $5 million",
  "$5 million to $25 million",
  "$25 million to $100 million",
  "Over $100 million",
  "Prefer not to say",
];
const SCALE_RANK: Record<string, number> = Object.fromEntries(SCALES.map((s, i) => [s, i]));

export interface Incident { title: string; status: string }
export interface Clean {
  ref: string;
  name: string; email: string; org: string; challenge: string; scale: string; goal: string;
  where: string; page: string;
  context: {
    source: string; medium: string; campaign: string; env: string;
    incidents: Incident[]; complete: boolean; inspected: string[]; pages: string[]; report: boolean; mdqUsed: boolean;
  };
  mdq: { assumptions: string; results: string } | null;
  fast: boolean;
}
export type Checked = { ok: true; value: Clean } | { ok: false; fields: Record<string, string> };

const s = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max) : "");
const list = (v: unknown, n: number, max: number): string[] => (Array.isArray(v) ? v.slice(0, n).map((x) => s(x, max)).filter(Boolean) : []);
const EMAIL = /^[^@\s<>"',;]+@[^@\s<>"',;]+\.[^@\s<>"',;]{2,}$/;
export const REF = /^PAR-\d{6}-[A-Z0-9]{4}$/;

// Header injection guard: nothing from a visitor is ever placed in a header except through these helpers.
export const oneLine = (v: string) => v.replace(/[\r\n]+/g, " ");

export function validate(raw: unknown): Checked {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const f: Record<string, string> = {};
  const name = s(r.name, 120), email = s(r.email, 254).toLowerCase(), org = s(r.org, 160);
  const challenge = s(r.challenge, 80), scale = s(r.scale, 40), goal = s(r.goal, 1200);
  if (!name) f.name = "Please share your name.";
  if (!EMAIL.test(email)) f.email = "Please enter a valid work email.";
  if (!org) f.org = "Please share your organization.";
  if (!CHALLENGES.includes(challenge)) f.challenge = "Please choose the closest challenge.";
  if (scale && !SCALES.includes(scale)) f.scale = "Please choose one of the listed ranges.";
  if (goal.length < 10) f.goal = "A sentence or two about what you are trying to accomplish is enough.";
  const ref = s(r.ref, 20);
  if (!REF.test(ref)) f.ref = "Reference is malformed.";
  if (Object.keys(f).length) return { ok: false, fields: f };

  const c = (r.context && typeof r.context === "object" ? r.context : {}) as Record<string, unknown>;
  const incidents = (Array.isArray(c.incidents) ? c.incidents.slice(0, 8) : [])
    .map((i) => ({ title: s((i as Record<string, unknown>)?.title, 80), status: s((i as Record<string, unknown>)?.status, 24) }))
    .filter((i) => i.title);
  // Modeled assumptions travel only with explicit consent. The flag, not the presence of text, decides.
  const consent = r.mdqConsent === true;
  const m = (r.mdq && typeof r.mdq === "object" ? r.mdq : null) as Record<string, unknown> | null;
  const mdq = consent && m ? { assumptions: s(m.assumptions, 700), results: s(m.results, 500) } : null;

  return {
    ok: true,
    value: {
      ref, name, email, org, challenge, scale, goal,
      where: s(r.where, 60), page: s(r.page, 60),
      context: {
        source: s(c.source, 60), medium: s(c.medium, 60), campaign: s(c.campaign, 80), env: s(c.env, 80),
        incidents, complete: c.complete === true, inspected: list(c.inspected, 16, 90), pages: list(c.pages, 6, 40),
        report: c.report === true, mdqUsed: c.mdqUsed === true,
      },
      mdq: mdq && (mdq.assumptions || mdq.results) ? mdq : null,
      fast: typeof r.elapsed === "number" && r.elapsed < 1500,
    },
  };
}

/** What a serious advisory inquiry looks like at a glance. Facts only, no scoring. */
export function signals(v: Clean): string[] {
  const out: string[] = [];
  if (v.scale && v.scale !== "Prefer not to say") out.push("Initiative scale stated: " + v.scale);
  if (v.context.env) out.push("Explored: " + v.context.env + (v.context.complete ? " (ran the full simulation)" : ""));
  if (v.context.inspected.length) out.push("Inspected " + v.context.inspected.length + " technical item" + (v.context.inspected.length > 1 ? "s" : ""));
  if (v.context.mdqUsed) out.push("Modeled their own economics in The Million Dollar Question" + (v.mdq ? " (assumptions shared)" : " (assumptions not shared)"));
  if (v.context.report) out.push("Generated the executive report");
  return out;
}

export function tier(v: Clean): string {
  const k = SCALE_RANK[v.scale];
  return k !== undefined && k >= 2 && k <= 4 ? "Priority read" : "Inquiry";
}

export function subject(v: Clean): string {
  return oneLine(`[PAR] ${v.org} | ${v.challenge}${v.scale && v.scale !== "Prefer not to say" ? " | " + v.scale : ""} | ${v.ref}`).slice(0, 200);
}

export function emailText(v: Clean): string {
  const c = v.context;
  const L = [
    "PRIVATE ARCHITECTURE REVIEW INQUIRY",
    tier(v).toUpperCase() + "  |  " + v.ref,
    "",
    "WHO",
    `${v.name}, ${v.org}`,
    v.email,
    "",
    "WHAT THEY ARE TRYING TO ACCOMPLISH",
    v.goal,
    "",
    "PRIMARY CHALLENGE: " + v.challenge,
    "INITIATIVE SCALE (budget, not a fee): " + (v.scale || "not stated"),
    "",
    "WHAT CAUGHT THEIR ATTENTION",
    "Environment: " + (c.env || "none explored"),
    "Incidents run: " + (c.incidents.length ? c.incidents.map((i) => `${i.title} (${i.status})`).join(", ") : "none"),
    "Simulation completed: " + (c.complete ? "yes" : "no"),
    "Technical items inspected: " + (c.inspected.length ? c.inspected.join(", ") : "none"),
    "Rooms visited: " + (c.pages.length ? c.pages.join(", ") : "unknown"),
    "Executive report generated: " + (c.report ? "yes (not attached)" : "no"),
    v.mdq
      ? "Modeled assumptions (shared with permission; a model, not a fact):\n  " + v.mdq.assumptions + "\n  " + v.mdq.results
      : "Modeled assumptions: " + (c.mdqUsed ? "used the tool, did not share" : "tool not used"),
    "",
    "WHERE THEY CAME FROM",
    `Source: ${c.source || "direct"}${c.medium ? " / " + c.medium : ""}${c.campaign ? " / " + c.campaign : ""}`,
    `Opened from: ${v.where || "unknown"} (page: ${v.page || "unknown"})`,
    "",
    "SIGNALS",
    ...(signals(v).length ? signals(v).map((x) => "- " + x) : ["- none beyond the form itself"]),
    "",
    v.fast ? "NOTE: submitted unusually quickly. Treat with normal care." : "",
    "Reply to this message to answer them directly. Track it against " + v.ref + " in the inquiries table.",
  ];
  return L.filter((x, i, a) => !(x === "" && a[i - 1] === "")).join("\n");
}

const esc = (x: string) => x.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function emailHtml(v: Clean): string {
  const c = v.context;
  const row = (k: string, val: string) => `<tr><td style="padding:6px 16px 6px 0;color:#8a8372;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;color:#1b1a17">${esc(val).replace(/\n/g, "<br>")}</td></tr>`;
  const h = (t: string) => `<p style="margin:28px 0 6px;font:600 11px Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#a8884a">${esc(t)}</p>`;
  const sig = signals(v);
  return `<!doctype html><html><body style="margin:0;background:#f4f1ea"><div style="max-width:620px;margin:0 auto;padding:32px 28px;background:#fffdf8;font:15px/1.55 Georgia,serif;color:#1b1a17">
<p style="margin:0;font:600 11px Arial,sans-serif;letter-spacing:.22em;text-transform:uppercase;color:#a8884a">Private Architecture Review &middot; ${esc(tier(v))}</p>
<h1 style="margin:10px 0 2px;font:400 28px Georgia,serif">${esc(v.name)}</h1>
<p style="margin:0;color:#4a463c">${esc(v.org)} &middot; <a href="mailto:${esc(v.email)}" style="color:#7a5f27">${esc(v.email)}</a></p>
<p style="margin:6px 0 0;font:12px Arial,sans-serif;color:#8a8372">${esc(v.ref)}</p>
${h("What they are trying to accomplish")}<p style="margin:0;font-size:17px">${esc(v.goal).replace(/\n/g, "<br>")}</p>
${h("Challenge and scale")}<table style="border-collapse:collapse;font-size:14px">${row("Primary challenge", v.challenge)}${row("Initiative scale", (v.scale || "not stated") + "  (budget, not a fee)")}</table>
${h("What caught their attention")}<table style="border-collapse:collapse;font-size:14px">
${row("Environment", c.env || "none explored")}${row("Incidents run", c.incidents.length ? c.incidents.map((i) => `${i.title} (${i.status})`).join(", ") : "none")}${row("Simulation completed", c.complete ? "yes" : "no")}${row("Items inspected", c.inspected.length ? c.inspected.join(", ") : "none")}${row("Rooms visited", c.pages.join(", ") || "unknown")}${row("Executive report", c.report ? "generated (not attached)" : "not generated")}
${row("Modeled assumptions", v.mdq ? v.mdq.assumptions + "\n" + v.mdq.results : c.mdqUsed ? "used the tool, did not share" : "tool not used")}</table>
${h("Where they came from")}<table style="border-collapse:collapse;font-size:14px">${row("Source", (c.source || "direct") + (c.medium ? " / " + c.medium : "") + (c.campaign ? " / " + c.campaign : ""))}${row("Opened from", (v.where || "unknown") + " (" + (v.page || "unknown") + ")")}</table>
${h("Signals")}<ul style="margin:0;padding-left:18px;font-size:14px">${(sig.length ? sig : ["none beyond the form itself"]).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
${v.fast ? '<p style="margin:18px 0 0;font:12px Arial,sans-serif;color:#9a5a1a">Submitted unusually quickly. Treat with normal care.</p>' : ""}
<p style="margin:30px 0 0;font:12px Arial,sans-serif;color:#8a8372">Reply to answer them directly. Track this inquiry against ${esc(v.ref)} in the inquiries table.</p>
</div></body></html>`;
}
