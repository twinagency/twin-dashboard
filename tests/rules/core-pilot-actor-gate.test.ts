/**
 * Characterization (W1 lane 4 CH2; REVIEW.md invariant 7 "Isolation": Plan C stays unreachable for agency users). The REAL
 * requireOnlyFansRead (lib/onlyfans/route.ts:74-75) sets `pilotActor` only for a verified, non-agency, non-view-as operator
 * session with a resolved named owner; agency and view-as sessions never trigger the owner lookup. Driven through
 * tests/rules/core-route.child.ts (see its header): `planCOwnerActor` is the real core behind a call counter, so "never called"
 * is measured, and the session cookie is checked by the real isAuthed against a fake Supabase verify RPC.
 * Not duplicated from lane 1 (rwl/W1-lib-onlyfans-plan-c): tests/rules/plan-c-owner-fail-closed.test.ts pins the core alone
 * (env, token shape, non-OK, UUID shape, timeout); tests/contracts/plan-c.test.ts:283 pins planCOperatorOnly given a ctx. No
 * case here is skipped for overlap: none of them drives requireOnlyFansRead's pilotIdentity branch.
 * The case that catches a dropped agency check is an agency identity that ALSO carries a verified operator cookie (the operator
 * signed into an agency portal in the same browser): operatorSession true, agency true.
 * Mutation-proven: removing `!auth.agency &&` at route.ts:74 turns this red (tests/rules/mutations/W1-lib-onlyfans-core/7-*).
 * Limits, read before trusting it:
 *  - It pins the route.ts:74 shape (`pilotIdentity` flag + optional `pilotActor`) that F7 recommends removing, so it MUST be
 *    rewritten together with the F7 fix. The rewrite keeps this invariant: no owner lookup and no Plan C actor for agency or
 *    view-as sessions, and a failed lookup means refused.
 *  - Mutation 7 is caught only by {agency: true, pilotIdentity: true}, a combination no production caller uses
 *    (lib/onlyfans/plan-c-guard.ts:21 and app/onlyfans/plan-c/page.tsx:14 pass agency: false, where reads.ts:116 already refuses
 *    an agency identity without a grant).
 *  - Case b passes because reads.ts:107 refuses view-as before route.ts:74, not because of `!auth.viewAs` there.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { coreRouteChild, NAMED_OWNER } from "./core-fixtures";

const run = () => coreRouteChild("pilot");

test("CH2 a: an agency session never gets a pilotActor and never triggers the owner lookup", () => {
  const r = run();
  assert.deepEqual(r["agency session"], { result: "ctx", pilotActor: null, lookups: 0 });
  assert.deepEqual(r["agency identity with operator cookie, agency options"], { result: "ctx", pilotActor: null, lookups: 0 },
    "an agency identity with a verified operator cookie resolved a Plan C owner");
  assert.deepEqual(r["agency identity with operator cookie, plan-c-guard options"], { result: "denied:403", pilotActor: null, lookups: 0 });
});

test("CH2 b: a view-as session is refused and never triggers the owner lookup", () => {
  assert.deepEqual(run()["view-as"], { result: "denied:403", pilotActor: null, lookups: 0 });
});

test("CH2 c: an operator session whose owner lookup fails gets pilotActor null", () => {
  assert.deepEqual(run()["operator, lookup fails"], { result: "ctx", pilotActor: null, lookups: 1 });
});

test("CH2 d: an operator session whose owner lookup resolves gets that named-owner actor", () => {
  const expected = `op-session:${createHash("sha256").update(`twin-plan-c-named-owner-v1:${NAMED_OWNER}`).digest("hex")}`;
  assert.deepEqual(run()["operator, lookup resolves"], { result: "ctx", pilotActor: expected, lookups: 1 });
});

test("CH2 e: without the pilotIdentity option there is no pilotActor and no lookup", () => {
  assert.deepEqual(run()["operator, no pilotIdentity"], { result: "ctx", pilotActor: null, lookups: 0 });
});
