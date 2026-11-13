// RULE G04c3h r1 scope-quota (regression guard; REVIEW.md inv 7: a STOP is never harder than a go, unknown-delivery holds win). Promoted
// from fix round 1 of #408 (codex P1, Flash B12 and two Flash majors), proven red at b9414351.
//   P1  components/onlyfans-preview/CampaignManager.tsx: a mounted manager switched from operator A to B kept A's campaign text and its
//       Retry in React state after A's stored hold was purged, so Retry sent A's payload under a new key. The stateful part is now keyed
//       by operator scope and the module drafts are dropped on a scope change.
//   B12 a 401 forgot the current scope's holds, so the same operator signing in again rebuilt a create or send under a new key. A 401
//       proves the request was unauthorised, not that an earlier unknown attempt did not commit. Only a scope change purges, and only others.
//   M1  the other-scope purge ran only when a held store opened, so an operator who opened only Plan C left the prior operator's message
//       and campaign text in storage. PlanCConsole now runs it with the session scope (not the Plan C owner scope, which differs).
//   M2  a failed sessionStorage write (quota) was swallowed, so a new send or create key lived in memory only and a reload dropped it.
//       A held store now refuses a new fan-visible write before dispatch, and keeps no in-memory entry for it; a retry of an existing
//       hold and a settle are never blocked, and a Plan C store (STOP) is never gated. The message never says to clear site data.
//   VA  view-as never reads OnlyFans under another actor (it is refused 403, tests/rules/core-route.child.ts view-as-actor) and leaving it
//       restores the same ctx.actor, so entering and leaving it opens no other scope and keeps the admin's holds.
// Offline: jsdom, global fetch stubbed (https://fixture.invalid), real CampaignManager and PlanCConsole. A reload is reloadPage().
//   node --import tsx --test tests/rules/G04c3h-r1-scope-quota.test.tsx
import { bodyOf, calls, click, close, dom, json, lostReply, mount, q, reloadPage, rerender, serve, submit, type Call } from "../helpers/w3-preview1-dom";
import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import React from "react";
import { CAMPAIGN_SCHEMA } from "../../lib/onlyfans/campaigns";

const require = createRequire(import.meta.url);
after(close);
const real = dom.window.sessionStorage;
const useStorage = (value: unknown) => Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value });
const fullStorage = { getItem: (name: string) => real.getItem(name), removeItem: (name: string) => real.removeItem(name), key: (i: number) => real.key(i),
  get length() { return real.length; }, setItem: () => { throw new dom.window.DOMException("The quota has been exceeded.", "QuotaExceededError"); } };
beforeEach(async () => { await reloadPage(); useStorage(real); real.clear(); }); // a fresh document: no module drafts or scope carried over

const SENDER = { creatorName: "Fixture Creator", handle: "fixture" };
const ack = (accountId: string) => json({ schemaVersion: CAMPAIGN_SCHEMA, ok: true, commandKey: "c".repeat(64), accountId, campaignId: "0a1b2c3d-1111-4222-8333-444455556699", recordedRevision: 1 });
function answer(accountId: string, create: (call: Call) => Response | Promise<Response>) {
  serve((call: Call) => {
    if (call.method === "POST") return create(call);
    if (call.url.includes("/workspace/content")) return json({ workspace: { schemaVersion: "of-workspace.v2", section: "content", accountId, asOf: "2026-11-01T10:00:00.000Z",
      lastCompleteSyncAt: null, historyRecoveryRequired: false, providerConnectionVerified: true, nextCursor: null, items: [] } });
    if (call.url.includes("/conversations")) return json({ page: { items: [], nextCursor: null } });
    return json({ schemaVersion: CAMPAIGN_SCHEMA, ok: true, accountId, campaigns: [], truncated: false });
  });
}
const manager = (accountId: string, operatorScope: string) => {
  const { default: CampaignManager } = require("../../components/onlyfans-preview/CampaignManager");
  return <CampaignManager accountId={accountId} sender={SENDER} operatorScope={operatorScope} />;
};
async function load(accountId: string, operatorScope: string, create: (call: Call) => Response | Promise<Response>, body?: string) {
  answer(accountId, create);
  if (body !== undefined) {
    const { EMPTY_DRAFT, rememberDraft } = require("../../lib/onlyfans/campaign-audience");
    rememberDraft(accountId, { ...EMPTY_DRAFT, name: "Spring note", body, audienceKind: "all_known" });
  }
  await mount(manager(accountId, operatorScope), "/onlyfans/campaigns");
}
const posts = () => calls.filter(call => call.method === "POST");
const notice = () => q("[data-of-campaign-notice]")?.textContent ?? "";
const retryButton = () => [...document.querySelectorAll<HTMLButtonElement>("[data-of-campaign-notice] button")].find(b => /Retry same request/.test(b.textContent ?? "")) ?? null;
const names = (prefix: string) => Object.keys(real).filter(name => name.startsWith(prefix));
const entry = (request: unknown) => JSON.stringify({ "0123456789abcdef": ["a".repeat(64), Date.now(), request, 0] });

