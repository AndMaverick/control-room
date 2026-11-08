// deno test backend/tests/inquiry_test.ts
// The edge function is exercised end to end with an in-memory stand-in for Resend and for the inquiries table.
import nodeAssert from "node:assert/strict";
const assert = (c: unknown, m?: string) => nodeAssert.ok(c, m);
const assertEquals = (a: unknown, b: unknown) => nodeAssert.deepEqual(a, b);
const assertMatch = (a: string, re: RegExp) => nodeAssert.match(a, re);
const assertStringIncludes = (a: string, b: string) => nodeAssert.ok(a.includes(b), `expected to include ${JSON.stringify(b)}`);
import { handle } from "../supabase/functions/inquiry/handler.ts";
import { emailHtml, subject, validate } from "../supabase/functions/inquiry/lib.ts";

const ORIGIN = "https://andmaverick.github.io";
const cfg = { to: "andrew@andmaverick.com", from: "AndMaverick <inquiries@andmaverick.com>", resendKey: "re_test", allowedOrigins: [ORIGIN], supabaseUrl: "https://db.test", supabaseKey: "svc", perEmailPerHour: 5, globalPerHour: 40 };

function world(opts: { resend?: number[]; dbDown?: boolean } = {}) {
  const rows: Record<string, Record<string, unknown>> = {};
  const sent: { headers: Headers; body: Record<string, unknown> }[] = [];
  const queue = [...(opts.resend ?? [])];
  const fake = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.startsWith("https://api.resend.com")) {
      sent.push({ headers: new Headers(init!.headers), body: JSON.parse(String(init!.body)) });
      const code = queue.length ? queue.shift()! : 200;
      return new Response("{}", { status: code });
    }
    if (opts.dbDown) return new Response("no table", { status: 404 });
    const q = new URL(u);
    const m = init?.method ?? "GET";
    if (m === "GET") {
      const ref = q.searchParams.get("ref")?.replace("eq.", "");
      const list = Object.values(rows).filter((r) => (ref ? r.ref === ref : true));
      return new Response(JSON.stringify(list), { status: 200 });
    }
    if (m === "POST") { const b = JSON.parse(String(init!.body)); rows[b.ref] = { ...b, delivered: false }; return new Response(null, { status: 201 }); }
    if (m === "PATCH") { const ref = q.searchParams.get("ref")!.replace("eq.", ""); Object.assign(rows[ref], JSON.parse(String(init!.body))); return new Response(null, { status: 204 }); }
    return new Response("?", { status: 500 });
  }) as typeof fetch;
  const deps = { fetch: fake, now: () => Date.parse("2026-11-08T08:00:00Z"), rnd: () => "zz9a" };
  return { rows, sent, deps };
}

const body = (o: Record<string, unknown> = {}) => ({
  ref: "PAR-261108-AB12", name: "Ada Lovelace", email: "Ada@Example.org", org: "Example Ministry", challenge: "Sovereign AI and data residency",
  scale: "$5 million to $25 million", goal: "Keep citizen data in country while using frontier models.", where: "control-room-finale", page: "index.html", elapsed: 42000,
  context: { source: "github", medium: "profile", campaign: "controlroom", env: "Sovereign Government AI Program", incidents: [{ title: "Cost escalation", status: "BREACH" }], complete: true, inspected: ["guard.rails (source code)"], pages: ["Control Room"], report: false, mdqUsed: true },
  mdq: { assumptions: "12,000,000 requests/month", results: "year one $2,000,000" }, mdqConsent: false, ...o,
});
const post = (b: unknown, origin: string | null = ORIGIN) =>
  new Request("https://fn.test/inquiry", { method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin } : {}) }, body: JSON.stringify(b) });

Deno.test("a valid inquiry is stored, emailed to Andrew, and confirmed with its reference", async () => {
  const w = world();
  const r = await handle(post(body()), cfg, w.deps);
  assertEquals(r.status, 200);
  assertEquals(await r.json(), { ok: true, ref: "PAR-261108-AB12" });
  assertEquals(w.sent.length, 1);
  const m = w.sent[0];
  assertEquals(m.body.to, ["andrew@andmaverick.com"]);
  assertEquals(m.body.reply_to, "ada@example.org");
  assertEquals(m.headers.get("idempotency-key"), "PAR-261108-AB12");
  assertEquals(m.headers.get("authorization"), "Bearer re_test");
  assertStringIncludes(String(m.body.subject), "Example Ministry");
  assertStringIncludes(String(m.body.subject), "PAR-261108-AB12");
  assertStringIncludes(String(m.body.text), "Sovereign Government AI Program");
  assertStringIncludes(String(m.body.text), "PRIORITY READ");
  assertEquals(w.rows["PAR-261108-AB12"].delivered, true);
  assertEquals(w.rows["PAR-261108-AB12"].status, undefined); // stage defaults live in the database
});

Deno.test("modeled assumptions are dropped unless consent is explicitly true", async () => {
  const a = world(); await handle(post(body()), cfg, a.deps);
  assert(!String(a.sent[0].body.text).includes("12,000,000"));
  assertStringIncludes(String(a.sent[0].body.text), "used the tool, did not share");
  assertEquals(a.rows["PAR-261108-AB12"].mdq, null);
  const b = world(); await handle(post(body({ mdqConsent: true })), cfg, b.deps);
  assertStringIncludes(String(b.sent[0].body.text), "12,000,000 requests/month");
  const c = world(); await handle(post(body({ mdqConsent: "true" })), cfg, c.deps);
  assert(!String(c.sent[0].body.text).includes("12,000,000"));
});

