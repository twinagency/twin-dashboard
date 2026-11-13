/**
 * Regression guard, green since G05. Was KNOWN RED (W1 lane 5 finding 3; REVIEW.md invariant 7 "Holds and STOP": a STOP is never harder to trigger than a go).
 * app/onlyfans/plan-c/page.tsx:24-25 reads drafts AND pilot-scope and returns "This pilot account is not available to this
 * session." when either fails, so one failing draft read removes the whole console (STOP, takeover, unresolved) although the
 * scope check succeeded; PlanCConsole (components/onlyfans-preview/PlanCConsole.tsx) loads drafts itself and has its own
 * draft-error state.
 * Drives the REAL page function through tests/rules/controls-page.child.ts as the named owner (fake owner-identity RPC returns a
 * UUID), `?account=of-pilot-1`, real configuredPlanCBackend over a fake wire. Static form (renderToStaticMarkup) for the page
 * gate; for the red the page is also MOUNTED in jsdom with effects (`plan-c-console`, as KR-1 does for Operations): the console's
 * own reads go through the REAL Plan C read routes, the backend serves one unresolved send on conversation of-pilot-1:900000000001
 * and fails (502) or serves the draft read.
 * Controls: drafts ok + scope ok renders the console (static) and, mounted, a STOP control for that conversation (so the red's
 * STOP assertion is satisfiable); pilot-scope 502 (drafts ok) renders no console, so a fix that opens the console on any failure
 * (fail-open) stays caught. The scope control does not pin the message: finding 3 also asks that an outage stop reading as
 * "not available to this session", so the fix is free to change that text.
 * Held since G05: with drafts failing and scope ok, the mounted console still offers STOP for the conversation known from
 * unresolved work (page gates on scope only; console shows the draft failure). A fix that renders a console with no STOP stays
 * red.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { controlsChild } from "./controls-fixtures";

const run = () => controlsChild("plan-c-page");

test("control: drafts ok and pilot scope ok render the Plan C console", () => {
  const r = run().ok;
  assert.equal(r.console, true);
  assert.ok(r.calls.some(c => c.endsWith("/pilot-scope")), "the page read pilot-scope");
});

test("control: a failing pilot-scope read (drafts ok) renders no console", () => {
  const r = run()["scope 502"];
  assert.ok(r.calls.some(c => c.endsWith("/pilot-scope")), "precondition: the page read pilot-scope");
  assert.equal(r.console, false);
});

test("control: drafts ok and pilot scope ok, mounted, offer STOP for the conversation with unresolved work", () => {
  const r = controlsChild("plan-c-console").ok;
  assert.equal(r.console, true);
  assert.equal(r.stop, true, `no STOP control; browser reads: ${r.browser.join(", ")}`);
});

test("F3: a failing draft read with pilot scope ok still offers STOP for the conversation with unresolved work", () => {
  const r = controlsChild("plan-c-console")["drafts 502"];
  assert.ok(r.calls.some(c => c.endsWith("/pilot-scope")), "precondition: the page read pilot-scope");
  assert.equal(r.console, true, `console hidden; page said: ${run()["drafts 502"].message}`);
  assert.equal(r.stop, true, "console rendered without a STOP control for the conversation with unresolved work");
});
