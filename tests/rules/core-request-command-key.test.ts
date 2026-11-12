/**
 * Characterization (W1 lane 4 CH3; REVIEW.md invariant 7 "No send, no auto-retry": an idempotency key a user retry reuses, and
 * "Isolation": the same ids in two accounts share nothing). The requests route
 * app/api/onlyfans-controls/accounts/[accountId]/conversations/[conversationId]/requests/[requestId]/route.ts:39 hashes
 * actor, account, conversation, request, action, expectedRevision and note into the commandKey. Driven end to end through
 * tests/rules/core-route.child.ts (see its header for what is replaced); the key is read off the backend POST body.
 * Not covered here: the internal-operator actor is the session-token hash (F10, re-login changes the key) and environment.
 * Mutation-proven: dropping `accountId` from the hash array turns this red (tests/rules/mutations/W1-lib-onlyfans-core/6-*).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { coreRouteChild } from "./core-fixtures";

const run = () => coreRouteChild("keys");

test("CH3: the same chat-only session sending the identical body twice reaches the backend with one identical commandKey", () => {
  const r = run();
  assert.equal(r.base.posts, 1);
  assert.match(r.base.commandKey ?? "", /^[a-f0-9]{64}$/);
  assert.equal(r["base again"].commandKey, r.base.commandKey);
});

test("CH3: changing the account, conversation, request, action, expectedRevision or note changes the commandKey", () => {
  const r = run();
  const variants = ["account of-b", "conversation", "request", "action", "revision", "note"] as const;
  for (const name of variants) {
    assert.equal(r[name].posts, 1, `${name} reached the backend`);
    assert.notEqual(r[name].commandKey, r.base.commandKey, `${name} reused the base commandKey`);
  }
  assert.equal(new Set(variants.map(name => r[name].commandKey)).size, variants.length, "two variants share a commandKey");
});
