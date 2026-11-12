/**
 * Characterization (W1 lane 5 CH-D; REVIEW.md invariant 6: backend detail never reaches the browser). The fake backend answers
 * 500, 401, 403, 404 and 409 with the sentinel UPSTREAM-SENTINEL-7f3 in its JSON body, in a response header and in its statusText.
 * None of the in-scope routes lets it through: the three engine reads (lib/onlyfans/engine-status-backend.ts:28-35 fixed strings),
 * the request action (lib/onlyfans/engine-operator.ts:36-47 fixed strings), and one Plan C read (drafts GET) and write
 * (conversation stop POST) via lib/onlyfans/plan-c-backend.ts:28-61. Each case also proves the upstream answer was consulted
 * (`reached`). Status line, headers and body of every route response are searched. Internal operator + named owner, driven
 * through tests/rules/controls-route.child.ts (see its header). Statuses and routes are the typed tuples in controls-fixtures.ts.
 * Not duplicated: lane 1 pins Plan C refusal text per status (plan-c-404-conflict-text known-red), not the absence of upstream text.
 * Mutation-proven (one per test): d-1 makes the engine read backend return `error: await response.text()` on any non-OK (only
 * the engine reads test red); d-2 makes engine-operator.ts return the upstream text as the refusal error (only the request action
 * test red); d-3 makes plan-c-backend.ts read() return the upstream text on 404 (only the Plan C test red).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { ENGINE_READS, UPSTREAM_STATUSES, controlsChild, type UpstreamRoute } from "./controls-fixtures";

const run = () => controlsChild("upstream");
const clean = (routes: readonly UpstreamRoute[]) => {
  for (const code of UPSTREAM_STATUSES) for (const route of routes) {
    const r = run()[code][route];
    assert.equal(r.reached, true, `${route} ${code} never consulted the backend`);
    assert.equal(r.leaked, false, `${route} answered ${r.status} with upstream text for an upstream ${code}`);
  }
};

test("CH-D: engine-status, catalogue and unresolved reads never return upstream error text", () => clean(ENGINE_READS));
test("CH-D: the request action never returns upstream error text", () => clean(["requests"]));
test("CH-D: a Plan C read and a Plan C write never return upstream error text", () => clean(["plan-c drafts", "plan-c conversation"]));
