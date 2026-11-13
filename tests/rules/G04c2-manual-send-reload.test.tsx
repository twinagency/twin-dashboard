// RULE G04c2: components/onlyfans-preview/OnlyFansWorkspace.tsx manual send (fan-visible). The requestKey was crypto.randomUUID() per
// click and the unconfirmed result lived in component state, so after an unconfirmed send a full reload and a resend of the same text
// minted a new key and the fan could get the message twice. The pending send (the exact request: body, media, price, catalogue item)
// and its key now live in one entry of the G04a sessionStorage store (lib/onlyfans/plan-c-client.ts heldKeyStore), named by operator
// scope and account and keyed by the full canonical intent (conversation, revision, payload), so after a reload the conversation offers
// the exact held retry again. The guarantee is per tab and operator scope, at one conversation revision: a changed revision is a new
// intent and a new key. Hold rule (G02a): after an unconfirmed outcome only a recorded ack releases the key; a refusal does not.
// Offline: jsdom, global fetch stubbed (https://fixture.invalid), the real workspace over the real server data source. A reload is
// reloadPage(): unmount and drop every product module (the in-memory composer draft goes with it), keep sessionStorage.
import { bodyOf, calls, click, close, dom, json, lostReply, mount, q, reloadPage, routeFailure, serve, type, type Call, type Answer } from "../helpers/w3-preview1-dom";
import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import { createRequire } from "node:module";
import React from "react";
import { accounts, conversationDetails, conversationsByAccount } from "../../lib/onlyfans-preview/fixtures";
import { CONTROL_SCHEMA } from "../../lib/onlyfans/controls";
import type { VaultItem } from "../../lib/onlyfans/vault";

const require = createRequire(import.meta.url);
after(close);
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: dom.window.sessionStorage });
beforeEach(() => dom.window.sessionStorage.clear());

const AVA = "of-acc-ava-001", HUMAN = "of-conv-ava-1003"; // human_controlled, takeover effective: a manual send is offered
const AVA2 = "of-acc-ava-005", HUMAN2 = "of-conv-ava2-1102";
const PRINCIPAL = "op-session:fixture";
const ack = (call: Call): Response => {
  const [, accountId, conversationId] = call.url.match(/accounts\/([^/]+)\/conversations\/([^/?]+)/)!;
  return json({ schemaVersion: CONTROL_SCHEMA, ok: true, applied: true, commandKey: "c".repeat(64), accountId, conversationId, action: "manual_message",
    recordedRevision: bodyOf(call).expectedRevision, outcome: "queued", intentId: "0a1b2c3d-1111-4222-8333-444455556699" });
};
const refused = () => routeFailure(409, "refused", { schemaVersion: CONTROL_SCHEMA });
const UNCONFIRMED: Array<[string, Answer]> = [
  ["bare 503", () => new Response(null, { status: 503 })],
  ["503 labelled unconfirmed", () => routeFailure(503, "unconfirmed")],
  ["bare 500", () => new Response(null, { status: 500 })],
  ["unparseable 502", () => new Response("<html>bad gateway</html>", { status: 502 })],
  ["network error", lostReply],
];

