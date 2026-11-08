/* Node built-in test runner: node --test tests/ */
const test = require("node:test");
const assert = require("node:assert");
const R = require("../assets/review.js");

const f = { name: "A Person", email: "a@example.org", org: "Example Bank", challenge: "AI economics and cost architecture", scale: "", goal: "Understand inference spend." };
const ctx = { source: "github", medium: "profile", campaign: "controlroom", env: "Global Investment Bank", incidents: [{ title: "Cost escalation", status: "BREACH" }], complete: true, inspected: ["model.ledger (source code)"], pages: ["Control Room"], mdq: { assumptions: "9,000,000 requests/month", results: "year one $2,000,000" } };

test("inquiry carries the reference, the visitor's words and the context", () => {
  const q = R.buildInquiry(f, ctx, { ref: "PAR-261108-ABCD", where: "control-room-finale", page: "index.html" });
  assert.match(q.subject, /Example Bank \[PAR-261108-ABCD\]/);
  for (const s of ["Name: A Person", "Understand inference spend.", "Environment explored: Global Investment Bank", "Cost escalation (BREACH)", "Arrived from: github / profile / controlroom", "budget, not a fee"]) assert.ok(q.body.includes(s), s);
});

test("modeled assumptions are never included without consent", () => {
  const off = R.buildInquiry(f, ctx, { includeMdq: false });
  assert.ok(!off.body.includes("9,000,000"));
  assert.ok(off.body.includes("Assumptions not shared"));
  const on = R.buildInquiry(f, ctx, { includeMdq: true });
  assert.ok(on.body.includes("9,000,000 requests/month"));
});

test("an empty visit is stated plainly, not invented", () => {
  const q = R.buildInquiry(f, {}, {});
  assert.ok(q.body.includes("Environment explored: none"));
  assert.ok(q.body.includes("Simulation completed: no"));
  assert.ok(q.body.includes("Million Dollar Question: not used"));
});

test("mailto goes to the published address and encodes everything", () => {
  const u = R.mailto(R.buildInquiry(f, ctx, {}));
  assert.ok(u.startsWith("mailto:andrew@andmaverick.com?subject="));
  assert.ok(!/\s/.test(u));
});

test("references look like PAR-YYMMDD-XXXX", () => {
  assert.match(R.newRef(new Date("2026-11-08T00:00:00Z"), "k3qz"), /^PAR-261108-K3QZ$/);
});
