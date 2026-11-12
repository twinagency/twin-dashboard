// KNOWN RED (W3 ui-onlyfans-preview-1, findings F13 F14 in docs/review/W3/ui-onlyfans-preview-1.md). Team's Claude owns the fixes.
// F13 components/onlyfans-preview/AccountsView.tsx:59: the account card's inline sync-health renderer drops `state` and prints
//     `lastSuccessAt ?? observedAt` as a bare Brisbane time, so a FAILED area reads like a successful sync, while CreatorHub on the
//     same page renders the same entry through syncArea (lib/onlyfans/creator-hub.ts:40-51) and says "Failed".
// F14 AccountsView.tsx:160-163,192-195: `needsAttention` counts `syncFreshness.stale`, so an account whose only problem is stale
//     history is a "Connection issue" and again a "History freshness issue".
// Not wired into npm scripts; init.sh does not run it yet (shared file; wiring decided at window close). Offline: jsdom, no fetch at all expected (any request fails the test), real AccountsView + Next contexts (creator scope via ?creator=).
import { calls, close, mount, q, serve } from "../helpers/w3-preview1-dom";
import assert from "node:assert/strict";
import test, { after } from "node:test";
import React from "react";
import { accounts } from "../../lib/onlyfans-preview/fixtures";
import type { OfAccount } from "../../lib/onlyfans-preview/types";

after(close);
const base = accounts[0];
const account = (patch: Partial<OfAccount>, id = base.accountId): OfAccount => ({ ...base, accountId: id, health: "connected", healthReason: null, needsAttention: false,
  syncFreshness: { ...base.syncFreshness, stale: false }, ...patch });
async function render(list: OfAccount[]) {
  serve(call => { throw new Error(`unexpected request ${call.method} ${call.url}`); });
  const { default: AccountsView } = await import("../../components/onlyfans-preview/AccountsView");
  await mount(<AccountsView accountsState={{ status: "ready", data: list }} activeAccountId={null} onSelectAccount={() => {}} readOnly={false}
    creatorName={null} sourceLabel="Fixture" showPreviewChrome={false} />, `/onlyfans/accounts?creator=${base.binding.creatorId}`);
  assert.equal(calls.length, 0, "rendering makes no request");
}
const surface = () => q('[data-of-surface="onlyfans-accounts"]');
/** A page-level stat: the one element outside every account card and the CreatorHub whose whole text is `label`; its value is the next element. */
const stat = (label: string) => {
  const found = [...(surface()?.querySelectorAll("*") ?? [])].filter(element => element.textContent === label && element.children.length === 0
    && !element.closest("[data-of-account-id], [data-of-creator-hub]"));
  assert.equal(found.length, 1, `exactly one "${label}" stat`);
  return found[0].nextElementSibling?.textContent ?? null;
};
const card = (accountId: string) => q(`[data-of-account-id="${accountId}"]`);
const FAILED_AT = "2026-10-17T08:00:00.000Z";
/** The card's current rendering of a time: Brisbane wall clock + " AEST" (AccountsView.tsx:59). */
const AEST = new Date(FAILED_AT).toLocaleString("en-AU", { timeZone: "Australia/Brisbane" });
const failed = account({ syncHealth: { messages: { state: "failed", lastSuccessAt: null, observedAt: FAILED_AT, reason: null } } });

test("control: the page's CreatorHub shows the failed message-history state; the card renders the sync-health entry", async () => {
  await render([failed]);
  const hub = q(`[data-of-creator-hub="${base.binding.creatorId}"]`)?.textContent ?? "";
  assert.match(hub, /Message history/);
  assert.match(hub, /Failed/, "CreatorHub renders the state through syncArea");
  const withEntry = card(base.accountId)?.textContent ?? "";
  await render([account({ syncHealth: {} })]);
  assert.notEqual(card(base.accountId)?.textContent, withEntry, "the card renders something for the sync-health entry");
});

test("control: a connected, fresh account counts in neither issue stat; a disconnected one is one connection issue", async () => {
  await render([account({}), account({ health: "expired_session" }, "of-acc-second-002")]);
  assert.equal(stat("Accounts"), "2");
  assert.equal(stat("Connection issues"), "1");
  assert.equal(stat("History freshness issues"), "0");
});

test("F13: the account card shows a failed sync area as failed, not as a bare time", async () => {
  await render([failed]);
  const subtree = card(base.accountId);
  assert.ok(subtree, "card rendered");
  assert.match(subtree.textContent ?? "", /failed/i, "the card must carry the area's state like CreatorHub does");
  // Any element showing observedAt as a wall-clock time must sit in a row that also says failed.
  for (const element of subtree.querySelectorAll("*")) {
    if (element.children.length || !(element.textContent ?? "").includes(AEST)) continue;
    const row = element.closest("li, tr, dl > div") ?? element.parentElement;
    assert.match(row?.textContent ?? "", /failed/i, "observedAt of a failed area must not read as a bare AEST success time");
  }
});

test("F14: an account whose only problem is stale history is counted once", async () => {
  await render([account({ syncFreshness: { ...base.syncFreshness, stale: true } })]);
  assert.equal(stat("History freshness issues"), "1");
  assert.equal(stat("Connection issues"), "0", "stale history is not also a connection issue");
});