test("P1: a mounted manager switched to another operator drops the earlier operator's campaign text and its Retry", async () => {
  await load("of-r1-switch", "op-a", lostReply, "Alpha private text");
  await submit(q("[data-of-campaign-manager] form"));
  assert.ok(retryButton(), "control: op-a's create is held with its Retry");
  await rerender(manager("of-r1-switch", "op-b"), "/onlyfans/campaigns");
  assert.equal(names("of-campaign-keys:op-a:").length, 0, "control: op-b opening its store purged op-a's stored hold");
  assert.ok(retryButton() === null, "op-b was offered op-a's Retry: it would send op-a's campaign under a new key");
  assert.ok(!q<HTMLTextAreaElement>("[data-of-campaign-body]")!.value.includes("Alpha") && !document.body.textContent!.includes("Alpha private text"),
    "op-a's campaign text stayed on screen for op-b");
});

test("B12: a 401 keeps the current scope's held create; after signing in again its exact Retry is offered and replays", async () => {
  await load("of-r1-401", "op-a", lostReply, "Hello there");
  await submit(q("[data-of-campaign-manager] form"));
  const [sent] = posts().map(bodyOf);
  await reloadPage();
  await load("of-r1-401", "op-a", () => new Response(null, { status: 401 }));
  await click(retryButton());
  assert.match(notice(), /Sign in again/, "control: the retry hit a session loss");
  assert.equal(names("of-campaign-keys:op-a:").length, 1, "the 401 forgot this scope's held create, though it may have committed");
  await reloadPage();
  await load("of-r1-401", "op-a", () => ack("of-r1-401"));
  assert.ok(retryButton(), "after signing in again the held create was not offered");
  await click(retryButton());
  assert.deepEqual(posts().map(bodyOf).slice(-1), [sent], "the retry after sign-in was not the exact create with its first requestKey");
});

test("M1: opening only Plan C under a new session scope purges the prior scope's held writes and keeps its own and Plan C keys", async () => {
  real.setItem("of-campaign-keys:op-a:of-pc", entry({ kind: "create", body: { name: "Alpha", body: "Alpha private text" } }));
  real.setItem("of-send-keys:op-a:of-pc", entry({ payload: { kind: "manual_message", body: "Alpha message" } }));
  real.setItem("of-send-keys:op-b:of-pc", entry(null));
  real.setItem("plan-c-keys:owner1:of-pc", entry(null));
  await reloadPage();
  serve(() => json({}));
  const { default: PlanCConsole } = require("../../components/onlyfans-preview/PlanCConsole");
  await mount(<PlanCConsole accountId="of-pc" operatorScope="owner1" sessionScope="op-b" canAct />, "/onlyfans/plan-c");
  assert.deepEqual([...names("of-campaign-keys:op-a:"), ...names("of-send-keys:op-a:")], [], "a Plan C-only visit left the prior operator's text in storage");
  assert.deepEqual([...names("of-send-keys:op-b:"), ...names("plan-c-keys:")], ["of-send-keys:op-b:of-pc", "plan-c-keys:owner1:of-pc"],
    "the purge took this session's held send or the Plan C keys");
  assert.match(readFileSync(new URL("../../app/onlyfans/plan-c/page.tsx", import.meta.url), "utf8"), /sessionScope=\{ctx\.actor \? planCKeyScope\(ctx\.actor\) : undefined\}/,
    "the Plan C page does not hand the console the session scope (the one held stores are named by)");
});

