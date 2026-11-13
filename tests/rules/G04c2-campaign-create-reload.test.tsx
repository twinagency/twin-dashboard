// RULE G04c2 (G04b finding F2): components/onlyfans-preview/CampaignManager.tsx create, a fan-visible send to every recipient. The held
// create lived in a module Map (G04 finding 7) and its requestKey was crypto.randomUUID(), so after an unconfirmed create a full reload
// left the form open and the operator had to rebuild the campaign by hand: any difference was a new requestKey and every fan could get
// it twice. The pending create and its key now live in one entry of the G04a sessionStorage store
// (lib/onlyfans/plan-c-client.ts heldKeyStore), named by operator scope and account, so a reload restores the held write as the only
// action: "Retry same request" with the exact payload, the create form locked (never the brakes, #12). Hold rule (G02a): after an
// unconfirmed outcome only a recorded ack releases it; a refusal of a retry does not (the campaign routes forward no refusal code, #11),
// so the form stays locked. A session loss forgets it (#14): the guarantee survives a reload, not a re-sign-in.
// Offline: jsdom, global fetch stubbed (https://fixture.invalid), real CampaignManager. A reload is reloadPage(): unmount and drop every
// product module (the in-memory draft goes with it, and is never seeded again after a reload here), keep sessionStorage.
import { bodyOf, calls, click, close, dom, json, lostReply, mount, q, reloadPage, routeFailure, serve, submit, type Answer, type Call } from "../helpers/w3-preview1-dom";
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
const ack = (accountId: string) => json({ schemaVersion: CAMPAIGN_SCHEMA, ok: true, commandKey: "c".repeat(64), accountId, campaignId: "0a1b2c3d-1111-4222-8333-444455556699", recordedRevision: 1 });
const refused = () => routeFailure(409, "refused", { schemaVersion: CAMPAIGN_SCHEMA });
const UNCONFIRMED: Array<[string, Answer]> = [
  ["bare 503", () => new Response(null, { status: 503 })],
  ["503 labelled unconfirmed", () => routeFailure(503, "unconfirmed", { schemaVersion: CAMPAIGN_SCHEMA })],
  ["bare 500", () => new Response(null, { status: 500 })],
  ["unparseable 502", () => new Response("<html>bad gateway</html>", { status: 502 })],
  ["network error", lostReply],
];

const RUNNING = "0a1b2c3d-1111-4222-8333-444455556677";
/** A running campaign with no recipients yet, so its brakes (Pause, Cancel remaining) are offered. */
const running = (accountId: string) => ({ campaignId: RUNNING, accountId, name: "Live note", body: "Hi", audience: { kind: "all_known", count: 0, snapshotHash: "a".repeat(64) },
  scheduledAt: "2026-11-01T10:00:00.000Z", createdAt: "2026-11-01T10:00:00.000Z", updatedAt: "2026-11-01T10:00:00.000Z", status: "running", revision: 3,
  counts: { pending: 0, queued: 0, dispatching: 0, accepted: 0, notAccepted: 0, unknown: 0, cancelled: 0, refused: 0, skipped: 0 }, recipientCount: 0,
  deliveryMode: "individual_messages", offer: null, reporting: { replies: null, replyWindowHours: 24, purchases: null, refundedPurchases: null, revenueCents: null,
    currency: null, ledgerAsOf: null, revenueStatus: "detail_required" } });
const changeAck = (call: Call, accountId: string) => json({ schemaVersion: CAMPAIGN_SCHEMA, ok: true, commandKey: "d".repeat(64), accountId, campaignId: RUNNING,
  action: bodyOf(call).action, recordedRevision: Number(bodyOf(call).expectedRevision) + 1 });

/** A page load of the campaign manager for `operatorScope`, every create POST answered by `create`. `body` seeds the draft (first load only). */
async function load(operatorScope: string, accountId: string, create: (call: Call) => Response | Promise<Response>, body?: string, change?: (call: Call) => Response | Promise<Response>) {
  serve((call: Call) => {
    if (call.method === "POST") return call.url.includes(RUNNING) && change ? change(call) : create(call);
    if (change && call.url.includes(`/campaigns/${RUNNING}`)) return json({ schemaVersion: CAMPAIGN_SCHEMA, ok: true, accountId, campaign: running(accountId), recipients: [] });
    if (call.url.includes("/workspace/content")) return json({ workspace: { schemaVersion: "of-workspace.v2", section: "content", accountId, asOf: "2026-11-01T10:00:00.000Z",
      lastCompleteSyncAt: null, historyRecoveryRequired: false, providerConnectionVerified: true, nextCursor: null, items: [] } });
    if (call.url.includes("/conversations")) return json({ page: { items: [], nextCursor: null } });
    return json({ schemaVersion: CAMPAIGN_SCHEMA, ok: true, accountId, campaigns: change ? [running(accountId)] : [], truncated: false });
  });
  if (body !== undefined) {
    const { EMPTY_DRAFT, rememberDraft } = require("../../lib/onlyfans/campaign-audience");
    rememberDraft(accountId, { ...EMPTY_DRAFT, name: "Spring note", body, audienceKind: "all_known" });
  }
  const { default: CampaignManager } = require("../../components/onlyfans-preview/CampaignManager");
  await mount(<CampaignManager accountId={accountId} sender={SENDER} operatorScope={operatorScope} />, "/onlyfans/campaigns");
}
const queue = () => submit(q("[data-of-campaign-manager] form"));
const posts = () => calls.filter(call => call.method === "POST");
const keys = () => posts().map(call => String(bodyOf(call).requestKey));
const notice = () => q("[data-of-campaign-notice]")?.textContent ?? "";
const retryButton = () => [...document.querySelectorAll<HTMLButtonElement>("[data-of-campaign-notice] button")].find(b => /Retry same request/.test(b.textContent ?? "")) ?? null;
const locked = () => q<HTMLFieldSetElement>("[data-of-campaign-manager] fieldset")!.disabled;
const brake = (label: RegExp) => [...document.querySelectorAll<HTMLButtonElement>("[data-of-campaign-detail] button")].find(b => label.test(b.textContent ?? "")) ?? null;
const openRunning = () => click([...document.querySelectorAll<HTMLButtonElement>("button")].find(b => /Live note/.test(b.textContent ?? "")) ?? null);
const stored = () => Object.keys(dom.window.sessionStorage).length;

