/**
 * Characterization (W1 lane 5 CH-B; REVIEW.md invariant 7 "Isolation": agency scope = allowlist + the scope header to the
 * backend). For a chat agency session, the three engine reads
 * (app/api/onlyfans/accounts/[accountId]/conversations/[conversationId]/engine-status/route.ts:14,
 * .../engine/catalogue/route.ts:14, .../engine/unresolved/route.ts:14) and the request-action write
 * (app/api/onlyfans-controls/.../requests/[requestId]/route.ts:34) reach the backend ONLY under /onlyfans/agency/v1/ and ONLY with
 * the X-OnlyFans-Agency-Scope header, because each passes `ctx.fetch` (agencyScopedFetch) to its backend. Every call the fake wire
 * saw is checked, the preflight included. Driven through tests/rules/controls-route.child.ts (see its header).
 * Not duplicated: lane 4 CH4 pins chatBackendPath (the write allowlist); this pins that each in-scope route uses the scoped
 * transport at all (lane 4 C2: `fetchImpl` is optional, so a route forgetting `ctx.fetch` compiles and calls unscoped).
 * Mutation-proven (one per test): b-1/b-2/b-3 drop `ctx.fetch` from configuredEngineStatusBackend() in the engine-status /
 * catalogue / unresolved route (only that read's test red); b-4 drops it from configuredEngineOperatorBackend() in the requests
 * route (only "request action" red).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { controlsChild, type RouteCase } from "./controls-fixtures";

const run = () => controlsChild("agency");
const scopedOnly = (r: RouteCase, name: string) => {
  assert.equal(r.status, 200, `${name} answered ${r.status}`);
  assert.ok(r.calls.length > 0, `${name} never reached the backend`);
  const stray = r.calls.filter(c => !c.agency || !c.scoped);
  assert.deepEqual(stray, [], `${name} reached the backend outside the agency-scoped transport`);
};

test("CH-B: a chat agency engine-status read reaches the backend only scoped", () => scopedOnly(run()["engine-status"], "engine-status"));
test("CH-B: a chat agency engine catalogue read reaches the backend only scoped", () => scopedOnly(run().catalogue, "catalogue"));
test("CH-B: a chat agency engine unresolved read reaches the backend only scoped", () => scopedOnly(run().unresolved, "unresolved"));
test("CH-B: a chat agency request action reaches the backend only scoped", () => scopedOnly(run().requests, "requests"));