test("M2: a create whose key cannot be saved in this browser is refused before dispatch, with a visible message", async () => {
  await load("of-r1-quota", "op-q", () => ack("of-r1-quota"), "Hello there");
  useStorage(fullStorage);
  await submit(q("[data-of-campaign-manager] form"));
  assert.equal(posts().length, 0, "a create whose key was not saved was sent: a reload would rebuild it under a new key");
  assert.match(notice(), /could not be saved in this browser, so it was not queued/, "the refusal is not shown");
  assert.doesNotMatch(notice(), /site data|close (this|the) tab|other tabs/i, "the message points at a step that would drop every hold");
  assert.ok(retryButton() === null, "control: nothing is held, so nothing is offered for retry");
  useStorage(real);
  await submit(q("[data-of-campaign-manager] form"));
  assert.equal(posts().length, 1, "control: with storage back the same create goes out");
});

test("M2: a held store refuses a new key it cannot persist; a STOP through Plan C is never gated; an unscoped store is not either", async () => {
  await reloadPage();
  const { createPlanCClient, heldKeyStore } = require("../../lib/onlyfans/plan-c-client");
  useStorage(fullStorage);
  const sends = heldKeyStore("of-send-keys", "of-q2", "op-q");
  assert.throws(() => sends.keyFor("send:1", { body: "hi" }), /could not be saved in this browser/, "a manual send key that is not saved was handed out");
  assert.equal(sends.size(), 0, "the refused key stayed in memory: a remount would offer a Retry for a write never dispatched");
  useStorage(real);
  const held = sends.keyFor("send:2", { body: "held" });
  assert.ok(sends.settle("send:2", "unconfirmed"), "control: the send is held");
  useStorage(fullStorage);
  assert.equal(sends.keyFor("send:2", { body: "held" }), held, "a retry of an existing hold was blocked by a failed save");
  assert.doesNotThrow(() => sends.settle("send:2", "ack"), "a settle was blocked by a failed save");
  assert.equal(sends.size(), 0, "control: the ack released it in memory");
  assert.match(heldKeyStore("of-send-keys", "of-q2").keyFor("send:1"), /^[a-f0-9]{64}$/, "control: a store with no scope persists nothing, so nothing fails");
  const stops: string[] = [];
  const client = createPlanCClient({ accountId: "of-q2", operatorScope: "owner1", fetchImpl: async (url: string) => { stops.push(url); return Response.json({}); } });
  await client.conversationCommand("c-1", "stop", 3);
  assert.equal(stops.length, 1, "a STOP was gated on browser storage");
  useStorage(real);
});

test("VA: view-as does not change the session actor, so entering and leaving it keeps the admin's held writes", async () => {
  const { coreRouteChild } = await import("./core-fixtures");
  const actors = coreRouteChild("view-as-actor");
  assert.match(String(actors.admin), /^op-session:[a-f0-9]{64}$/, "control: the admin reads with the session actor");
  // View-as gets no OnlyFans read at all (403), so it opens no held store under any scope; when it does read, it must be the admin's actor.
  assert.ok(actors["view-as"] === "denied:403" || actors["view-as"] === actors.admin, `view-as read with another actor (${actors["view-as"]}): it would purge the admin's holds`);
  assert.equal(actors["after view-as"], actors.admin, "leaving view-as changed ctx.actor");
  assert.notEqual(actors["agency user"], actors.admin, "control: an agency user is another actor, so another scope");
  real.setItem("of-send-keys:op-admin:of-va", entry({ payload: { kind: "manual_message", body: "Admin message" } }));
  const { heldKeyStore } = require("../../lib/onlyfans/plan-c-client");
  for (let round = 0; round < 3; round++) heldKeyStore("of-send-keys", "of-va", "op-admin"); // admin, view-as, admin again: one scope
  assert.deepEqual(names("of-send-keys:"), ["of-send-keys:op-admin:of-va"], "the admin's held send was purged across view-as");
});