/** A page load of the inbox for `operatorScope`, every POST answered by `answer`. `bump` moves every conversation revision on. */
async function load(operatorScope: string, answer: (call: Call) => Response | Promise<Response>, accountId = AVA, bump = 0) {
  serve((call: Call) => {
    if (call.method === "POST") return answer(call);
    const path = new URL(call.url, "https://fixture.invalid").pathname;
    if (path === "/api/onlyfans/accounts") return json({ accounts });
    let m = path.match(/^\/api\/onlyfans\/accounts\/([^/]+)\/conversations\/([^/]+)$/);
    if (m) { const detail = conversationDetails[decodeURIComponent(m[2])]; return json({ conversation: { ...detail, summary: { ...detail.summary, revision: detail.summary.revision + bump } } }); }
    m = path.match(/^\/api\/onlyfans\/accounts\/([^/]+)\/conversations$/);
    if (m) return json({ page: { items: (conversationsByAccount[decodeURIComponent(m[1])] ?? []).map(item => ({ ...item, revision: item.revision + bump })), nextCursor: null } });
    return json({ error: "fixture" }, 404);
  });
  const { default: OnlyFansWorkspace } = require("../../components/onlyfans-preview/OnlyFansWorkspace");
  await mount(<OnlyFansWorkspace view="inbox" source="server" draftPrincipal={PRINCIPAL} operatorScope={operatorScope} canManage canChat />,
    `/onlyfans/inbox?account=${accountId}`);
}
const open = (conversationId = HUMAN) => click(q(`[data-of-conversation-id="${conversationId}"]`));
async function send(text: string, conversationId = HUMAN) {
  await open(conversationId);
  await type(q("[data-of-composer]"), text);
  await click(q("[data-of-send]"));
}
const posts = () => calls.filter(call => call.method === "POST");
const keys = () => posts().map(call => String(bodyOf(call).requestKey));
const result = () => q("[data-of-composer-result]")?.textContent ?? "";
const retryButton = () => q<HTMLButtonElement>("[data-of-retry-control]");
const retry = () => click(retryButton());

test("G04c2: after an unconfirmed send, a full reload restores the held retry, which sends the exact request again", async () => {
  for (const [label, first] of UNCONFIRMED) {
    const scope = `op-${label.replace(/\W/g, "")}`;
    await load(scope, first);
    await send("hello fan");
    assert.match(result(), /not confirmed/, label);
    const [sent] = posts().map(bodyOf);
    assert.match(String(sent.requestKey), /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/, `${label}: the route's requestKey shape`);
    await reloadPage();
    await load(scope, ack);
    await open();
    assert.match(result(), /not confirmed/, `${label}: the reload dropped the held retry`);
    await retry();
    assert.deepEqual(posts().map(bodyOf), [sent], `${label}: the restored retry did not send the exact request`);
  }
});

test("G04c2: a held paid-media send survives a reload with its media, previews and price, not just the text", async () => {
  const photo = (mediaId: string): VaultItem => ({ mediaId, kind: "photo", durationSeconds: null, width: null, height: null, ready: true, reason: null, description: null });
  await load("op-media", lostReply);
  const { draftKey, writeDraft } = require("../../lib/onlyfans/inbox-drafts");
  writeDraft(draftKey(PRINCIPAL, AVA, HUMAN), { selectedMedia: [photo("502"), photo("501")], mediaPaid: true, mediaPrice: "7.00", body: "for you" });
  await open();
  await click(q("[data-of-send]"));
  const [sent] = posts().map(bodyOf);
  assert.ok(JSON.stringify(sent).includes("502") && JSON.stringify(sent).includes("700"), `control: the send carried the media and price ${JSON.stringify(sent)}`);
  await reloadPage();
  await load("op-media", ack);
  await open();
  await retry();
  assert.deepEqual(posts().map(bodyOf), [sent], "the restored retry lost or reordered the media, previews or price");
});

test("G04c2: after a reload a refused retry keeps the retry held; only a recorded ack releases it, in storage too", async () => {
  await load("op-ack", lostReply);
  await send("hello fan");
  const [sent] = posts().map(bodyOf);
  await reloadPage();
  await load("op-ack", refused);
  await open();
  await retry();
  assert.deepEqual(posts().map(bodyOf), [sent]);
  assert.ok(retryButton(), "a refusal of the retry dropped the held retry, though the first attempt may have committed");
  await reloadPage();
  await load("op-ack", ack);
  await open();
  assert.ok(retryButton(), "a refusal released the held send from storage");
  await retry();
  assert.deepEqual(posts().map(bodyOf), [sent]);
  assert.equal(dom.window.sessionStorage.length, 0, "the recorded ack left the send in storage");
  await reloadPage();
  await load("op-ack", ack);
  await open();
  assert.equal(retryButton(), null, "an acknowledged send was restored as held");
  await send("hello fan");
  assert.notEqual(keys()[0], sent.requestKey, "after a recorded ack an intentional repeat must be a new send");
});

