/**
 * Characterization (W1 lane 4 CH1; REVIEW.md invariant 7 "Isolation": Plan C stays unreachable for agency users).
 * lib/onlyfans/agency-scope.ts:55 denies every Plan C API path and the Plan C page for every agency session before the broad
 * `purpose` rule (:57) can admit it. Complements tests/contracts/plan-c.test.ts:296-305 (GET/POST on five paths): this adds HEAD
 * and PATCH, the encoded-colon conversation id, a deeper draft path and `/stop`, across all four (canManage, canChat) pairs.
 * Deliberately NOT asserted: the `//plan-c` double-slash case (F9, a hazard Next normalizes before middleware, not a hole).
 * Mutation-proven: deleting agency-scope.ts:55 turns this red (tests/rules/mutations/W1-lib-onlyfans-core/4-*).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { agencyOnlyFansRequest } from "../../lib/onlyfans/agency-scope";

const API = "/api/onlyfans-controls/accounts/acc-a/plan-c";
const PATHS = [
  `${API}/drafts`,
  `${API}/drafts/12345678-1234-4234-8234-123456789abc/1/approve`,
  `${API}/unresolved/x/reconcile`,
  `${API}/conversations/acc-a:1/stop`,
  `${API}/conversations/acc-a%3A1/stop`,
  "/onlyfans/plan-c",
];
const METHODS = ["GET", "HEAD", "POST", "PATCH"];
const PAIRS = [[true, true], [true, false], [false, true], [false, false]] as const;

test("CH1: no agency session, manager or chat, reaches any Plan C path by any method", () => {
  for (const [canManage, canChat] of PAIRS)
    for (const path of PATHS)
      for (const method of METHODS)
        assert.equal(agencyOnlyFansRequest(path, method, false, canManage, canChat), false, `${method} ${path} (manage=${canManage}, chat=${canChat})`);
});

test("CH1 sanity: the same account's non-Plan C controls stay reachable, so the deny is not a blanket refusal", () => {
  assert.equal(agencyOnlyFansRequest("/api/onlyfans-controls/accounts/acc-a/settings", "POST", false, true, false), true, "manager purpose POST");
  assert.equal(agencyOnlyFansRequest("/api/onlyfans-controls/accounts/acc-a/conversations/acc-a%3A1", "POST", false, false, true), true, "chat conversation POST");
});
