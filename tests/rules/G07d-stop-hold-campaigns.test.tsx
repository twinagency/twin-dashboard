// TEST-CHANGE (G07d r1): hold fixtures (seed, clear, malformed value) moved from sessionStorage to localStorage, the store the
//   hold now lives in for cross-tab reach (stop-hold.ts). Same key, same values, no assertion changed.
// RULE G07d stop-hold-campaigns (REVIEW.md inv 7: a STOP is never harder than a go, unknown-delivery holds win). rwl batch 1 B1, campaigns.
//   components/onlyfans-preview/CampaignManager.tsx never read the unconfirmed STOP hold (components/onlyfans-launch/automation/stop-hold.ts),
//   so a campaign create, its held retry and Resume of a paused campaign could start a mass send on an account whose STOP was unknown. All
//   three now wait for the hold; Pause and Cancel remaining stay live. The inbox go paths are G07d-stop-hold-go-paths.
// Offline: jsdom, global fetch stubbed (https://fixture.invalid), real CampaignManager.
//   node --import tsx --test tests/rules/G07d-stop-hold-campaigns.test.tsx
import { bodyOf, calls, click, close, dom, json, lostReply, mount, q, reloadPage, serve, submit, type Call } from "../helpers/w3-preview1-dom";
import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import { createRequire } from "node:module";
import React from "react";
import { CAMPAIGN_SCHEMA } from "../../lib/onlyfans/campaigns";

const require = createRequire(import.meta.url);
after(close);
const real = dom.window.sessionStorage;
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: real });
beforeEach(async () => { await reloadPage(); real.clear(); dom.window.localStorage.clear(); });

const HELD = /held until the emergency stop is confirmed/i;
/** The marker the launch panel writes when a STOP is sent and keeps until it is recorded, refused or read as applied. */
const holdStop = (accountId: string) => dom.window.localStorage.setItem(`b-stop-held:${accountId}`, JSON.stringify({ accountId, since: 1, attempt: 1, carried: false }));
const posts = () => calls.filter(call => call.method === "POST");
const SENDER = { creatorName: "Fixture Creator", handle: "fixture" };
const PAUSED = "0a1b2c3d-1111-4222-8333-444455556688";
const pausedCampaign = (accountId: string) => ({ campaignId: PAUSED, accountId, name: "Paused note", body: "Hi", audience: { kind: "all_known", count: 0, snapshotHash: "a".repeat(64) },
  scheduledAt: "2026-11-01T10:00:00.000Z", createdAt: "2026-11-01T10:00:00.000Z", updatedAt: "2026-11-01T10:00:00.000Z", status: "paused", revision: 5,
  counts: { pending: 0, queued: 0, dispatching: 0, accepted: 0, notAccepted: 0, unknown: 0, cancelled: 0, refused: 0, skipped: 0 }, recipientCount: 0,
  deliveryMode: "individual_messages", offer: null, reporting: { replies: null, replyWindowHours: 24, purchases: null, refundedPurchases: null, revenueCents: null,
    currency: null, ledgerAsOf: null, revenueStatus: "detail_required" } });
const campaignAck = (accountId: string) => json({ schemaVersion: CAMPAIGN_SCHEMA, ok: true, commandKey: "c".repeat(64), accountId, campaignId: "0a1b2c3d-1111-4222-8333-444455556699", recordedRevision: 1 });
async function campaigns(accountId: string, answer: (call: Call) => Response | Promise<Response>) {
  serve((call: Call) => {
    if (call.method === "POST") return answer(call);
    if (call.url.includes(`/campaigns/${PAUSED}`)) return json({ schemaVersion: CAMPAIGN_SCHEMA, ok: true, accountId, campaign: pausedCampaign(accountId), recipients: [] });
    if (call.url.includes("/workspace/content")) return json({ workspace: { schemaVersion: "of-workspace.v2", section: "content", accountId, asOf: "2026-11-01T10:00:00.000Z",
      lastCompleteSyncAt: null, historyRecoveryRequired: false, providerConnectionVerified: true, nextCursor: null, items: [] } });
    if (call.url.includes("/conversations")) return json({ page: { items: [], nextCursor: null } });
    return json({ schemaVersion: CAMPAIGN_SCHEMA, ok: true, accountId, campaigns: [pausedCampaign(accountId)], truncated: false });
  });
  const { EMPTY_DRAFT, rememberDraft } = require("../../lib/onlyfans/campaign-audience");
  rememberDraft(accountId, { ...EMPTY_DRAFT, name: "Spring note", body: "Hello there", audienceKind: "all_known" });
  const { default: CampaignManager } = require("../../components/onlyfans-preview/CampaignManager");
  await mount(<CampaignManager accountId={accountId} sender={SENDER} operatorScope="op-g07d-c" />, "/onlyfans/campaigns");
}
const createButton = () => q<HTMLButtonElement>("[data-of-create-campaign]");
const notice = () => q("[data-of-campaign-notice]")?.textContent ?? "";
const detailAction = (label: RegExp) => [...document.querySelectorAll<HTMLButtonElement>("[data-of-campaign-detail] button")].find(b => label.test(b.textContent ?? "")) ?? null;
const openPaused = () => click([...document.querySelectorAll<HTMLButtonElement>("button")].find(b => /Paused note/.test(b.textContent ?? "")) ?? null);
const retryButton = () => [...document.querySelectorAll<HTMLButtonElement>("[data-of-campaign-notice] button")].find(b => /Retry same request/.test(b.textContent ?? "")) ?? null;

test("B1 campaigns: an unconfirmed STOP holds create and Resume; Cancel remaining stays live", async () => {
  await campaigns("of-g07d-c0", () => campaignAck("of-g07d-c0"));
  assert.equal(createButton()?.disabled, false, "control: create is live with no STOP hold");
  await reloadPage();
  holdStop("of-g07d-c1");
  await campaigns("of-g07d-c1", () => campaignAck("of-g07d-c1"));
  assert.equal(createButton()?.disabled, true, "campaign create is live while the account's STOP is unconfirmed");
  await submit(q("[data-of-campaign-manager] form"));
  assert.equal(posts().length, 0, "a campaign create went out while the account's STOP is unconfirmed");
  await openPaused();
  assert.equal(detailAction(/^Resume$/)?.disabled, true, "campaign Resume is live while the account's STOP is unconfirmed");
  assert.equal(detailAction(/^Cancel remaining$/)?.disabled, false, "the STOP hold disabled Cancel remaining (a brake)");
  await click(detailAction(/^Cancel remaining$/));
  assert.deepEqual(posts().map(c => bodyOf(c).action), ["cancel"], "control: the brake went out");
});

test("B1 campaigns: the held retry of an unconfirmed create waits for the STOP", async () => {
  await campaigns("of-g07d-c2", lostReply);
  await submit(q("[data-of-campaign-manager] form"));
  assert.ok(Boolean(retryButton()), "control: the unconfirmed create offers its exact retry");
  holdStop("of-g07d-c2");
  await click(retryButton());
  assert.equal(posts().length, 1, "the retry of a create went out while the account's STOP is unconfirmed");
  assert.match(notice(), HELD, "the held retry does not say why");
});
