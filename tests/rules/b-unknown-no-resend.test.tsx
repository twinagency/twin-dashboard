/**
 * Rule b (handover/TEAM-BRIEFING.md §7), dashboard part only: a ledger `unknown` is never retried. The backend owns the
 * ledger; the dashboard must (1) offer no resend, retry or send-again control for a send whose outcome is unknown, on any
 * of the three screens that show one, and (2) attempt every write exactly once, whatever comes back, so nothing it does
 * can become a second delivery. Offline: jsdom, injected fetch, the typed Plan C mock. No network.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { after, before } from "node:test";
import React, { act } from "react";
const { JSDOM } = createRequire(import.meta.url)("jsdom");

const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/onlyfans/inbox" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent, React, IS_REACT_ACT_ENVIRONMENT: true });
let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof createRoot> | undefined;
before(async () => { ({ createRoot } = await import("react-dom/client")); });
after(async () => { await act(async () => root?.unmount()); dom.window.close(); });
const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
async function render(element: React.ReactElement) {
  if (root) await act(async () => root!.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(element); });
  await settle();
}
const buttonTexts = () => [...document.querySelectorAll("button")].map(button => button.textContent ?? "");
const RESEND = /\b(resend|re-send|retry|send again|try again|redeliver|deliver)\b/i;

import { createEngineOperatorBackend } from "../../lib/onlyfans/engine-operator";
import { submitEngineOperatorCommand } from "../../lib/onlyfans/engine-operator-client";
import { createEngineCatalogueBackend } from "../../lib/onlyfans/engine-catalogue-backend";
import { createPlanCBackend } from "../../lib/onlyfans/plan-c-backend";
import { newCommandKey } from "../../lib/onlyfans/plan-c";
import { parseEngineUnresolved } from "../../lib/onlyfans/engine-unresolved";
import { MOCK_ACCOUNT, MOCK_TOKEN, createPlanCMock, seedDraft, type RawUnresolved } from "../contracts/plan-c-mock-backend";
import { createPlanCProxy, OPERATOR_ACTOR } from "../contracts/plan-c-proxy";

const UNKNOWN = { sourceMessageId: "7", owner: "engine", nextStep: "reconcile_existing_action", actionOutcome: "unknown", actionType: "offer", revision: 5 };
const STATUSES = ["open", "waiting_fan", "waiting_provider", "handover_pending", "handover_accepted", "completed", "declined", "cancelled"];

test("the conversation panel offers no resend or retry for an unknown send, in any status or mode", async () => {
  const { EngineStatus } = await import("../../components/onlyfans-preview/EngineStatus");
  for (const mode of ["active", "paused", "human"] as const) {
    const requests = STATUSES.map((status, index) => ({ ...UNKNOWN, status, requestId: `0a1b2c3d-1111-4222-8333-${String(index).padStart(12, "0")}` }));
    const actions: string[] = [];
    await render(<EngineStatus value={{ schemaVersion: "of-engine.v1", state: "current", accountId: "of-a", conversationId: "of-a:42", environment: "live",
      mode, salesMode: "open", truncated: false, nextCursor: null, requests }} accountId="of-a" conversationId="of-a:42"
      onAction={async (_id, action) => { actions.push(action); return { ok: true }; }} onTakeover={() => {}} />);
    assert.equal(document.querySelectorAll("[data-engine-request]").length, STATUSES.length);
    assert.deepEqual(buttonTexts().filter(text => RESEND.test(text)), [], `${mode}: no resend control`);
  }
});

test("the account-wide list offers reconcile (a record, not a send) and nothing that resends", async () => {
  const { EngineUnresolvedList } = await import("../../components/onlyfans-preview/EngineUnresolved");
  const page = parseEngineUnresolved({ schemaVersion: "of-engine.v1", state: "current", scope: "account", accountId: "of-a", environment: "live", nextCursor: null,
    items: [{ ...UNKNOWN, status: "open", requestId: "0a1b2c3d-1111-4222-8333-444455556661", conversationId: "of-a:42", fanLabel: "fan_42",
      attemptId: "0a1b2c3d-1111-4222-8333-444455556600", supportedActions: ["mark_reconciled"] },
    { ...UNKNOWN, status: "waiting_provider", requestId: "0a1b2c3d-1111-4222-8333-444455556662", conversationId: "of-a:43", fanLabel: null,
      attemptId: "0a1b2c3d-1111-4222-8333-444455556601" }] }, "of-a");
  assert.ok(page && page.state === "current");
  await render(<EngineUnresolvedList page={page} accountId="of-a" canAct loadingMore={false} error={null} onLoadMore={() => {}} onReconcile={async () => ({ ok: true })} />);
  assert.deepEqual(buttonTexts(), ["Mark reconciled"]);
  assert.match(document.body.textContent ?? "", /Reconciling from this list is not available yet/);
});

test("Plan C: an unknown send can only have evidence recorded, which keeps it unresolved", async () => {
  const unknown: RawUnresolved = { id: "unk-b", kind: "unknown_send", owner: "engine", nextStep: "reconcile_with_provider", summary: "No provider answer.",
    conversationId: `${MOCK_ACCOUNT}:900000000009`, revision: 4, createdAt: new Date().toISOString() };
  const mock = createPlanCMock({ unresolved: [unknown] }), proxy = createPlanCProxy(mock);
  const { default: PlanCConsole } = await import("../../components/onlyfans-preview/PlanCConsole");
  await render(<PlanCConsole accountId={MOCK_ACCOUNT} canAct fetchImpl={proxy.fetch} />);
  const row = document.querySelector("[data-plan-c-unresolved='unk-b']");
  assert.ok(row);
  assert.deepEqual([...row.querySelectorAll("button")].map(button => button.textContent), ["Record evidence"]);
  assert.deepEqual(buttonTexts().filter(text => RESEND.test(text)), []);
});

/** Every write path the dashboard has toward the engine. Each must reach the backend exactly once per command. */
const WRITERS: Array<[string, (fetchImpl: typeof fetch) => Promise<unknown>]> = [
  ["engine operator", fetchImpl => createEngineOperatorBackend({ baseUrl: "https://backend.invalid", token: "synthetic-token", fetchImpl })({
    accountId: "of-a", conversationId: "of-a:42", requestId: "0a1b2c3d-1111-4222-8333-444455556661", action: "mark_reconciled", expectedRevision: 5,
    commandKey: "a".repeat(64), actor: "operator:synthetic", note: "checked", environment: "live" })],
  ["browser operator client", fetchImpl => submitEngineOperatorCommand({ accountId: "of-a", conversationId: "of-a:42", requestId: "0a1b2c3d-1111-4222-8333-444455556661",
    action: "mark_reconciled", expectedRevision: 5, note: "checked", environment: "live", fetchImpl })],
  ["catalogue decision", fetchImpl => createEngineCatalogueBackend({ baseUrl: "https://backend.invalid", token: "synthetic-token", fetchImpl })("of-a", "123",
    { action: "retire", expectedRevision: 1, expectedFingerprint: "b".repeat(64), commandKey: "c".repeat(64), actor: "operator:synthetic" })],
  ["Plan C approve", fetchImpl => createPlanCBackend({ baseUrl: "https://backend.invalid", token: MOCK_TOKEN, fetchImpl }).draft(MOCK_ACCOUNT,
    { requestId: seedDraft().requestId, generation: 1, action: "approve", expectedVersion: 1, commandKey: newCommandKey(), actor: OPERATOR_ACTOR })],
  ["Plan C stop", fetchImpl => createPlanCBackend({ baseUrl: "https://backend.invalid", token: MOCK_TOKEN, fetchImpl }).conversation(MOCK_ACCOUNT,
    { conversationId: `${MOCK_ACCOUNT}:1`, action: "stop", expectedRevision: 1, commandKey: newCommandKey(), actor: OPERATOR_ACTOR })],
];
const ANSWERS: Array<[string, () => Promise<Response>]> = [
  ["lost reply", async () => { throw new TypeError("connection reset"); }],
  ["timeout", async () => { throw new DOMException("timed out", "TimeoutError"); }],
  ["500", async () => new Response(null, { status: 500 })],
  ["502", async () => new Response("bad gateway", { status: 502 })],
  ["503", async () => new Response(null, { status: 503 })],
  ["unreadable 200", async () => new Response("not json", { status: 200 })],
];

test("every engine write is attempted exactly once, whatever the backend answers", async () => {
  for (const [writer, run] of WRITERS) for (const [answer, respond] of ANSWERS) {
    let calls = 0;
    const result = await run((async () => { calls++; return respond(); }) as typeof fetch) as { ok: boolean };
    assert.equal(calls, 1, `${writer} after ${answer}: written once, never retried`);
    assert.equal(result.ok, false, `${writer} after ${answer}: never success`);
  }
});