test("G04c2: after an unconfirmed create, a full reload restores the held create as the only action, and its retry is the exact request", async () => {
  for (const [label, first] of UNCONFIRMED) {
    const account = `of-r-${label.replace(/\W/g, "")}`;
    await load("op-a", account, first, "Hello there");
    await queue();
    assert.match(notice(), /outcome is not confirmed/, label);
    const [sent] = posts().map(bodyOf);
    await reloadPage();
    await load("op-a", account, () => ack(account));
    assert.match(notice(), /outcome is not confirmed/, `${label}: the reload dropped the held create`);
    assert.ok(locked(), `${label}: the form is open while a create is held`);
    await click(retryButton());
    assert.deepEqual(posts().map(bodyOf), [sent], `${label}: the restored retry did not send the exact create`);
    assert.equal(locked(), false, `${label}: a recorded ack did not unlock the form`);
  }
});

test("G04c2: after a reload a refused retry keeps the form locked while the earlier attempt is unconfirmed", async () => {
  const account = "of-r-ack";
  await load("op-a", account, lostReply, "Hello there");
  await queue();
  const [sent] = posts().map(bodyOf);
  await reloadPage();
  await load("op-a", account, refused);
  await click(retryButton());
  assert.deepEqual(posts().map(bodyOf), [sent]);
  assert.ok(locked() && retryButton(), "a refusal after a reload unlocked the form, though the first attempt may have committed");
  await reloadPage();
  await load("op-a", account, () => ack(account));
  assert.ok(locked() && retryButton(), "a refusal released the held create from storage");
  await click(retryButton());
  assert.deepEqual(posts().map(bodyOf), [sent]);
  assert.equal(dom.window.sessionStorage.length, 0, "the recorded ack left the create in storage");
  await reloadPage();
  await load("op-a", account, () => ack(account), "Hello there");
  assert.equal(locked(), false, "an acknowledged create was restored as held");
  await queue();
  assert.notEqual(keys()[0], sent.requestKey, "after a recorded ack an intentional repeat must be a new campaign");
});

test("G04c2: a first attempt refused outright is not held: the reload leaves the form open and a changed campaign gets a new key", async () => {
  await load("op-a", "of-r-change", refused, "Hello there");
  await queue();
  const [first] = keys();
  await reloadPage();
  await load("op-a", "of-r-change", () => ack("of-r-change"), "Hello there, edited");
  assert.equal(locked(), false);
  await queue();
  assert.equal(keys().length, 1);
  assert.notEqual(keys()[0], first, "a different campaign reused the requestKey");
});

test("G04c2: the held create comes from storage: with the entry deleted, the reload restores nothing", async () => {
  await load("op-a", "of-r-control", lostReply, "Hello there");
  await queue();
  await reloadPage();
  dom.window.sessionStorage.clear();
  await load("op-a", "of-r-control", () => ack("of-r-control"));
  assert.doesNotMatch(notice(), /outcome is not confirmed/, "the reload kept in-page state: the held create was not read from storage");
  assert.equal(retryButton(), null);
});

test("G04c2 #2: without a reload, a remount for another operator scope does not see this operator's held write; this operator does", async () => {
  await load("op-a", "of-r-inpage", lostReply, "Hello there");
  await queue();
  const [sent] = posts().map(bodyOf);
  await load("op-a", "of-r-inpage", () => ack("of-r-inpage"));
  await click(retryButton());
  assert.deepEqual(posts().map(bodyOf), [sent], "control: the remount for the same operator restores the exact write");
  await load("op-a", "of-r-inpage", lostReply, "Hello there");
  await queue();
  await load("op-b", "of-r-inpage", () => ack("of-r-inpage"));
  assert.ok(!locked() && !retryButton(), "the in-page held write is shared across operators on one account");
  // G04c3h B5: another scope on this tab is another sign-in, so op-a's held write (and its campaign text) is forgotten, not kept.
  await load("op-a", "of-r-inpage", () => ack("of-r-inpage"));
  assert.ok(!locked() && !retryButton(), "the signed-out scope's held write outlived another scope's sign-in");
});