test("G04c2: after a reload the held retry is the only action: the composer stays locked until its outcome is known", async () => {
  await load("op-lock", () => new Response(null, { status: 503 }));
  await send("hello fan");
  const [held] = keys();
  await reloadPage();
  await load("op-lock", ack);
  await send("hello fan, edited");
  assert.deepEqual(keys(), [], "the composer sent another message while an earlier one is unconfirmed");
  await retry();
  assert.deepEqual(keys(), [held]);
  await send("hello fan, edited");
  assert.equal(keys().length, 2, "control: after the ack the composer sends again");
  assert.notEqual(keys()[1], held, "a different message reused the held requestKey");
});

// The held key is named by the full intent. Store level, because the UI above never lets a second send through while one is held.
const intentOf = (body: string, expectedRevision = 4, media?: { mediaIds: string[]; previewIds: string[]; priceCents: number }) =>
  ({ command: "send_manual_message" as const, accountId: AVA, conversationId: HUMAN, expectedRevision, payload: { kind: "manual_message" as const, body, ...(media ? { media } : {}) } });
test("G04c2: the same send at the same revision keeps its key across a reload; a changed revision, text or media order is a new key", () => {
  const { createCommandKeyStore } = require("../../lib/onlyfans/plan-c-client");
  const { sendIntent } = require("../../lib/onlyfans-preview/actions");
  let n = 0;
  const store = () => createCommandKeyStore(() => (++n).toString(16).padStart(64, "0"), "of-send-keys:op-id:" + AVA, Date.now, true);
  const media = (ids: string[]) => ({ mediaIds: ids, previewIds: [], priceCents: 700 });
  const held = store().keyFor(sendIntent(intentOf("hello fan", 4, media(["501", "502"]))));
  const reloaded = store();
  assert.equal(reloaded.keyFor(sendIntent(intentOf("hello fan", 4, media(["501", "502"])))), held, "the same send after a reload minted a new key");
  assert.notEqual(reloaded.keyFor(sendIntent(intentOf("hello fan", 5, media(["501", "502"])))), held, "a changed revision is a different intent");
  assert.notEqual(reloaded.keyFor(sendIntent(intentOf("hello fan, edited", 4, media(["501", "502"])))), held, "a changed text is a different intent");
  assert.notEqual(reloaded.keyFor(sendIntent(intentOf("hello fan", 4, media(["502", "501"])))), held, "a changed media order is a different intent");
});

test("G04c2 #3: two messages whose 32-bit payload digests collide keep separate keys; an ack for one keeps the other held", () => {
  const { heldKeyStore } = require("../../lib/onlyfans/plan-c-client");
  const { payloadDigest, sendIntent } = require("../../lib/onlyfans-preview/actions");
  const A = intentOf("hello fan 2dq4rg113wixb"), B = intentOf("hello fan 1s31hvebal1h6"); // codex measured
  assert.equal(payloadDigest(A.payload), payloadDigest(B.payload), "control: the fixture is a real 32-bit digest collision");
  const keysFor = heldKeyStore("of-send-keys", AVA, "op-collide");
  const heldA = keysFor.keyFor(sendIntent(A), A);
  keysFor.settle(sendIntent(A), "unconfirmed");
  assert.notEqual(keysFor.keyFor(sendIntent(B), B), heldA, "a different message shared the held key of a colliding digest");
  keysFor.settle(sendIntent(B), "ack");
  assert.ok(keysFor.isHeld(sendIntent(A)), "an ack for another message released this message's held send");
  assert.deepEqual(keysFor.pending(), [A], "the held request is not the exact one");
});

