// TEST-CHANGE (G07d r1): hold fixtures (seed, clear, malformed value) moved from sessionStorage to localStorage, the store the
//   hold now lives in for cross-tab reach (stop-hold.ts). Same key, same values, no assertion changed.
// RULE G07d stop-hold-go-paths (REVIEW.md inv 7: a STOP is never harder than a go, unknown-delivery holds win). rwl batch 1 B1 (inbox)
// and the G07d residuals. Campaigns are G07d-stop-hold-campaigns.
//   B1 the unconfirmed STOP hold (components/onlyfans-launch/automation/stop-hold.ts) was read only by the launch automation panel. The
//      inbox hand back and resume ignored it (and so did their exact retry), so a go reached the account while its STOP was unknown. They
//      now read the same hold; manual 1:1 send under takeover, Take over, Pause and No contact stay live.
//   (a) a manual send whose key could not be saved (full storage) was refused by a throw nothing caught: the operator saw nothing. It is now a
//      visible refusal, and nothing is sent.
//   (b) an inbox visit without a selected conversation never ran enterHeldScope, so a previous operator scope's held message text stayed in
//      this tab's storage. The workspace now enters its scope on mount: other scopes go, this scope's own holds stay.
//   (c) the inbox page rendered OnlyFansWorkspace unkeyed, so after a same-tab re-login (A to B) and a server refresh the mounted workspace
//      kept A's unconfirmed send and its Retry while A's held key was purged: B's Retry sent A's message under a new key. The workspace
//      now keys its state by operator scope (as CampaignManager does), so B starts clean.
// Offline: jsdom, global fetch stubbed (https://fixture.invalid), the real OnlyFansWorkspace and CampaignManager.
//   node --import tsx --test tests/rules/G07d-stop-hold-go-paths.test.tsx
import { bodyOf, calls, click, close, dom, json, mount, q, reloadPage, rerender, routeFailure, serve, type, type Call } from "../helpers/w3-preview1-dom";
import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import { createRequire } from "node:module";
import React from "react";
import { accounts, conversationDetails, conversationsByAccount } from "../../lib/onlyfans-preview/fixtures";
import { CONTROL_SCHEMA } from "../../lib/onlyfans/controls";

const require = createRequire(import.meta.url);
after(close);
const real = dom.window.sessionStorage;
const useStorage = (value: unknown) => Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value });
const fullStorage = { getItem: (name: string) => real.getItem(name), removeItem: (name: string) => real.removeItem(name), key: (i: number) => real.key(i),
  get length() { return real.length; }, setItem: () => { throw new dom.window.DOMException("The quota has been exceeded.", "QuotaExceededError"); } };
beforeEach(async () => { await reloadPage(); useStorage(real); real.clear(); dom.window.localStorage.clear(); });

const AVA = "of-acc-ava-001", HUMAN = "of-conv-ava-1003", PAUSED_CONV = "of-conv-ava-1001"; // 1003: takeover effective; 1001 made paused below
const PRINCIPAL = "op-session:fixture";
const HELD = /held until the emergency stop is confirmed/i;
/** The marker the launch panel writes when a STOP is sent and keeps until it is recorded, refused or read as applied. */
const holdStop = (accountId: string) => dom.window.localStorage.setItem(`b-stop-held:${accountId}`, JSON.stringify({ accountId, since: 1, attempt: 1, carried: false }));
const posts = () => calls.filter(call => call.method === "POST");
const controlAck = (call: Call): Response => {
  const [, accountId, conversationId] = call.url.match(/accounts\/([^/]+)\/conversations\/([^/?]+)/)!;
  const body = bodyOf(call);
  return json({ schemaVersion: CONTROL_SCHEMA, ok: true, applied: true, commandKey: "c".repeat(64), accountId, conversationId, action: body.action,
    recordedRevision: body.expectedRevision, ...(body.action === "manual_message" ? { outcome: "queued", intentId: "0a1b2c3d-1111-4222-8333-444455556699" } : {}) });
};

/** `empty`: the account lists no conversations, so the inbox selects none. */
async function inbox(operatorScope: string, answer: (call: Call) => Response | Promise<Response>, empty = false, principal = PRINCIPAL) {
  const paused = <T extends { conversationId: string }>(s: T) => (s.conversationId === PAUSED_CONV ? { ...s, automationMode: "paused" } : s);
  serve((call: Call) => {
    if (call.method === "POST") return answer(call);
    const path = new URL(call.url, "https://fixture.invalid").pathname;
    if (path === "/api/onlyfans/accounts") return json({ accounts });
    let m = path.match(/^\/api\/onlyfans\/accounts\/([^/]+)\/conversations\/([^/]+)$/);
    if (m) { const detail = conversationDetails[decodeURIComponent(m[2])]; return json({ conversation: { ...detail, summary: paused(detail.summary) } }); }
    m = path.match(/^\/api\/onlyfans\/accounts\/([^/]+)\/conversations$/);
    if (m) return json({ page: { items: empty ? [] : (conversationsByAccount[decodeURIComponent(m[1])] ?? []).map(paused), nextCursor: null } });
    return json({ error: "fixture" }, 404);
  });
  const { default: OnlyFansWorkspace } = require("../../components/onlyfans-preview/OnlyFansWorkspace");
  await mount(<OnlyFansWorkspace view="inbox" source="server" draftPrincipal={principal} operatorScope={operatorScope} canManage canChat />,
    `/onlyfans/inbox?account=${AVA}`);
}
const open = (conversationId: string) => click(q(`[data-of-conversation-id="${conversationId}"]`));
const controlNode = (action: string) => q<HTMLButtonElement>(`[data-of-actions] [data-of-action="${action}"]`);
/** Booleans only: a failing assertion that inspects a jsdom node can exhaust the heap. */
const control = (action: string) => Boolean(controlNode(action));
const blockedText = () => q("details.of-blocked-actions")?.textContent ?? "";
const resultText = () => q("[data-of-command-result]")?.textContent ?? "";

