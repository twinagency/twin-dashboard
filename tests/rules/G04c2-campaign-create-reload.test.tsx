// RULE G04c2 (G04b finding F2): components/onlyfans-preview/CampaignManager.tsx create, a fan-visible send to every recipient. The held
// create lived in a module Map (G04 finding 7) and its requestKey was crypto.randomUUID(), so after an unconfirmed create a full reload
// left the form open and the operator had to rebuild the campaign by hand: any difference was a new requestKey and every fan could get
// it twice. The pending write (the exact create or change) and its key now live in one entry of the G04a sessionStorage store
// (lib/onlyfans/plan-c-client.ts heldKeyStore), named by operator scope and account, so a reload restores the held write as the only
// action: "Retry same request" with the exact payload, the form locked. Hold rule (G02a): after an unconfirmed outcome only a recorded
// ack releases it; a refusal of a retry does not, so the form stays locked.
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

/** A page load of the campaign manager for `operatorScope`, every create POST answered by `create`. `body` seeds the draft (first load only). */
async function load(operatorScope: string, accountId: string, create: (call: Call) => Response | Promise<Response>, body?: string) {
  serve((call: Call) => {
    if (call.method === "POST") return create(call);
    if (call.url.includes("/workspace/content")) return json({ workspace: { schemaVersion: "of-workspace.v2", section: "content", accountId, asOf: "2026-11-01T10:00:00.000Z",
      lastCompleteSyncAt: null, historyRecoveryRequired: false, providerConnectionVerified: true, nextCursor: null, items: [] } });
    if (call.url.includes("/conversations")) return json({ page: { items: [], nextCursor: null } });
    return json({ schemaVersion: CAMPAIGN_SCHEMA, ok: true, accountId, campaigns: [], truncated: false });
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
  await load("op-b", "of-r-inpage", () => ack("of-r-inpage"));
  assert.ok(!locked() && !retryButton(), "the in-page held write is shared across operators on one account");
  await load("op-a", "of-r-inpage", () => ack("of-r-inpage"));
  await click(retryButton());
  assert.deepEqual(posts().map(bodyOf), [sent], "control: the remount for the same operator restores the exact write");
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
