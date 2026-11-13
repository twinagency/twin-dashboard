// Rule (W1 lane 2 finding 1, REVIEW inv 7 "unknown-delivery holds win", rules a + b): a request whose send outcome is unknown
// or held needs a person whatever its status, so it is filed under Needs attention (data-engine-unresolved="true"), never Finished.
// Offline: jsdom, no fetch.
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

const REQUEST = "0a1b2c3d-1111-4222-8333-444455556661";

/** Renders the conversation panel with one request; returns the group heading it sits under and its unresolved flag. */
async function rendered(status: string, actionOutcome: string) {
  const { EngineStatus } = await import("../../components/onlyfans-preview/EngineStatus");
  const view = { schemaVersion: "of-engine.v1", state: "current", accountId: "of-a", conversationId: "of-a:42", environment: "simulation", mode: "active",
    salesMode: "open", truncated: false, nextCursor: null, requests: [{ requestId: REQUEST, sourceMessageId: "9", status, owner: "engine", nextStep: "none",
      actionOutcome, actionType: "reply", revision: 3 }] };
  if (root) await act(async () => root!.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(<EngineStatus value={view} accountId="of-a" conversationId="of-a:42" />); });
  const row = document.querySelector(`li[data-engine-request="${REQUEST}"]`);
  assert.ok(row, `${status}/${actionOutcome}: the request row renders`);
  return { group: row.parentElement?.previousElementSibling?.getAttribute("data-engine-group") ?? null, unresolved: row.getAttribute("data-engine-unresolved") };
}

test("control: an open request with an unknown or held outcome is listed under Needs attention", async () => {
  for (const actionOutcome of ["unknown", "held"])
    assert.deepEqual(await rendered("open", actionOutcome), { group: "unresolved", unresolved: "true" }, `open/${actionOutcome}`);
});

test("finding 1: a finished request with an unknown or held outcome is never filed under Finished", async () => {
  // Every case is rendered before asserting, so a red run lists all of them.
  const filedAsFinished: string[] = [];
  for (const status of ["completed", "cancelled", "declined"]) for (const actionOutcome of ["unknown", "held"]) {
    const { group, unresolved } = await rendered(status, actionOutcome);
    if (group !== "unresolved" || unresolved !== "true") filedAsFinished.push(`${status}/${actionOutcome}: group=${group} data-engine-unresolved=${unresolved}`);
  }
  assert.deepEqual(filedAsFinished, [], "each must sit under Needs attention with data-engine-unresolved=true");
});
