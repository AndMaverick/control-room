// The request handler, with every outside dependency passed in so it can be tested without a network.
import { Clean, emailHtml, emailText, REF, subject, validate } from "./lib.ts";

export interface Config {
  to: string;
  from: string;
  resendKey: string;
  allowedOrigins: string[];
  supabaseUrl?: string;      // set automatically inside Supabase
  supabaseKey?: string;      // service role, set automatically inside Supabase, never sent to a browser
  perEmailPerHour: number;
  globalPerHour: number;
}
export interface Deps { fetch: typeof fetch; now: () => number; rnd: () => string }

const MAX_BYTES = 24_000;

function cors(origin: string | null, cfg: Config): Record<string, string> {
  const h: Record<string, string> = { "Vary": "Origin", "Cache-Control": "no-store" };
  if (origin && cfg.allowedOrigins.includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "content-type, authorization, apikey";
    h["Access-Control-Max-Age"] = "600";
  }
  return h;
}
const json = (status: number, body: unknown, h: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...h, "content-type": "application/json" } });

export function makeRef(now: number, rnd: string): string {
  const d = new Date(now).toISOString().slice(2, 10).replace(/-/g, "");
  return `PAR-${d}-${rnd.toUpperCase().replace(/[^A-Z0-9]/g, "0").padEnd(4, "0").slice(0, 4)}`;
}

export async function handle(req: Request, cfg: Config, deps: Deps): Promise<Response> {
  const origin = req.headers.get("origin");
  const h = cors(origin, cfg);

  if (req.method === "OPTIONS") return new Response(null, { status: origin && h["Access-Control-Allow-Origin"] ? 204 : 403, headers: h });
  if (req.method !== "POST") return json(405, { ok: false, error: "method" }, h);
  // Browsers always send Origin on a cross-origin POST. Anything else is not our form.
  if (!origin || !h["Access-Control-Allow-Origin"]) return json(403, { ok: false, error: "origin" }, h);

  const text = await req.text();
  if (text.length > MAX_BYTES) return json(413, { ok: false, error: "too_large" }, h);
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(text); } catch { return json(400, { ok: false, error: "malformed" }, h); }

  // Honeypot: a real visitor never sees this field. Answer as if it worked so bots learn nothing.
  if (typeof raw.website === "string" && raw.website.trim() !== "") {
    return json(200, { ok: true, ref: typeof raw.ref === "string" && REF.test(raw.ref) ? raw.ref : makeRef(deps.now(), deps.rnd()) }, h);
  }

  const checked = validate(raw);
  if (!checked.ok) return json(422, { ok: false, error: "validation", fields: checked.fields }, h);
  const v: Clean = checked.value;

  const db = cfg.supabaseUrl && cfg.supabaseKey ? new Db(cfg.supabaseUrl, cfg.supabaseKey, deps) : null;
  let stored = false;

  if (db) {
    try {
      const since = new Date(deps.now() - 3_600_000).toISOString();
      const recent = await db.recent(since);
      if (recent.length >= cfg.globalPerHour || recent.filter((r) => r.email === v.email && r.ref !== v.ref).length >= cfg.perEmailPerHour) {
        return json(429, { ok: false, error: "rate_limited" }, h);
      }
      const existing = await db.find(v.ref);
      if (existing) {
        if (existing.email === v.email) {
          // The same visitor pressing the button again, or retrying after a failed delivery.
          if (existing.delivered) return json(200, { ok: true, ref: v.ref, duplicate: true }, h);
          stored = true;
        } else {
          v.ref = makeRef(deps.now(), deps.rnd()); // someone else already holds that reference
        }
      }
      if (!stored) { await db.insert(v); stored = true; }
    } catch (e) {
      console.error("inquiries table unavailable, continuing with email only:", String(e).slice(0, 200));
    }
  }

  let delivered = false, err = "";
  try {
    const res = await deps.fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "authorization": `Bearer ${cfg.resendKey}`, "content-type": "application/json", "idempotency-key": v.ref },
      body: JSON.stringify({ from: cfg.from, to: [cfg.to], reply_to: v.email, subject: subject(v), text: emailText(v), html: emailHtml(v) }),
    });
    delivered = res.ok;
    if (!res.ok) err = `resend ${res.status}`;
  } catch (e) { err = "resend unreachable: " + String(e).slice(0, 120); }

  if (db && stored) { try { await db.mark(v.ref, delivered, err, deps.now()); } catch { /* the response below is what matters */ } }
  if (!delivered) { console.error("delivery failed for", v.ref, err); return json(502, { ok: false, error: "delivery" }, h); }
  return json(200, { ok: true, ref: v.ref }, h);
}

/** Minimal PostgREST client. Uses the service role key, which only ever exists inside Supabase. */
class Db {
  constructor(private url: string, private key: string, private deps: Deps) {}
  private hdr(extra: Record<string, string> = {}) {
    return { apikey: this.key, authorization: `Bearer ${this.key}`, "content-type": "application/json", ...extra };
  }
  private async call(path: string, init: RequestInit) {
    const r = await this.deps.fetch(`${this.url}/rest/v1/inquiries${path}`, init);
    if (!r.ok) throw new Error(`db ${r.status}`);
    return r;
  }
  async recent(since: string): Promise<{ ref: string; email: string }[]> {
    return await (await this.call(`?select=ref,email&created_at=gte.${encodeURIComponent(since)}&limit=100`, { headers: this.hdr() })).json();
  }
  async find(ref: string): Promise<{ ref: string; email: string; delivered: boolean } | null> {
    const rows = await (await this.call(`?select=ref,email,delivered&ref=eq.${encodeURIComponent(ref)}`, { headers: this.hdr() })).json();
    return rows[0] ?? null;
  }
  async insert(v: Clean) {
    const c = v.context;
    await this.call("", {
      method: "POST", headers: this.hdr({ prefer: "return=minimal" }),
      body: JSON.stringify({
        ref: v.ref, name: v.name, email: v.email, org: v.org, challenge: v.challenge, scale: v.scale || null, goal: v.goal,
        env: c.env || null, incidents: c.incidents, complete: c.complete, inspected: c.inspected, pages: c.pages, report: c.report,
        source: c.source || null, medium: c.medium || null, campaign: c.campaign || null, opened_from: v.where || null, page: v.page || null,
        mdq_shared: !!v.mdq, mdq: v.mdq,
      }),
    });
  }
  async mark(ref: string, delivered: boolean, error: string, now: number) {
    await this.call(`?ref=eq.${encodeURIComponent(ref)}`, {
      method: "PATCH", headers: this.hdr({ prefer: "return=minimal" }),
      body: JSON.stringify({ delivered, delivered_at: delivered ? new Date(now).toISOString() : null, delivery_error: error || null }),
    });
  }
}