test("G04c2: the held retry comes from storage: with the entry deleted, the reload offers none and the same text gets a new key", async () => {
  await load("op-control", lostReply);
  await send("hello fan");
  const [held] = keys();
  await reloadPage();
  dom.window.sessionStorage.clear();
  await load("op-control", ack);
  await open();
  assert.equal(retryButton(), null, "the reload kept in-page state: the held retry was not read from storage");
  await send("hello fan");
  assert.notEqual(keys()[0], held, "the key survived without its storage entry, so the reload did not clear module state");
});

test("G04c2: another operator scope or another account sees no held retry and never reuses the key", async () => {
  await load("op-a", () => new Response(null, { status: 503 }));
  await send("hello fan");
  const [held] = keys();
  assert.ok(dom.window.sessionStorage.length > 0, "the held send was not persisted");
  assert.ok([...Array(dom.window.sessionStorage.length).keys()].every(i => /op-a/.test(dom.window.sessionStorage.key(i)!) && dom.window.sessionStorage.key(i)!.includes(AVA)),
    "the storage name carries the operator scope and the account");
  await reloadPage();
  await load("op-b", ack);
  await open();
  assert.equal(retryButton(), null, "another operator was offered this operator's held retry");
  await send("hello fan");
  assert.notEqual(keys()[0], held, "another operator reused this operator's held key");
  await reloadPage();
  await load("op-a", ack, AVA2);
  await send("hello fan", HUMAN2);
  assert.notEqual(keys()[0], held, "another account reused the held key");
});

// #11: the controls route forwards the backend's refusal code (controls-backend.ts, route.ts). Only revision_changed is raised after the
// backend looked the command key up and found no earlier commit (text_delivery.py prepare: prior lookup, then the revision check), so
// only it may release a held send, and only twice in a row: a committed original in flight at the first refusal replays as an ack by
// the second. A command_conflict means the original DID commit; an account or safety hold proves nothing; a bare 409 carries no code.
const refusedWith = (code?: string) => () => routeFailure(409, "refused", { schemaVersion: CONTROL_SCHEMA, ...(code ? { code } : {}) });
test("G04c2 #11: a held send stays held through a key conflict, an account hold or a bare 409; two revision refusals in a row release it", async () => {
  await load("op-rev", lostReply);
  await send("hello fan");
  const [sent] = posts().map(bodyOf);
  for (const code of ["command_conflict", "account_disabled", undefined, "revision_changed"]) {
    await reloadPage();
    await load("op-rev", refusedWith(code));
    await open();
    await retry();
    assert.deepEqual(posts().map(bodyOf), [sent], String(code));
    assert.ok(retryButton(), `${code}: one refusal released the held send`);
  }
  await retry();
  assert.equal(retryButton(), null, "a second revision refusal in a row did not release the held send");
  assert.equal(dom.window.sessionStorage.length, 0, "the released send stayed in storage");
});

test("G04c2 #14: a session loss (401) forgets this scope's held sends in storage: the key could not dedupe under a new sign-in", async () => {
  await load("op-401", lostReply);
  await send("hello fan");
  assert.ok(dom.window.sessionStorage.length > 0, "control: the held send is in storage");
  await reloadPage();
  await load("op-401", () => new Response(null, { status: 401 }));
  await open();
  await retry();
  assert.equal(posts().length, 1, "control: the retry reached the route");
  assert.equal(dom.window.sessionStorage.length, 0, "the session loss left the held send (and its message text) in storage");
});

test("G04c2 #16: a held send is stored once, under a hash of its intent: the message text is not also the entry's name", async () => {
  await load("op-hash", lostReply);
  await send("hello fan, unique text");
  const saved = Object.values(dom.window.sessionStorage).map(String).join("");
  assert.equal(saved.split("unique text").length - 1, 1, saved);
  assert.ok(Object.keys(JSON.parse(saved)).every(name => /^[a-f0-9]{16}$/.test(name)), saved);
});
