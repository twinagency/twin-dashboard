// RULE G04c2: components/onlyfans-preview/OnlyFansWorkspace.tsx manual send (fan-visible). The requestKey was crypto.randomUUID() per
// click and the unconfirmed result lived in component state, so after an unconfirmed send a full reload and a resend of the same text
// minted a new key and the fan could get the message twice. The key now comes from the G04a sessionStorage store
// (lib/onlyfans/plan-c-client.ts createCommandKeyStore), named by operator scope and account and keyed by the intent's payload digest.
// Hold rule (G02a): after an unconfirmed outcome only a recorded ack releases the key; a refusal of a retry does not.
// Offline: jsdom, global fetch stubbed (https://fixture.invalid), the real workspace over the real server data source. A reload is
// reloadPage(): unmount and drop every product module, keep sessionStorage.
import { bodyOf, calls, click, close, dom, json, lostReply, mount, q, reloadPage, routeFailure, serve, type, type Call, type Answer } from "../helpers/w3-preview1-dom";
import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import { createRequire } from "node:module";
import React from "react";
import { accounts, conversationDetails, conversationsByAccount } from "../../lib/onlyfans-preview/fixtures";
import { CONTROL_SCHEMA } from "../../lib/onlyfans/controls";

const require = createRequire(import.meta.url);
after(close);
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: dom.window.sessionStorage });
beforeEach(() => dom.window.sessionStorage.clear());

const AVA = "of-acc-ava-001", HUMAN = "of-conv-ava-1003"; // human_controlled, takeover effective: a manual send is offered
const AVA2 = "of-acc-ava-005", HUMAN2 = "of-conv-ava2-1102";
const ack = (call: Call): Response => {
  const [, accountId, conversationId] = call.url.match(/accounts\/([^/]+)\/conversations\/([^/?]+)/)!;
  return json({ schemaVersion: CONTROL_SCHEMA, ok: true, applied: true, commandKey: "c".repeat(64), accountId, conversationId, action: "manual_message",
    recordedRevision: bodyOf(call).expectedRevision, outcome: "queued", intentId: "0a1b2c3d-1111-4222-8333-444455556699" });
};
const UNCONFIRMED: Array<[string, Answer]> = [
  ["bare 503", () => new Response(null, { status: 503 })],
  ["503 labelled unconfirmed", () => routeFailure(503, "unconfirmed")],
  ["bare 500", () => new Response(null, { status: 500 })],
  ["unparseable 502", () => new Response("<html>bad gateway</html>", { status: 502 })],
  ["network error", lostReply],
];

/** A page load of the inbox for `operatorScope`, every POST answered by `answer`. */
async function load(operatorScope: string, answer: (call: Call) => Response | Promise<Response>, accountId = AVA) {
  serve((call: Call) => {
    if (call.method === "POST") return answer(call);
    const path = new URL(call.url, "https://fixture.invalid").pathname;
    if (path === "/api/onlyfans/accounts") return json({ accounts });
    let m = path.match(/^\/api\/onlyfans\/accounts\/([^/]+)\/conversations\/([^/]+)$/);
    if (m) return json({ conversation: conversationDetails[decodeURIComponent(m[2])] });
    m = path.match(/^\/api\/onlyfans\/accounts\/([^/]+)\/conversations$/);
    if (m) return json({ page: { items: conversationsByAccount[decodeURIComponent(m[1])] ?? [], nextCursor: null } });
    return json({ error: "fixture" }, 404);
  });
  const { default: OnlyFansWorkspace } = require("../../components/onlyfans-preview/OnlyFansWorkspace");
  await mount(<OnlyFansWorkspace view="inbox" source="server" draftPrincipal="op-session:fixture" operatorScope={operatorScope} canManage canChat />,
    `/onlyfans/inbox?account=${accountId}`);
}
async function send(text: string, conversationId = HUMAN) {
  await click(q(`[data-of-conversation-id="${conversationId}"]`));
  await type(q("[data-of-composer]"), text);
  await click(q("[data-of-send]"));
}
const keys = () => calls.filter(call => call.method === "POST").map(call => String(bodyOf(call).requestKey));
const result = () => q("[data-of-composer-result]")?.textContent ?? "";

test("G04c2: after an unconfirmed send, a full reload and the same send reuses the requestKey", async () => {
  for (const [label, first] of UNCONFIRMED) {
    const scope = `op-${label.replace(/\W/g, "")}`;
    await load(scope, first);
    await send("hello fan");
    assert.match(result(), /not confirmed/, label);
    const [held] = keys();
    assert.match(held, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/, `${label}: the route's requestKey shape`);
    await reloadPage();
    await load(scope, ack);
    await send("hello fan");
    assert.deepEqual(keys(), [held], `${label}: the resend after a reload minted a new requestKey`);
  }
});

test("G04c2: a changed payload after the reload gets a new requestKey", async () => {
  await load("op-change", () => new Response(null, { status: 503 }));
  await send("hello fan");
  const [held] = keys();
  await reloadPage();
  await load("op-change", ack);
  await send("hello fan, edited");
  assert.equal(keys().length, 1);
  assert.notEqual(keys()[0], held, "a different message reused the held requestKey");
});

test("G04c2: a refusal of the retry does not release the held key; a recorded ack does, in storage too", async () => {
  await load("op-ack", lostReply);
  await send("hello fan");
  const [held] = keys();
  await reloadPage();
  await load("op-ack", () => routeFailure(409, "refused", { schemaVersion: CONTROL_SCHEMA }));
  await send("hello fan");
  assert.deepEqual(keys(), [held]);
  await reloadPage();
  await load("op-ack", ack);
  await send("hello fan");
  assert.deepEqual(keys(), [held], "a refusal released a key whose first attempt may have committed");
  assert.equal(dom.window.sessionStorage.length, 0, "the recorded ack left the key in storage");
  await reloadPage();
  await load("op-ack", ack);
  await send("hello fan");
  assert.equal(keys().length, 1);
  assert.notEqual(keys()[0], held, "after a recorded ack an intentional repeat must be a new send");
});

test("G04c2: another operator scope or another account never sees the held key", async () => {
  await load("op-a", () => new Response(null, { status: 503 }));
  await send("hello fan");
  const [held] = keys();
  assert.ok(dom.window.sessionStorage.length > 0, "the held key was not persisted");
  assert.ok([...Array(dom.window.sessionStorage.length).keys()].every(i => /op-a/.test(dom.window.sessionStorage.key(i)!) && dom.window.sessionStorage.key(i)!.includes(AVA)),
    "the storage name carries the operator scope and the account");
  await reloadPage();
  await load("op-b", ack);
  await send("hello fan");
  assert.notEqual(keys()[0], held, "another operator reused this operator's held key");
  await reloadPage();
  await load("op-a", ack, AVA2);
  await send("hello fan", HUMAN2);
  assert.notEqual(keys()[0], held, "another account reused the held key");
});
