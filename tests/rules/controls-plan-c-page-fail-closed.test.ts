/**
 * Characterization (W1 lane 5 CH-E; REVIEW.md Structure "silent fallbacks", invariant 5 no per-creator code paths): the Plan C
 * page app/onlyfans/plan-c/page.tsx:21-23 fails closed when ONLYFANS_PLAN_C_ACCOUNT is unset and no `?account=` is given: it says
 * "Select the configured pilot account." and makes no backend call (no hard-coded default account). Named owner session, real
 * page function rendered with renderToStaticMarkup, driven through tests/rules/controls-page.child.ts (see its header).
 * Shares the KR-3/KR-5 harness (scenario plan-c-page). Not duplicated by lane 1 (route layer only) or lane 4.
 * Mutation-proven: e-1 adds `?? "of-plan-c-a"` after the env read at page.tsx:21 (only this test red).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { controlsChild } from "./controls-fixtures";

test("CH-E: with no env account and no ?account= the Plan C page asks for the pilot account and calls nothing", () => {
  const r = controlsChild("plan-c-page")["no env, no param"];
  assert.equal(r.message, "Select the configured pilot account.");
  assert.equal(r.console, false);
  assert.deepEqual(r.calls, []);
});
