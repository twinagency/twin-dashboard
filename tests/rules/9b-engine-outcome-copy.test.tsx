/**
 * W1 lane 9b finding 5 (docs/review/W1/tests-ui-browser.md), REVIEW.md invariant 7: no false success, unknown = unconfirmed.
 * Characterization: the engine request row says "Action recorded" only when the backend route recorded the action. The row
 * runs through the real browser client (submitEngineOperatorCommand) with a fake only at fetch: a recorded reply, a refused
 * reply, and an unreadable 502 that the client itself must read as unconfirmed. A handler that throws (the only way to reach
 * the row's own catch) reads "unconfirmed". The browser journey (tests/browser/engine-journey.tsx) always answers ok, so
 * nothing else pins this copy. 503 is not used: its server-side mapping is the D7 known-red (tests/known-red/b-d7-*).
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

import type { EngineActionHandler } from "../../components/onlyfans-preview/EngineStatus";
import { ENGINE_OPERATOR_SCHEMA } from "../../lib/onlyfans/engine-operator";
import { submitEngineOperatorCommand } from "../../lib/onlyfans/engine-operator-client";

const REQUEST = "0a1b2c3d-1111-4222-8333-444455556671";
const VIEW = { schemaVersion: "of-engine.v1", state: "current", accountId: "of-a", conversationId: "of-a:42", environment: "live", mode: "human", salesMode: "open",
  truncated: false, nextCursor: null, requests: [{ requestId: REQUEST, sourceMessageId: "9", status: "handover_accepted", owner: "agency-user", nextStep: "human_review",
    actionOutcome: null, actionType: "offer", revision: 7 }] };
const REFUSED_TEXT = "The request changed or is held. Refresh and review it before trying again.";

/** Mounts one handover_accepted row, types a note, clicks Mark completed, returns the row's status text. */
async function complete(onAction: EngineActionHandler) {
  const { EngineStatus } = await import("../../components/onlyfans-preview/EngineStatus");
  if (root) await act(async () => root!.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(<EngineStatus value={VIEW} accountId="of-a" conversationId="of-a:42" onAction={onAction} />); });
  const input = document.querySelector<HTMLInputElement>("input[aria-label='Review evidence']");
  assert.ok(input, "the accepted request offers a review note");
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, "Checked the provider receipt");
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  const button = [...document.querySelectorAll("button")].find(b => b.textContent === "Mark completed");
  assert.ok(button && !button.disabled, "Mark completed is enabled once a note is typed");
  await act(async () => { button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 25)); });
  const row = document.querySelector(`[data-engine-request="${REQUEST}"]`);
  assert.ok(row, "the row is still on screen");
  return row.querySelector("[role=status]")?.textContent ?? "";
}

/** The row wired to the real browser client; `reply` is the only fake, at fetch. Returns the row status; asserts one POST to the request route. */
async function completeThroughClient(reply: () => Response) {
  const posted: string[] = [];
  const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => { posted.push(`${init?.method} ${String(url)}`); return reply(); }) as typeof fetch;
  const status = await complete((requestId, action, expectedRevision, note, environment) =>
    submitEngineOperatorCommand({ accountId: "of-a", conversationId: "of-a:42", requestId, action, expectedRevision, note, environment, fetchImpl }));
  assert.deepEqual(posted, [`POST /api/onlyfans-controls/accounts/of-a/conversations/of-a%3A42/requests/${REQUEST}`], "one command to the request route");
  return status;
}

test("finding 5: a recorded reply reads Action recorded (control)", async () => {
  const status = await completeThroughClient(() => Response.json({ schemaVersion: ENGINE_OPERATOR_SCHEMA, ok: true, outcome: "recorded" }));
  assert.match(status, /Action recorded/);
});

test("finding 5: a refused reply shows the refusal and never Action recorded", async () => {
  const status = await completeThroughClient(() => Response.json({ schemaVersion: ENGINE_OPERATOR_SCHEMA, ok: false, outcome: "refused", error: REFUSED_TEXT }, { status: 409 }));
  assert.equal(status, REFUSED_TEXT);
  assert.doesNotMatch(status, /Action recorded/);
});

test("finding 5: an unreadable 502 reply reads unconfirmed and never Action recorded", async () => {
  const status = await completeThroughClient(() => new Response("<html>Bad Gateway</html>", { status: 502, headers: { "Content-Type": "text/html" } }));
  assert.match(status, /unconfirmed/i);
  assert.doesNotMatch(status, /Action recorded/);
});

test("finding 5: a handler that throws reads unconfirmed, never Action recorded", async () => {
  const calls: string[] = [];
  const status = await complete(async (_requestId, action) => { calls.push(action); throw new TypeError("connection reset"); });
  assert.deepEqual(calls, ["complete"]);
  assert.match(status, /unconfirmed/i);
  assert.doesNotMatch(status, /Action recorded/);
});
