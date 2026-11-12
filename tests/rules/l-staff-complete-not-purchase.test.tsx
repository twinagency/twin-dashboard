/**
 * Rule l (handover/TEAM-BRIEFING.md §7): staff messages and actions are context, never approval or purchase. Dashboard
 * part that holds today: when a person marks an offer request completed, nothing the dashboard sends claims a purchase.
 * The browser body, the server body to the engine and the note's audit string carry no purchase, amount, transaction or
 * unlock field, and the note is recorded as an operator string, never as provider evidence. The display half of the rule
 * (a completed offer without evidence reads "Purchase and access confirmed") is B1: tests/known-red/b1-false-success.test.mjs.
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

import { createEngineOperatorBackend, engineOperatorEvidenceRef } from "../../lib/onlyfans/engine-operator";
import { submitEngineOperatorCommand } from "../../lib/onlyfans/engine-operator-client";
import { ENGINE_ENVIRONMENTS } from "../../lib/onlyfans/engine-status";

const PURCHASE_KEY = /purchase|amount|transaction|paid|price|unlock|settle|receipt/i;
const NOTE = "Fan says he paid 20 USD, transaction 99887766";
const REQUEST = "0a1b2c3d-1111-4222-8333-444455556661";

test("the server command for a staff completion carries the note as operator context and nothing that reads as a purchase", async () => {
  for (const environment of ENGINE_ENVIRONMENTS) for (const action of ["complete", "decline", "mark_reconciled"] as const) {
    const bodies: Record<string, unknown>[] = [];
    await createEngineOperatorBackend({ baseUrl: "https://backend.invalid", token: "synthetic-token",
      fetchImpl: (async (_url: unknown, init?: RequestInit) => { bodies.push(JSON.parse(String(init?.body))); return new Response(null, { status: 409 }); }) as typeof fetch })({
      accountId: "of-a", conversationId: "of-a:42", requestId: REQUEST, action, expectedRevision: 4, commandKey: "a".repeat(64), actor: "agency-user:synthetic", note: NOTE, environment });
    assert.equal(bodies.length, 1);
    assert.deepEqual(Object.keys(bodies[0]).sort(), ["action", "actor", "commandKey", "evidenceRef", "expectedRevision"], `${environment} ${action}: exact keys`);
    assert.deepEqual(Object.keys(bodies[0]).filter(key => PURCHASE_KEY.test(key)), [], `${environment} ${action}: no purchase-shaped field`);
    assert.equal(bodies[0].evidenceRef, engineOperatorEvidenceRef(environment, NOTE));
    assert.match(String(bodies[0].evidenceRef), environment === "simulation" ? /^synthetic:operator:/ : new RegExp(`^operator:${environment}:`), "the note is labelled operator context");
  }
});

test("the browser command for Mark completed sends the note and nothing purchase-shaped", async () => {
  const sent: Record<string, unknown>[] = [];
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => { sent.push(JSON.parse(String(init?.body))); return Response.json({ schemaVersion: "of-engine-operator.v1", ok: true, outcome: "recorded" }); }) as typeof fetch;
  const { EngineStatus } = await import("../../components/onlyfans-preview/EngineStatus");
  const view = { schemaVersion: "of-engine.v1", state: "current", accountId: "of-a", conversationId: "of-a:42", environment: "live", mode: "human", salesMode: "open",
    truncated: false, nextCursor: null, requests: [{ requestId: REQUEST, sourceMessageId: "9", status: "handover_accepted", owner: "agency-user", nextStep: "human_review",
      actionOutcome: null, actionType: "offer", revision: 4 }] };
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(<EngineStatus value={view} accountId="of-a" conversationId="of-a:42"
    onAction={(requestId, action, expectedRevision, note, environment) => submitEngineOperatorCommand({ accountId: "of-a", conversationId: "of-a:42", requestId, action, expectedRevision, note, environment, fetchImpl })} />); });
  const input = document.querySelector<HTMLInputElement>("input[aria-label='Review evidence']");
  assert.ok(input);
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, NOTE.slice(0, 108));
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  const complete = [...document.querySelectorAll("button")].find(button => button.textContent === "Mark completed");
  assert.ok(complete && !complete.disabled);
  await act(async () => { complete.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 20)); });
  assert.deepEqual(sent, [{ action: "complete", expectedRevision: 4, note: NOTE.slice(0, 108), environment: "live" }]);
  assert.doesNotMatch(document.querySelector("[role='status']")?.textContent ?? "", /purchase|unlock|paid/i, "the confirmation does not claim a purchase");
});
