// RULE G04c3h campaign-hold (regression guard; REVIEW.md inv 7: a STOP is never harder than a go, unknown-delivery holds win). Promoted
// from batch rwl 1 (/tmp/rwl-batch1/FINDINGS.md) items B3 and B2 (UI) on #400 (G04c2), proven red at d504d672.
//   B3 components/onlyfans-preview/CampaignManager.tsx: a held, unconfirmed create locked the compose form but left Resume live on a
//      paused campaign, so recipients could start going out while the create's outcome was unknown. Resume now waits for the held create;
//      Pause and Cancel remaining stay live (G04c2 #12).
//   B2 a held create older than a day was dropped on reload (plan-c-client.ts expiry), so the form reopened and a rebuilt campaign got a
//      fresh requestKey. Now it stays the only action, labelled "Held, needs review", with its exact request as the retry.
// Offline: jsdom, global fetch stubbed (https://fixture.invalid), real CampaignManager. A reload is reloadPage(): unmount, drop product
// modules, keep sessionStorage.
//   node --import tsx --test tests/rules/G04c3h-campaign-hold.test.tsx
import { bodyOf, calls, click, close, dom, json, lostReply, mount, q, reloadPage, serve, submit, type Call } from "../helpers/w3-preview1-dom";
import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import { createRequire } from "node:module";
import React from "react";
import { CAMPAIGN_SCHEMA } from "../../lib/onlyfans/campaigns";

const require = createRequire(import.meta.url);
after(close);
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: dom.window.sessionStorage });
beforeEach(() => dom.window.sessionStorage.clear());

const SENDER = { creatorName: "Fixture Creator", handle: "fixture" };
const PAUSED = "0a1b2c3d-1111-4222-8333-444455556688";
const paused = (accountId: string) => ({ campaignId: PAUSED, accountId, name: "Paused note", body: "Hi", audience: { kind: "all_known", count: 0, snapshotHash: "a".repeat(64) },
  scheduledAt: "2026-11-01T10:00:00.000Z", createdAt: "2026-11-01T10:00:00.000Z", updatedAt: "2026-11-01T10:00:00.000Z", status: "paused", revision: 5,
  counts: { pending: 0, queued: 0, dispatching: 0, accepted: 0, notAccepted: 0, unknown: 0, cancelled: 0, refused: 0, skipped: 0 }, recipientCount: 0,
  deliveryMode: "individual_messages", offer: null, reporting: { replies: null, replyWindowHours: 24, purchases: null, refundedPurchases: null, revenueCents: null,
    currency: null, ledgerAsOf: null, revenueStatus: "detail_required" } });
const ack = (accountId: string) => json({ schemaVersion: CAMPAIGN_SCHEMA, ok: true, commandKey: "c".repeat(64), accountId, campaignId: "0a1b2c3d-1111-4222-8333-444455556699", recordedRevision: 1 });

async function load(accountId: string, create: (call: Call) => Response | Promise<Response>, body?: string) {
  serve((call: Call) => {
    if (call.method === "POST") return create(call);
    if (call.url.includes(`/campaigns/${PAUSED}`)) return json({ schemaVersion: CAMPAIGN_SCHEMA, ok: true, accountId, campaign: paused(accountId), recipients: [] });
    if (call.url.includes("/workspace/content")) return json({ workspace: { schemaVersion: "of-workspace.v2", section: "content", accountId, asOf: "2026-11-01T10:00:00.000Z",
      lastCompleteSyncAt: null, historyRecoveryRequired: false, providerConnectionVerified: true, nextCursor: null, items: [] } });
    if (call.url.includes("/conversations")) return json({ page: { items: [], nextCursor: null } });
    return json({ schemaVersion: CAMPAIGN_SCHEMA, ok: true, accountId, campaigns: [paused(accountId)], truncated: false });
  });
  if (body !== undefined) {
    const { EMPTY_DRAFT, rememberDraft } = require("../../lib/onlyfans/campaign-audience");
    rememberDraft(accountId, { ...EMPTY_DRAFT, name: "Spring note", body, audienceKind: "all_known" });
  }
  const { default: CampaignManager } = require("../../components/onlyfans-preview/CampaignManager");
  await mount(<CampaignManager accountId={accountId} sender={SENDER} operatorScope="op-g04c3h" />, "/onlyfans/campaigns");
}
const posts = () => calls.filter(call => call.method === "POST");
const notice = () => q("[data-of-campaign-notice]")?.textContent ?? "";
const retryButton = () => [...document.querySelectorAll<HTMLButtonElement>("[data-of-campaign-notice] button")].find(b => /Retry same request/.test(b.textContent ?? "")) ?? null;
const locked = () => q<HTMLFieldSetElement>("[data-of-campaign-manager] fieldset")!.disabled;
const action = (label: RegExp) => [...document.querySelectorAll<HTMLButtonElement>("[data-of-campaign-detail] button")].find(b => label.test(b.textContent ?? "")) ?? null;
const openPaused = () => click([...document.querySelectorAll<HTMLButtonElement>("button")].find(b => /Paused note/.test(b.textContent ?? "")) ?? null);
const held = () => Object.keys(dom.window.sessionStorage).filter(name => name.startsWith("of-campaign-keys:op-g04c3h:"));

test("B3: a held create holds Resume on a paused campaign; Cancel remaining stays live; the ack lifts the hold", async () => {
  await load("of-h-resume", lostReply, "Hello there");
  await submit(q("[data-of-campaign-manager] form"));
  await reloadPage();
  await load("of-h-resume", () => ack("of-h-resume"));
  assert.ok(locked() && retryButton(), "control: the held create is restored and locks the create form");
  await openPaused();
  assert.ok(action(/^Resume$/), "control: a paused campaign offers Resume");
  assert.equal(action(/^Resume$/)!.disabled, true, "Resume is live while a create is held and unconfirmed");
  assert.equal(action(/^Cancel remaining$/)?.disabled, false, "a held create disabled the Cancel remaining brake");
  await click(retryButton());
  assert.equal(posts().length, 1, "control: the retry reached the route");
  await openPaused(); // the ack selects the created campaign
  assert.equal(action(/^Resume$/)?.disabled, false, "a recorded ack of the held create did not release Resume");
});

test("B2: a held create older than a day survives a reload as the only action, labelled held, needs review, with its exact retry", async () => {
  await load("of-h-day", lostReply, "Hello there");
  await submit(q("[data-of-campaign-manager] form"));
  const [sent] = posts().map(bodyOf);
  await reloadPage();
  const [name] = held();
  assert.ok(name, "control: the held create is in storage");
  const entries = JSON.parse(dom.window.sessionStorage.getItem(name)!) as Record<string, unknown[]>;
  for (const entry of Object.values(entries)) entry[1] = Date.now() - 25 * 3600_000;
  dom.window.sessionStorage.setItem(name, JSON.stringify(entries));
  await load("of-h-day", () => ack("of-h-day"));
  assert.ok(locked() && retryButton(), "a day-old held create was dropped: the form reopened and a rebuilt create would get a fresh key");
  assert.match(notice(), /Held, needs review/, "the day-old hold is not shown as held, needs review");
  await click(retryButton());
  assert.deepEqual(posts().map(bodyOf), [sent], "the day-old hold's retry was not the exact create");
  assert.equal(locked(), false, "control: the ack releases it");
  assert.deepEqual(held(), [], "the acked create stayed in storage");
});
