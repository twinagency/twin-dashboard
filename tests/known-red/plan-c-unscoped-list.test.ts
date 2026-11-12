/**
 * KNOWN RED (W1 lane 1 finding 11; REVIEW.md invariant 7 "Isolation"; E-APPLY class, RISKS R15).
 * lib/onlyfans/plan-c.ts:155 (drafts) and :184 (unresolved) accept a list whose `accountId` is missing; the drafts list then shows
 * whatever receipts it carries (:160-173) with nothing tying them to the account. Measured: both lists without accountId parse.
 * Turns green when both parsers require `value.accountId === accountId` (null otherwise).
 * Team's Claude owns the fix. Not wired into npm scripts.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { parsePlanCDrafts, parsePlanCUnresolved } from "../../lib/onlyfans/plan-c";
import { MOCK_ACCOUNT, draftList, unresolvedItem, unresolvedList } from "../rules/plan-c-fixtures";

const receipt = { intentId: "00000000-0000-4000-8000-000000000001", fanId: "101", messageId: "7001", acceptedAt: "2026-11-07T10:00:00Z", action: "reply", projected: true };
const withoutAccount = <T extends { accountId: string }>(list: T) => { const { accountId: _dropped, ...rest } = list; return rest; };

test("control: scoped draft and unresolved lists parse, receipts included", () => {
  assert.equal(parsePlanCDrafts(draftList([], { receipts: [receipt] }), MOCK_ACCOUNT)?.receipts?.length, 1);
  assert.equal(parsePlanCUnresolved(unresolvedList([unresolvedItem()]), MOCK_ACCOUNT)?.items.length, 1);
});

test("finding 11: a draft list without accountId is refused together with its receipts", () => {
  assert.equal(parsePlanCDrafts(withoutAccount(draftList([], { receipts: [receipt] })), MOCK_ACCOUNT), null);
});

test("finding 11: an unresolved list without accountId is refused", () => {
  assert.equal(parsePlanCUnresolved(withoutAccount(unresolvedList([unresolvedItem()])), MOCK_ACCOUNT), null);
});
