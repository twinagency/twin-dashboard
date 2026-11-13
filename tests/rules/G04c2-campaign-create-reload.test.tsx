// RULE G04c2 (G04b finding F2): components/onlyfans-preview/CampaignManager.tsx create, a fan-visible send to every recipient. The held
// create lived in a module Map (G04 finding 7) and its requestKey was crypto.randomUUID(), so after an unconfirmed create a full reload
// and the same Queue minted a new requestKey and every fan could get the campaign twice. The key now comes from the G04a sessionStorage
// store (lib/onlyfans/plan-c-client.ts createCommandKeyStore), named by operator scope and account, keyed by the create's payload.
// Hold rule (G02a): after an unconfirmed outcome only a recorded ack releases the key; a refusal of a retry does not.
// Offline: jsdom, global fetch stubbed (https://fixture.invalid), real CampaignManager. A reload is reloadPage(): unmount and drop every
// product module (the held write and the draft go with it), keep sessionStorage.
import { bodyOf, calls, close, dom, json, lostReply, mount, q, reloadPage, routeFailure, serve, submit, type Answer, type Call } from "../helpers/w3-preview1-dom";
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
const UNCONFIRMED: Array<[string, Answer]> = [
  ["bare 503", () => new Response(null, { status: 503 })],
  ["503 labelled unconfirmed", () => routeFailure(503, "unconfirmed", { schemaVersion: CAMPAIGN_SCHEMA })],
  ["bare 500", () => new Response(null, { status: 500 })],
  ["unparseable 502", () => new Response("<html>bad gateway</html>", { status: 502 })],
  ["network error", lostReply],
];

/** A page load of the campaign manager for `operatorScope`, the draft `body` queued, every create POST answered by `create`. */
async function load(operatorScope: string, accountId: string, create: (call: Call) => Response | Promise<Response>, body = "Hello there") {
  serve((call: Call) => {
    if (call.method === "POST") return create(call);
    if (call.url.includes("/workspace/content")) return json({ workspace: { schemaVersion: "of-workspace.v2", section: "content", accountId, asOf: "2026-11-01T10:00:00.000Z",
      lastCompleteSyncAt: null, historyRecoveryRequired: false, providerConnectionVerified: true, nextCursor: null, items: [] } });
    if (call.url.includes("/conversations")) return json({ page: { items: [], nextCursor: null } });
    return json({ schemaVersion: CAMPAIGN_SCHEMA, ok: true, accountId, campaigns: [], truncated: false });
  });
  const { EMPTY_DRAFT, rememberDraft } = require("../../lib/onlyfans/campaign-audience");
  rememberDraft(accountId, { ...EMPTY_DRAFT, name: "Spring note", body, audienceKind: "all_known" });
  const { default: CampaignManager } = require("../../components/onlyfans-preview/CampaignManager");
  await mount(<CampaignManager accountId={accountId} sender={SENDER} operatorScope={operatorScope} />, "/onlyfans/campaigns");
}
const queue = () => submit(q("[data-of-campaign-manager] form"));
const keys = () => calls.filter(call => call.method === "POST").map(call => String(bodyOf(call).requestKey));
const notice = () => q("[data-of-campaign-notice]")?.textContent ?? "";

test("G04c2: after an unconfirmed create, a full reload and the same Queue reuses the requestKey", async () => {
  for (const [label, first] of UNCONFIRMED) {
    const account = `of-r-${label.replace(/\W/g, "")}`;
    await load("op-a", account, first);
    await queue();
    assert.match(notice(), /outcome is not confirmed/, label);
    const [held] = keys();
    await reloadPage();
    await load("op-a", account, () => ack(account));
    assert.doesNotMatch(notice(), /outcome is not confirmed/, `${label}: control, the reload dropped the in-page held write`);
    await queue();
    assert.deepEqual(keys(), [held], `${label}: the Queue after a reload minted a new requestKey`);
  }
});

test("G04c2: a changed campaign after the reload gets a new requestKey", async () => {
  await load("op-a", "of-r-change", lostReply);
  await queue();
  const [held] = keys();
  await reloadPage();
  await load("op-a", "of-r-change", () => ack("of-r-change"), "Hello there, edited");
  await queue();
  assert.equal(keys().length, 1);
  assert.notEqual(keys()[0], held, "a different campaign reused the held requestKey");
});

test("G04c2: a refusal of the retry does not release the held key; a recorded ack does, in storage too", async () => {
  const account = "of-r-ack";
  await load("op-a", account, lostReply);
  await queue();
  const [held] = keys();
  await reloadPage();
  await load("op-a", account, () => routeFailure(409, "refused", { schemaVersion: CAMPAIGN_SCHEMA }));
  await queue();
  assert.deepEqual(keys(), [held]);
  await reloadPage();
  await load("op-a", account, () => ack(account));
  await queue();
  assert.deepEqual(keys(), [held], "a refusal released a key whose first attempt may have committed");
  assert.equal(dom.window.sessionStorage.length, 0, "the recorded ack left the key in storage");
  await reloadPage();
  await load("op-a", account, () => ack(account));
  await queue();
  assert.equal(keys().length, 1);
  assert.notEqual(keys()[0], held, "after a recorded ack an intentional repeat must be a new campaign");
});

test("G04c2: another operator scope or another account never sees the held key", async () => {
  await load("op-a", "of-r-scope", lostReply);
  await queue();
  const [held] = keys();
  assert.equal(dom.window.sessionStorage.length, 1, "the held key was not persisted");
  assert.match(dom.window.sessionStorage.key(0)!, /op-a.*of-r-scope/, "the storage name carries the operator scope and the account");
  await reloadPage();
  await load("op-b", "of-r-scope", () => ack("of-r-scope"));
  await queue();
  assert.notEqual(keys()[0], held, "another operator reused this operator's held key");
  await reloadPage();
  await load("op-a", "of-r-scope-2", () => ack("of-r-scope-2"));
  await queue();
  assert.notEqual(keys()[0], held, "another account reused the held key");
});
