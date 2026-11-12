// KNOWN RED (W3 ui-onlyfans-preview-3, findings F8 F9 F10 F11 F12 F13 F14; docs/review/W3/ui-onlyfans-preview-3.md):
// F8  components/onlyfans-preview/OnlyFansWorkspace.tsx:727 (+ lib/onlyfans-preview/actions.ts:284) — only send_manual_message gets a UUID;
//     resolve_delivery_evidence sends `idem-resolve_delivery_evidence:<acct>:<conv>:<rev>:<digest>` as `requestKey`
//     (lib/onlyfans-preview/server-data-source.ts:164) and the route requires /^[a-f0-9-]{36}$/
//     (app/api/onlyfans-controls/accounts/[accountId]/conversations/[conversationId]/route.ts:44), so "Resolve delivery outcome" is always 400.
// F9  OnlyFansWorkspace.tsx:238,329,727 — an unconfirmed manual send keeps its requestKey only in the per-mount commandByThread ref; the
//     draft (module Map, lib/onlyfans/inbox-drafts.ts) survives a remount, so sending it again mints a new requestKey (second fan message).
// F10 OnlyFansWorkspace.tsx:653-701 (+ InboxView.tsx:624,632) — commandPending is held through the post-write refresh GETs (no timeout,
//     server-data-source.ts:92-97); a hung GET /accounts after an acknowledged send leaves "Stop further contact" disabled (inv 7), and
//     the list poll (:450) skips while commandBusy, so the inbox goes quiet with no error.
// F11 OnlyFansWorkspace.tsx:855-859 (+ InboxView.tsx:610-612) — "Retry same request" stays offered after the refresh shows an unresolved
//     delivery or a no_contact hold (no canSubmitCommand check against the current actions).
// F12 OnlyFansWorkspace.tsx:546-559 (+ selection.ts:370) — handleEngineAction calls the refreshHandover closure of the click's render;
//     requestConversation writes selectedConversationId, so an engine action on X that resolves after the operator opened Y reselects X.
// F13 OnlyFansWorkspace.tsx:461,494 (+ selection.ts:252-261) — one failed background list read (route 503 / proxy 502) clears the selection and detail but leaves
//     `requested.details` set; the re-selected thread never reads again and renders no messages.
// F14 OnlyFansWorkspace.tsx:675-676 (vs :362) — after a command, applyAccounts is applied for error/unavailable too: one failed or
//     unavailable follow-up GET /accounts (route 503 / proxy 502) blanks the open thread.
// Team's Claude owns the fixes. Not wired into npm scripts; init.sh reports it.
// Offline: jsdom, global fetch stubbed (https://fixture.invalid), real OnlyFansWorkspace + InboxView + server data source + fetch transport,
// Next contexts. Fixture data: lib/onlyfans-preview/fixtures.ts (Ava), replies in the transport's envelopes.
import { bodyOf, button, calls, click, close, dom, json, q, settle, type, unexpected, withFastTimers, type Call } from "../helpers/w3-preview3-dom";
import { act } from "react";
import assert from "node:assert/strict";
import test, { after, afterEach } from "node:test";
import { ENGINE_OPERATOR_SCHEMA } from "../../lib/onlyfans/engine-operator";
import { clearDrafts } from "../../lib/onlyfans/inbox-drafts";
import { INCIDENT, READ_FAILURES, X, Y, accountReads, engineStatus, selectedId, ack, actionButton, composer, controlPosts, held, mountWorkspace, refused400,
  retryControl, sendButton, sendReply, workspaceBackend, world } from "../helpers/w3-preview3-workspace";

after(close);
afterEach(() => { assert.deepEqual(unexpected, [], "every request the workspace made was one the test expected"); clearDrafts(); });

const X_MESSAGE = "that sounds perfect honestly";
const threadShown = () => (document.body.textContent ?? "").includes(X_MESSAGE) && !!composer();
const ROUTE_REQUEST_KEY = /^[a-f0-9-]{36}$/; // controls route.ts:44 (resolve_delivery_evidence)
const lost = () => { throw new TypeError("connection reset"); };
const never = () => new Promise<Response>(() => {});

test("control: the inbox opens on the first conversation and renders its thread", async () => {
  const w = world(); held(w, X);
  workspaceBackend(w);
  await mountWorkspace();
  assert.equal(threadShown(), true, "the first conversation's messages and the composer render");
  assert.equal(sendButton() !== null, true, "Send as creator is rendered");
});

test("control: a recorded manual send clears the draft and says the message was queued", async () => {
  const w = world(); held(w, X);
  workspaceBackend(w, { control: call => ack(call) });
  await mountWorkspace();
  await sendReply("hello there");
  await settle(100);
  assert.equal(controlPosts().length, 1);
  assert.match(bodyOf(controlPosts()[0]).requestKey as string, ROUTE_REQUEST_KEY, "a manual send carries a UUID requestKey");
  assert.equal(composer()?.value, "", "the recorded draft is cleared");
  assert.match(q("[data-of-command-result]")?.textContent ?? "", /Message queued/);
});

