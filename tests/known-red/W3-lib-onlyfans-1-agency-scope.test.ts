/**
 * Known-red, lane W3-lib-onlyfans-1 (agency scope default-deny + account binding).
 * lib/onlyfans/agency-scope.ts:57,65: the purpose rule `(?:\/.*)?` admits ANY nested route under
 *   /api/onlyfans-{controls,configuration,content,campaigns}/accounts/<id>, GET for every agency user and POST for
 *   managers. REVIEW inv 7: anything unlisted is denied; the file's own comment (:58-59) says future endpoints stay
 *   default-deny. Today each route rechecks (measured by reading); the next route added inherits agency access.
 * agency-scope.ts:55: `acc-a//plan-c/drafts` skips the Plan C exclusion ([^/]+ needs one char) and the wildcard admits it.
 * lib/onlyfans/ai-visibility.ts:9-18: effectiveAiStatus reads account B's runtime for account A's conversation.
 * Fixed looks like: explicit route+method table; refuse empty segments; mismatched account -> a runtime-unavailable label (any wording with "unavailable").
 */
import test from "node:test";
import assert from "node:assert/strict";
import { agencyOnlyFansRequest } from "../../lib/onlyfans/agency-scope";
import { effectiveAiStatus } from "../../lib/onlyfans/ai-visibility";
import type { ConversationSummary, OfAccount } from "../../lib/onlyfans-preview/types";

test("control: delivered purpose route is admitted for a manager POST", () => {
  assert.equal(agencyOnlyFansRequest("/api/onlyfans-campaigns/accounts/acc-a/campaigns", "POST", false, true), true);
});

test("control: Plan C route is refused for a manager", () => {
  assert.equal(agencyOnlyFansRequest("/api/onlyfans-controls/accounts/acc-a/plan-c/drafts", "GET", false, true, true), false);
});

test("red: an undelivered nested controls route is refused for a manager POST", () => {
  assert.equal(agencyOnlyFansRequest("/api/onlyfans-controls/accounts/acc-a/future-destructive-action", "POST", false, true), false);
});

test("red: an undelivered deep content route is refused for a reader GET", () => {
  assert.equal(agencyOnlyFansRequest("/api/onlyfans-content/accounts/acc-a/x/y/z", "GET", false, false), false);
});

test("red: a double-slash Plan C path is refused", () => {
  assert.equal(agencyOnlyFansRequest("/api/onlyfans-controls/accounts/acc-a//plan-c/drafts", "GET", false, true, true), false);
});

const fresh = () => new Date().toISOString();
const conv = { conversationId: "c1", accountId: "acc-a", revision: 1, automationMode: "automated", takeoverState: "none",
  delivery: "none", historyHeld: false, requiresAttention: false } as unknown as ConversationSummary;
const account = (accountId: string) => ({ accountId, health: "connected",
  runtime: { enabled: true, deliveryEnabled: true, sender: { state: "running", observedAt: fresh(), reason: null } } }) as unknown as OfAccount;

test("control: matching account runtime gives ready", () => {
  assert.equal(effectiveAiStatus(conv, account("acc-a")), "AI enabled for this fan. Ready for new input");
});

test("red: another account's runtime is not used for this conversation", () => {
  const got = effectiveAiStatus(conv, account("acc-b"));
  assert.notEqual(got, "AI enabled for this fan. Ready for new input");
  assert.match(got, /unavailable/i);
});