Deno.test("required fields are validated on the server", async () => {
  const w = world();
  const r = await handle(post(body({ name: " ", email: "nope", org: "", challenge: "Free money", goal: "short" })), cfg, w.deps);
  assertEquals(r.status, 422);
  const j = await r.json();
  assertEquals(Object.keys(j.fields).sort(), ["challenge", "email", "goal", "name", "org"]);
  assertEquals(w.sent.length, 0);
  assertEquals(Object.keys(w.rows).length, 0);
});

Deno.test("only the site's own origins may submit", async () => {
  const w = world();
  assertEquals((await handle(post(body(), "https://evil.example"), cfg, w.deps)).status, 403);
  assertEquals((await handle(post(body(), null), cfg, w.deps)).status, 403);
  const pre = await handle(new Request("https://fn.test/inquiry", { method: "OPTIONS", headers: { origin: ORIGIN } }), cfg, w.deps);
  assertEquals(pre.status, 204);
  assertEquals(pre.headers.get("access-control-allow-origin"), ORIGIN);
  assertStringIncludes(pre.headers.get("access-control-allow-headers")!, "authorization");
  assertEquals(w.sent.length, 0);
});

Deno.test("the honeypot answers like success but sends and stores nothing", async () => {
  const w = world();
  const r = await handle(post(body({ website: "http://spam.example" })), cfg, w.deps);
  assertEquals(r.status, 200);
  assertEquals(w.sent.length, 0);
  assertEquals(Object.keys(w.rows).length, 0);
});

Deno.test("a failed delivery is reported, the inquiry is kept, and a retry delivers it once", async () => {
  const w = world({ resend: [500] });
  const first = await handle(post(body()), cfg, w.deps);
  assertEquals(first.status, 502);
  assertEquals((await first.json()).error, "delivery");
  assertEquals(w.rows["PAR-261108-AB12"].delivered, false);
  assertEquals(w.rows["PAR-261108-AB12"].delivery_error, "resend 500");
  const retry = await handle(post(body()), cfg, w.deps);
  assertEquals(retry.status, 200);
  assertEquals(Object.keys(w.rows).length, 1);
  assertEquals(w.rows["PAR-261108-AB12"].delivered, true);
  assertEquals(w.sent.length, 2); // one failed attempt, one delivery
});

Deno.test("pressing submit twice after success does not send a second email", async () => {
  const w = world();
  await handle(post(body()), cfg, w.deps);
  const again = await handle(post(body()), cfg, w.deps);
  assertEquals(again.status, 200);
  assertEquals((await again.json()).duplicate, true);
  assertEquals(w.sent.length, 1);
  assertEquals(Object.keys(w.rows).length, 1);
});

Deno.test("a reference already held by a different person is reissued", async () => {
  const w = world();
  await handle(post(body()), cfg, w.deps);
  const r = await handle(post(body({ email: "someone@else.org", name: "Someone Else" })), cfg, w.deps);
  const j = await r.json();
  assertEquals(r.status, 200);
  assertMatch(j.ref, /^PAR-261108-[A-Z0-9]{4}$/);
  assert(j.ref !== "PAR-261108-AB12");
  assertEquals(Object.keys(w.rows).length, 2);
});

Deno.test("one address cannot flood the inbox", async () => {
  const w = world();
  for (let i = 0; i < 5; i++) assertEquals((await handle(post(body({ ref: `PAR-261108-A00${i}` })), cfg, w.deps)).status, 200);
  assertEquals((await handle(post(body({ ref: "PAR-261108-A009" })), cfg, w.deps)).status, 429);
  assertEquals(w.sent.length, 5);
});

Deno.test("if the table is not available the inquiry is still delivered", async () => {
  const w = world({ dbDown: true });
  const r = await handle(post(body()), cfg, w.deps);
  assertEquals(r.status, 200);
  assertEquals(w.sent.length, 1);
});

Deno.test("visitor text cannot inject headers or markup into the notification", async () => {
  const w = world();
  const evil = body({ org: "Acme\r\nBcc: attacker@evil.example", name: "<script>alert(1)</script>", goal: "Line one.\nLine two with <b>html</b> and more words." });
  await handle(post(evil), cfg, w.deps);
  const m = w.sent[0].body;
  assert(!/[\r\n]/.test(String(m.subject)));
  const html = String(m.html);
  assert(!html.includes("<script>"));
  assertStringIncludes(html, "&lt;script&gt;");
  assertStringIncludes(html, "&lt;b&gt;html&lt;/b&gt;");
});

Deno.test("references must look like PAR-YYMMDD-XXXX", () => {
  const bad = validate(body({ ref: "../../etc" }));
  assert(!bad.ok);
  const ok = validate(body());
  assert(ok.ok);
  if (ok.ok) { assertEquals(ok.value.email, "ada@example.org"); assertEquals(ok.value.fast, false); assertStringIncludes(subject(ok.value), "$5 million to $25 million"); assertStringIncludes(emailHtml(ok.value), "Private Architecture Review"); }
});

Deno.test("an unusually fast submission is delivered but flagged", async () => {
  const w = world();
  await handle(post(body({ elapsed: 400 })), cfg, w.deps);
  assertStringIncludes(String(w.sent[0].body.text), "unusually quickly");
});
