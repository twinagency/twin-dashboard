// KNOWN RED (W8 ui-clone-5-plus3 finding H2, docs/review/W8/ui-clone-5-plus3.md; REVIEW.md inv 7 D7): the agency-assisted
// connect treats HTTP 503 as refused. components/creator-platforms/SessionConnect.tsx:26 lists 503 with the refusal statuses,
// so it clears retry.current and shows "refused"; the next click rebuilds the command with a fresh session.expiresAt (:19),
// a new identity hash, so a possibly applied enrollment is submitted again without its idempotency key.
// CONDITION: valid connection file, the enroll POST answers 503 (upstream 503 mapped by lib/onlyfans-connections/backend.ts:13,
// or the route catch), the creator clicks again. Fixed looks like: 503 reads unconfirmed like 502, the retry button
// ("Retry same connection request") resends the byte-identical body, and the notice never says refused.
// Note for the fix (codex final): the exact button label and byte-identical body pin the client-side fix (keep the retry).
// A fix that keeps the idempotency key another way (server hash without expiresAt, lib/creator-platforms/server.ts:32)
// needs these assertions rewritten (TEST-CHANGE). The fix-proof only removes the client's 503; backend.ts:13 stays W3 F3.
// Team's Claude owns the fix. Not wired into npm scripts; init.sh does not list it yet (window close's call).
// Offline: jsdom, global fetch stubbed (fixture.invalid); the connection file is synthetic, no real session values.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { after, before } from "node:test";
import React, { act } from "react";
const { JSDOM } = createRequire(import.meta.url)("jsdom");

const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/creator/platforms" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent, React, IS_REACT_ACT_ENVIRONMENT: true });
const realNow = Date.now;
let skew = 0;
let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof createRoot> | undefined;
before(async () => { ({ createRoot } = await import("react-dom/client")); Date.now = () => realNow() + skew; });
after(async () => { await act(async () => root?.unmount()); Date.now = realNow; dom.window.close(); });
const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
const click = async (element: Element | null | undefined) => { assert.ok(element, "element exists"); await act(async () => { element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 25)); }); };
const connectButton = () => document.querySelector<HTMLButtonElement>("[data-creator-session-connect] > button");
const notice = () => document.querySelector('[role="status"]')?.textContent ?? "";

// Synthetic connection file: passes parseCommandJson, connectionOwner and connectionCapture; every value is obviously fake.
const OWNER = "123456789";
const connectionFile = JSON.stringify({
  capture: {
    headers: { user_id: OWNER, user_agent: "synthetic-agent/1.0", x_bc: "synthetic-xbc", x_of_rev: "synthetic-rev" },
    signing: { rules: { static_param: "synthetic-static", start: "synthetic-start", end: "synthetic-end", checksum_indexes: Array.from({ length: 32 }, (_, i) => i), checksum_constant: 7 } },
    cookies: [{ name: "synthetic_name", value: "synthetic-value" }],
  },
  xHash: "synthetic-xhash",
});
const ENROLLMENT = { id: "enrollment-synthetic-1", status: "pending", accountId: null, error: null, expiresAt: "2026-11-12T06:00:00.000Z" };

async function scenario(firstStatus: number) {
  const bodies: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST" && String(input) === "/creator-auth/platforms/onlyfans") {
      bodies.push(String(init.body));
      return bodies.length === 1 ? Response.json({ ok: false }, { status: firstStatus }) : Response.json({ ok: true, enrollment: ENROLLMENT });
    }
    return new Response(null, { status: 404 });
  }) as typeof fetch;
  const { default: SessionConnect } = await import("../../components/creator-platforms/SessionConnect");
  if (root) await act(async () => root!.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(<SessionConnect disabled={false} onChanged={async () => true} />); });
  const handle = document.querySelector<HTMLInputElement>('input:not([type="file"])')!, file = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(handle, "synthetic_creator");
    handle.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  const chosen = new dom.window.File([connectionFile], "connection.json", { type: "application/json" });
  if (typeof chosen.arrayBuffer !== "function") chosen.arrayBuffer = async () => new TextEncoder().encode(connectionFile).buffer;
  Object.defineProperty(file, "files", { configurable: true, value: [chosen] });
  await act(async () => { file.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
  await settle();
  assert.match(notice(), /Connection file ready/, "synthetic connection file accepted");
  await click(connectButton());
  await settle();
  const afterFirst = { label: connectButton()?.textContent ?? "", notice: notice() };
  skew += 5_000; // a rebuilt command would carry a different session.expiresAt
  await click(connectButton());
  await settle();
  return { bodies, afterFirst };
}

test("control: an unconfirmed 502 keeps the same request for the retry", async t => {
  const { bodies, afterFirst } = await scenario(502);
  t.diagnostic(`after 502: label "${afterFirst.label}", notice "${afterFirst.notice}", posts ${bodies.length}`);
  assert.equal(bodies.length, 2);
  assert.equal(afterFirst.label, "Retry same connection request");
  assert.equal(bodies[1], bodies[0], "retry reuses the byte-identical command");
  assert.doesNotMatch(afterFirst.notice, /refused/i);
});

test("W8-H2: a 503 is unconfirmed, so the retry reuses the same request", async t => {
  const { bodies, afterFirst } = await scenario(503);
  t.diagnostic(`after 503: label "${afterFirst.label}", notice "${afterFirst.notice}", posts ${bodies.length}`);
  assert.equal(bodies.length, 2);
  assert.equal(afterFirst.label, "Retry same connection request", "503 dropped the kept retry (treated as refused)");
  assert.equal(bodies[1], bodies[0], "503 retry rebuilt the command with a new expiresAt, so a new idempotency key");
  assert.doesNotMatch(afterFirst.notice, /refused/i, "503 proves nothing was refused (D7)");
});