test("B1 inbox: an unconfirmed STOP holds hand back and resume; manual send, Take over and No contact stay live", async () => {
  holdStop(AVA);
  await inbox("op-g07d-b1", controlAck);
  await open(HUMAN);
  assert.equal(control("release_takeover"), false, "hand back is offered while the account's STOP is unconfirmed");
  assert.match(blockedText(), HELD, "the hold is not named under Control availability");
  await type(q("[data-of-composer]"), "operator typed");
  await click(q("[data-of-send]"));
  assert.deepEqual(posts().map(c => bodyOf(c).action), ["manual_message"], "a manual 1:1 send under takeover was held (owner ruling: it stays live)");
  await open(PAUSED_CONV);
  assert.equal(control("resume_automation"), false, "resume is offered while the account's STOP is unconfirmed");
  assert.ok(control("request_takeover") && Boolean(q('[data-of-action="mark_no_contact"]')), "a brake was withdrawn by the STOP hold");
});

test("B1 inbox: control, with no STOP hold hand back and resume are offered", async () => {
  await inbox("op-g07d-b1c", controlAck);
  await open(HUMAN);
  assert.ok(control("release_takeover"));
  await open(PAUSED_CONV);
  assert.ok(control("resume_automation"));
});

test("B1 inbox: a STOP held after render blocks hand back at submit, and blocks the retry of an unconfirmed hand back", async () => {
  await inbox("op-g07d-b1r", () => routeFailure(503, "unconfirmed", { schemaVersion: CONTROL_SCHEMA }));
  await open(HUMAN);
  await click(controlNode("release_takeover"));
  assert.equal(posts().length, 1, "control: the hand back was sent");
  assert.ok(Boolean(q("[data-of-retry-control]")), "control: the unconfirmed hand back offers its exact retry");
  holdStop(AVA);
  await click(q("[data-of-retry-control]"));
  assert.equal(posts().length, 1, "the retry of a hand back went out while the account's STOP is unconfirmed");
  assert.match(resultText(), HELD, "the held retry does not say why");
  dom.window.localStorage.removeItem(`b-stop-held:${AVA}`);
  await reloadPage();
  await inbox("op-g07d-b1s", controlAck);
  await open(HUMAN);
  const live = controlNode("release_takeover");
  holdStop(AVA); // another tab or the launch panel sent a STOP; this view has not re-rendered
  await click(live);
  assert.equal(posts().length, 0, "a hand back already on screen went out after the STOP hold was set");
});

test("(a): a manual send whose key cannot be saved is refused visibly and not sent", async () => {
  await inbox("op-g07d-a", controlAck);
  await open(HUMAN);
  await type(q("[data-of-composer]"), "will not fit");
  useStorage(fullStorage);
  await click(q("[data-of-send]"));
  useStorage(real);
  assert.equal(posts().length, 0, "a send whose key was not saved went out");
  assert.match(q("[data-of-composer-result]")?.textContent ?? "", /could not be saved in this browser, so it was not sent/, "the refusal is silent");
});

test("(b): an inbox visit with no conversation selected forgets another operator scope's held sends and keeps its own", async () => {
  real.setItem(`of-send-keys:op-g07d-old:${AVA}`, "{}");
  real.setItem(`of-send-keys:op-g07d-new:${AVA}`, "{}");
  await inbox("op-g07d-new", controlAck, true);
  assert.equal(calls.some(c => /\/conversations\/[^/?]+$/.test(new URL(c.url, "https://fixture.invalid").pathname)), false, "control: no conversation is selected");
  assert.deepEqual(Object.keys(real).filter(k => k.startsWith("of-send-keys:")).sort(), [`of-send-keys:op-g07d-new:${AVA}`],
    "the previous operator scope's held message text outlived the scope change");
});

test("(c): a workspace switched from operator A to B drops A's unconfirmed send and its Retry; nothing of A's goes out under B", async () => {
  const workspace = (operatorScope: string) => {
    const { default: OnlyFansWorkspace } = require("../../components/onlyfans-preview/OnlyFansWorkspace");
    return <OnlyFansWorkspace view="inbox" source="server" draftPrincipal={`op-session:${operatorScope}`} operatorScope={operatorScope} canManage canChat />;
  };
  await inbox("op-g07d-c-a", () => routeFailure(503, "unconfirmed", { schemaVersion: CONTROL_SCHEMA }), false, "op-session:op-g07d-c-a"); // the page passes ctx.actor and its planCKeyScope
  await open(HUMAN);
  await type(q("[data-of-composer]"), "operator A's message");
  await click(q("[data-of-send]"));
  assert.equal(posts().length, 1, "control: A's send went out once");
  assert.ok(Boolean(q("[data-of-retry-control]")), "control: A's unconfirmed send offers its exact retry");
  await rerender(workspace("op-g07d-c-b"), `/onlyfans/inbox?account=${AVA}`); // same tab, B signed in, server component refreshed
  assert.equal(Boolean(q("[data-of-retry-control]")), false, "operator B is offered A's Retry");
  assert.equal(document.body.textContent?.includes("operator A's message") ?? false, false, "A's message text is on B's screen");
  assert.equal(posts().length, 1, "something of A's went out under B");
});