test("F8: resolving a delivery incident sends a requestKey the controls route accepts", async () => {
  const w = world();
  w.order = [INCIDENT, X]; // the incident thread opens first; its fixture has deliveryIncident outcome "unknown", resolve available
  // The route's own body check (route.ts:44): a key outside the regex is a 400 refusal.
  workspaceBackend(w, { control: call => ROUTE_REQUEST_KEY.test(String(bodyOf(call).requestKey)) ? ack(call) : refused400() });
  await mountWorkspace();
  const input = q<HTMLInputElement>('input[aria-label="Provider message ID"]');
  assert.equal(input !== null, true, "fixture: the incident offers the provider message ID field");
  await type(input, "123456789");
  await click(q('[data-of-decision="delivered"]'));
  const resolve = actionButton("resolve_delivery_evidence");
  assert.equal(resolve?.disabled, false, "fixture: Resolve is enabled once the ID and decision are given");
  await click(resolve);
  await settle(100);
  assert.equal(controlPosts().length, 1, "one resolve POST");
  const body = bodyOf(controlPosts()[0]);
  assert.equal(body.action, "resolve_delivery_evidence");
  const key = String(body.requestKey);
  const shown = q("[data-of-command-result]")?.textContent ?? "";
  assert.equal(ROUTE_REQUEST_KEY.test(key), true,
    `a resolve requestKey must match the route's /^[a-f0-9-]{36}$/ or every resolve is refused (sent "${key}", UI "${shown.slice(0, 60)}")`);
});

test("F9: after a remount, resending the same unconfirmed draft keeps the first requestKey", async () => {
  const w = world(); held(w, X);
  workspaceBackend(w, { control: (call, n) => n === 0 ? lost() : ack(call) });
  await mountWorkspace();
  await sendReply("are you still there?");
  await settle(100);
  assert.match(q("[data-of-command-result]")?.textContent ?? "", /not confirmed/, "fixture: a lost reply reads as not confirmed");
  await mountWorkspace(); // Inbox -> Accounts -> Inbox: a new mount, same principal, same document
  assert.equal(composer()?.value, "are you still there?", "fixture: the draft survived the remount");
  const send = sendButton();
  assert.equal(send?.disabled, false, "fixture: the draft can be sent again");
  await click(send);
  await settle(100);
  const [first, second] = controlPosts().map(bodyOf);
  assert.ok(second, "fixture: the second send was posted");
  assert.equal(second.body, first.body, "fixture: same text");
  assert.equal(second.requestKey, first.requestKey,
    "an unconfirmed manual send must keep its requestKey for the same draft (else the route derives a new command key and a second message can go out)");
});

test("F10: a hung refresh after an acknowledged send does not disable Stop further contact", async () => {
  const w = world(); held(w, X);
  workspaceBackend(w, { control: call => ack(call), accounts: (_c, n) => n === 0 ? json({ accounts: [w.account] }) : never() });
  await mountWorkspace();
  const before = actionButton("mark_no_contact");
  assert.equal(before !== null && !before.disabled, true, "fixture: Stop further contact is enabled before the send");
  await sendReply("one more thing");
  await settle(200);
  assert.equal(accountReads().length, 2, "fixture: the follow-up GET /accounts is in flight");
  assert.match(q("[data-of-command-result]")?.textContent ?? "", /Message queued/, "fixture: the write outcome is known (recorded)");
  const stop = actionButton("mark_no_contact");
  assert.equal(stop !== null, true, "fixture: Stop further contact is rendered for a held conversation");
  assert.equal(stop!.disabled, false, "a stop-direction control must stay enabled once the write outcome is known (inv 7: stopping is never harder than going)");
});

test("F10: a hung refresh after an acknowledged send does not silence the inbox poll", async () => {
  const w = world(); held(w, X);
  workspaceBackend(w, { control: call => ack(call), accounts: (_c, n) => n === 0 ? json({ accounts: [w.account] }) : never() });
  await mountWorkspace();
  const listReads = () => calls.filter(c => c.url === "/api/onlyfans/accounts/of-acc-ava-001/conversations").length;
  assert.equal(listReads(), 1, "fixture: one list read at mount");
  await sendReply("one more thing");
  await settle(100);
  assert.equal(accountReads().length, 2, "fixture: the follow-up GET /accounts is in flight");
  // The 3 s list poll, 100x faster, started now the way a tab becoming visible starts it (:476-480); ≈ 50 s of poll time.
  await withFastTimers(async () => {
    await act(async () => { document.dispatchEvent(new dom.window.Event("visibilitychange")); });
    await settle(500);
  });
  const shown = q("[data-of-command-result]")?.textContent ?? "";
  assert.equal(listReads() > 1, true,
    `a hung post-command refresh must not silence the list poll with no error (list reads ${listReads()}, result "${shown.slice(0, 40)}"; :450 skips while commandBusy)`);
});

