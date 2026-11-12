/**
 * W1 lane 7a finding 15 (holds today, characterization; REVIEW.md inv 7 "No false success" and "Unconfirmed is not
 * refused (D7)"): the Plan C console says "Approved version ..." only when the backend recorded the approve.
 * PlanCConsole.tsx:54 (row message on result.ok only), :106 (the approve copy) and :174 (the console confirmation on
 * result.ok only). A refused, conflicting, unconfirmed or thrown approve never shows it. Mutation proofs:
 * tests/rules/mutations/W1-preview-plan-c-status-ui/.
 * Offline: real React in jsdom, the typed Plan C mock behind the real client and proxy; refusals are faked at the backend
 * wire (the mock's fetch), the thrown case by an injected client. No network.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { after, before } from "node:test";
import React, { act } from "react";
const { JSDOM } = createRequire(import.meta.url)("jsdom");

const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/onlyfans/plan-c" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent, React, IS_REACT_ACT_ENVIRONMENT: true });
let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof createRoot> | undefined;
before(async () => { ({ createRoot } = await import("react-dom/client")); });
after(async () => { await act(async () => root?.unmount()); dom.window.close(); });
const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
const click = async (element: Element) => act(async () => { element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 25)); });

import { createPlanCClient, type PlanCClient } from "../../lib/onlyfans/plan-c-client";
import { MOCK_ACCOUNT, createPlanCMock, seedDraft, type PlanCMock } from "../contracts/plan-c-mock-backend";
import { createPlanCProxy } from "../contracts/plan-c-proxy";

const APPROVED = /Approved version/;
type Setup = { approveStatus?: number; fault?: "dropReplyAfterCommit" | "dropBeforeCommit"; throws?: boolean };

/** One awaiting draft, one click on approve. Returns the page text and the mock. */
async function approveOnce(setup: Setup = {}): Promise<{ text: string; mock: PlanCMock }> {
  const mock = createPlanCMock({ drafts: [seedDraft()] });
  // An upstream status for the approve POST only, at the backend wire; reads stay healthy so the card stays on screen.
  const wire = (async (input: RequestInfo | URL, init?: RequestInit) => setup.approveStatus && init?.method === "POST" && /\/approve$/.test(String(input))
    ? new Response(JSON.stringify({ ok: false }), { status: setup.approveStatus, headers: { "Content-Type": "application/json" } }) : mock.fetch(input, init)) as typeof fetch;
  const proxy = createPlanCProxy({ ...mock, fetch: wire });
  const real = createPlanCClient({ accountId: MOCK_ACCOUNT, fetchImpl: proxy.fetch });
  const client: PlanCClient = setup.throws ? { ...real, approveDraft: async () => { throw new TypeError("client failed"); } } : real;
  const { default: PlanCConsole } = await import("../../components/onlyfans-preview/PlanCConsole");
  if (root) await act(async () => root!.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(<PlanCConsole accountId={MOCK_ACCOUNT} canAct client={client} />); });
  await settle();
  const button = document.querySelector<HTMLButtonElement>("[data-plan-c-approve]");
  assert.ok(button && !button.disabled, "fixture: approve is live");
  if (setup.fault) mock.faults[setup.fault] = true;
  await click(button);
  await settle();
  return { text: document.body.textContent ?? "", mock };
}

test("finding 15: a recorded approve says 'Approved version'", async () => {
  const { text, mock } = await approveOnce();
  assert.equal(mock.state.drafts[0].status, "approved");
  assert.match(text, APPROVED);
});

test("finding 15: a refused approve (upstream 422) never says 'Approved version'", async () => {
  const { text, mock } = await approveOnce({ approveStatus: 422 });
  assert.equal(mock.state.drafts[0].status, "awaiting", "fixture: nothing was recorded");
  assert.doesNotMatch(text, APPROVED);
});

test("finding 15: a conflicting approve (upstream 409) never says 'Approved version'", async () => {
  const { text } = await approveOnce({ approveStatus: 409 });
  assert.match(document.querySelector("[data-plan-c-notice]")?.textContent ?? "", /changed/, "fixture: the conflict is shown");
  assert.doesNotMatch(text, APPROVED);
});

test("finding 15: an unconfirmed approve (reply lost after commit) never says 'Approved version'", async () => {
  const { text } = await approveOnce({ fault: "dropReplyAfterCommit" });
  assert.match(document.querySelector("[data-plan-c-notice]")?.textContent ?? "", /unconfirmed/, "fixture: unconfirmed is shown");
  assert.doesNotMatch(text, APPROVED);
});

test("finding 15: an unconfirmed approve (connection lost before commit) never says 'Approved version'", async () => {
  const { text, mock } = await approveOnce({ fault: "dropBeforeCommit" });
  assert.equal(mock.state.drafts[0].status, "awaiting", "fixture: nothing was recorded");
  assert.doesNotMatch(text, APPROVED);
});

test("finding 15: an approve whose client call throws never says 'Approved version'", async () => {
  const { text } = await approveOnce({ throws: true });
  assert.doesNotMatch(text, APPROVED);
  assert.match(text, /unconfirmed/, "the throw reads unconfirmed");
});
