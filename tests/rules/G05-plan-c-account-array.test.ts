/**
 * Regression guard, green since G05. Was KNOWN RED (W1 lane 5 finding 5; REVIEW.md Structure "silent fallbacks hiding an invariant"). app/onlyfans/plan-c/page.tsx:21
 * uses `process.env.ONLYFANS_PLAN_C_ACCOUNT` whenever `?account=` is not a single string, so a malformed `?account=a&account=b`
 * (an array) silently opens the configured pilot account instead of being refused; app/onlyfans/operations/page.tsx:17 refuses the
 * same input.
 * Drives the REAL page function through tests/rules/controls-page.child.ts as the named owner, env
 * ONLYFANS_PLAN_C_ACCOUNT=of-pilot-1, fake backend recording every Plan C read.
 * Control: no `?account=` at all reads the env account (the intended default).
 * Held since G05: an array `?account=` makes no backend call for the env account (the page refuses the malformed param).
 *
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PILOT_ACCOUNT, controlsChild } from "./controls-fixtures";

const run = () => controlsChild("plan-c-page");
const forPilot = (calls: string[]) => calls.filter(c => c.includes(`/accounts/${PILOT_ACCOUNT}/`));

test("control: with the env account set and no ?account=, the page reads the env account", () => {
  const r = run()["env, no param"];
  assert.ok(forPilot(r.calls).length > 0, `calls: ${r.calls.join(", ")}`);
});

test("F5: a malformed array ?account= makes no backend call for the env account", () => {
  const r = run()["env, array param"];
  assert.deepEqual(forPilot(r.calls), [], "the page fell back to ONLYFANS_PLAN_C_ACCOUNT for an array ?account=");
});