test("G04c2: another operator scope or another account sees no held create and never reuses the key", async () => {
  await load("op-a", "of-r-scope", lostReply, "Hello there");
  await queue();
  const [held] = keys();
  assert.equal(dom.window.sessionStorage.length, 1, "the held create was not persisted");
  assert.match(dom.window.sessionStorage.key(0)!, /op-a.*of-r-scope/, "the storage name carries the operator scope and the account");
  await reloadPage();
  await load("op-b", "of-r-scope", () => ack("of-r-scope"), "Hello there");
  assert.ok(!locked() && !retryButton(), "another operator was offered this operator's held create");
  await queue();
  assert.notEqual(keys()[0], held, "another operator reused this operator's held key");
  await reloadPage();
  await load("op-a", "of-r-scope-2", () => ack("of-r-scope-2"), "Hello there");
  assert.ok(!locked() && !retryButton(), "another account was offered the held create");
  await queue();
  assert.notEqual(keys()[0], held, "another account reused the held key");
});

test("G04c2 #12: a held create never disables the campaign brakes: Pause and Cancel remaining stay usable, and the held create stays offered", async () => {
  await load("op-a", "of-r-brake", lostReply, "Hello there", call => changeAck(call, "of-r-brake"));
  await queue();
  await reloadPage();
  await load("op-a", "of-r-brake", () => ack("of-r-brake"), undefined, call => changeAck(call, "of-r-brake"));
  assert.ok(locked() && retryButton(), "control: the held create is restored and locks the create form");
  await openRunning();
  assert.ok(brake(/^Pause$/) && !brake(/^Pause$/)!.disabled, "a held create disabled Pause on a running campaign");
  assert.ok(brake(/^Cancel remaining$/) && !brake(/^Cancel remaining$/)!.disabled, "a held create disabled Cancel remaining");
  await click(brake(/^Pause$/));
  assert.deepEqual(posts().map(bodyOf), [{ action: "pause", expectedRevision: 3 }], "the brake did not reach the route");
  assert.ok(locked() && retryButton(), "#15: an acknowledged pause dropped the held create from the retry slot");
});

test("G04c2 #13: a campaign change is never held in storage; its idempotency is its expectedRevision, and a refusal releases it", async () => {
  await load("op-a", "of-r-change2", () => ack("of-r-change2"), undefined, lostReply);
  await openRunning();
  await click(brake(/^Pause$/));
  assert.match(notice(), /outcome is not confirmed/, "control: the pause outcome is unknown");
  assert.equal(stored(), 0, "a campaign change was written to storage, though it sends no requestKey");
  await reloadPage();
  await load("op-a", "of-r-change2", () => ack("of-r-change2"), undefined, refused);
  assert.ok(!locked() && !retryButton(), "a reload restored a held change");
});

test("G04c2 #14: a session loss (401) forgets this scope's held create, in storage too: the key could not dedupe under a new sign-in", async () => {
  await load("op-a", "of-r-401", lostReply, "Hello there");
  await queue();
  assert.equal(stored(), 1, "control: the held create is in storage");
  // codex final: a session loss forgets every held-write kind of the scope, so this operator's held manual send text goes too.
  const sendName = dom.window.sessionStorage.key(0)!.replace("of-campaign-keys", "of-send-keys");
  assert.notEqual(sendName, dom.window.sessionStorage.key(0), "control: the storage name carries the kind");
  dom.window.sessionStorage.setItem(sendName, "[]");
  await reloadPage();
  await load("op-a", "of-r-401", () => new Response(null, { status: 401 }));
  await click(retryButton());
  assert.equal(posts().length, 1, "control: the retry reached the route");
  assert.equal(stored(), 0, "the session loss left a held write (and its message text) in storage");
  await reloadPage();
  await load("op-a", "of-r-401", () => ack("of-r-401"));
  assert.ok(!locked() && !retryButton(), "a held create from before the session loss was restored");
});

test("G04c2 #19: a 403 (read-only, team permission, origin) is not a session loss: the held create stays in storage and is offered again", async () => {
  await load("op-a", "of-r-403", lostReply, "Hello there");
  await queue();
  const [sent] = posts().map(bodyOf);
  await reloadPage();
  await load("op-a", "of-r-403", () => new Response(null, { status: 403 }));
  await click(retryButton());
  assert.equal(posts().length, 1, "control: the retry reached the route");
  assert.equal(stored(), 1, "a 403 forgot the held create, though it proves nothing about the earlier attempt");
  await reloadPage();
  await load("op-a", "of-r-403", () => ack("of-r-403"));
  assert.ok(locked() && retryButton(), "a 403 dropped the held create's retry");
  await click(retryButton());
  assert.deepEqual(posts().map(bodyOf), [sent], "the retry after a 403 was not the exact create");
});