for (const [hold, apply, shown] of [
  ["an unresolved delivery", (w: ReturnType<typeof world>) => { const d = w.details[X]; d.summary.delivery = "unknown";
    d.deliveryIncident = { attemptId: "of-attempt-ava-6999", outcome: "unknown", recordedAt: "2026-10-17T09:00:00.000Z", detail: "The provider response was not received." }; },
    () => q("[data-of-incident]") !== null],
  ["a no_contact hold", (w: ReturnType<typeof world>) => { w.details[X].summary.automationMode = "no_contact"; w.details[X].summary.takeoverState = "none"; },
    () => (document.body.textContent ?? "").includes("This fan asked for no further contact.")],
] as const) {
  test(`F11: after an unconfirmed send, a refresh showing ${hold} withdraws "Retry same request"`, async () => {
    const w = world(); held(w, X);
    workspaceBackend(w, { control: (_c: Call) => { apply(w); return lost(); } });
    await mountWorkspace();
    await sendReply("did you get it?");
    await settle(150);
    assert.match(q("[data-of-command-result]")?.textContent ?? "", /not confirmed/, "fixture: the send is unconfirmed");
    assert.equal(shown(), true, `fixture: the refresh applied and the thread shows ${hold}`);
    const retry = retryControl();
    const offered = retry !== null && !retry.disabled;
    assert.equal(offered, false, `"Retry same request" must not be offered while the current conversation shows ${hold} (inv 7: holds never offer resend)`);
  });
}

for (const [failure, reply] of READ_FAILURES) {
  test(`F14: a failed account read (${failure}) after an acknowledged send keeps the open thread`, async () => {
    const w = world(); held(w, X);
    workspaceBackend(w, { control: call => ack(call), accounts: (_c, n) => n === 0 ? json({ accounts: [w.account] }) : reply("accounts") });
    await mountWorkspace();
    await sendReply("see you soon");
    await settle(150);
    assert.equal(accountReads().length >= 2, true, "fixture: the follow-up account read happened");
    assert.equal(threadShown(), true,
      `one failed background account read (${failure}) must not blank the open thread (the 15 s poll ignores error/unavailable for this reason)`);
  });

  test(`F13: after one failed background list read (${failure}), the open thread renders its messages again`, async () => {
    const w = world(); held(w, X);
    workspaceBackend(w, { list: (_c, n) => n === 1 ? reply("list") : json({ page: { items: w.order.map(id => w.details[id].summary), nextCursor: null } }) });
    await mountWorkspace();
    assert.equal(threadShown(), true, "fixture: the thread rendered before the failure");
    // The list poll, 100x faster from here on, started now the way the workspace does when the tab becomes visible (:476-480).
    await withFastTimers(async () => {
      await act(async () => { document.dispatchEvent(new dom.window.Event("visibilitychange")); });
      await settle(600);
    });
    const lists = calls.filter(c => c.url === "/api/onlyfans/accounts/of-acc-ava-001/conversations").length;
    const detailsRead = calls.filter(c => c.url === `/api/onlyfans/accounts/of-acc-ava-001/conversations/${X}`).length;
    assert.equal(lists >= 3, true, `fixture: the failed read was followed by successful polls (list reads ${lists})`);
    assert.equal(threadShown(), true,
      `after one failed background list read (${failure}) the re-selected thread must be read again and render (detail reads ${detailsRead}, list reads ${lists})`);
  });
}

test("F12: an engine action on X that resolves after the operator opened Y leaves Y selected", async () => {
  const w = world();
  w.details[X].engineStatus = engineStatus(X);
  let release!: () => void;
  const answered = new Promise<void>(resolve => { release = resolve; });
  workspaceBackend(w, { engine: async () => { await answered; return json({ schemaVersion: ENGINE_OPERATOR_SCHEMA, ok: true, outcome: "recorded" }); } });
  await mountWorkspace();
  assert.equal(selectedId(), X, "fixture: X is open");
  const requestResponsibility = button(/^Request responsibility$/);
  assert.equal(requestResponsibility !== undefined, true, "fixture: X's open engine request offers Request responsibility");
  await click(requestResponsibility); // the engine POST is now in flight (deferred)
  assert.equal(calls.filter(c => c.method === "POST" && c.url.includes("/requests/")).length, 1, "fixture: the engine action was posted");
  await click(q(`[data-of-conversation-id="${Y}"]`));
  await settle(100);
  assert.equal(selectedId(), Y, "fixture: the operator opened Y");
  await act(async () => { release(); });
  await settle(150);
  const now = selectedId();
  assert.equal(now === Y, true, `a late engine action on X must not move the operator off the conversation they opened (selected after: ${now})`);
});
