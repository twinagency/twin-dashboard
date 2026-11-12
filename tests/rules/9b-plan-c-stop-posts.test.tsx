/**
 * W1 lane 9b finding 2 (docs/review/W1/tests-ui-browser.md), REVIEW.md invariant 7: a STOP is relayed once, and the page
 * claims "Stop recorded" only when the backend recorded it. Characterization: real PlanCConsole, real browser client, real
 * proxy handlers and real backend client against the typed mock backend (tests/contracts). The only fakes are at the backend wire.
 * Design-neutral: if a "Confirm stop" button appears it is clicked, so a one-click Stop stays green; the conversation always
 * carries the revision the backend expects, so neither the revision gate nor click counts are asserted (lane 7a's known-reds,
 * tests/known-red/7a-stop-gate.test.tsx); the exact unconfirmed wording is not pinned (lane 7a F3 changes it to "stop
 * unconfirmed"); and nothing depends on the conversation row surviving the stop (the mock keeps drafts after a stop).
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

import { MOCK_ACCOUNT, createPlanCMock, seedDraft } from "../contracts/plan-c-mock-backend";
import { createPlanCProxy } from "../contracts/plan-c-proxy";
import { PLAN_C_REFUSED_TEXT } from "../../lib/onlyfans/plan-c";

const ID = `${MOCK_ACCOUNT}:900000000001`;
const wait = (ms = 25) => new Promise(resolve => setTimeout(resolve, ms));
const click = async (element: Element) => act(async () => { element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); await wait(); });
type WireFault = (method: string, path: string) => Response | null;
const failStop = (status: number): WireFault => (method, path) => method === "POST" && path.endsWith("/stop") ? Response.json({ ok: false }, { status }) : null;

/** Mounts the console for one draft, presses Stop (and Confirm stop if asked), checks one stop left, returns the page text. */
async function pressStop(options: { wireFault?: WireFault; prepare?: (mock: ReturnType<typeof createPlanCMock>) => void } = {}) {
  const mock = createPlanCMock({ drafts: [seedDraft()] });
  const wire: Array<{ method: string; path: string; body: Record<string, unknown> | null }> = [];
  const fetchAtWire = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET", path = decodeURIComponent(new URL(String(input)).pathname);
    wire.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null });
    return options.wireFault?.(method, path) ?? mock.fetch(input, init);
  }) as typeof fetch;
  const proxy = createPlanCProxy({ ...mock, fetch: fetchAtWire });
  const { default: PlanCConsole } = await import("../../components/onlyfans-preview/PlanCConsole");
  if (root) await act(async () => root!.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(<PlanCConsole accountId={MOCK_ACCOUNT} canAct fetchImpl={proxy.fetch} />); await wait(); });
  options.prepare?.(mock);
  const row = () => document.querySelector<HTMLElement>(`[data-plan-c-conversation="${ID}"]`);
  const stop = row()?.querySelector('[data-plan-c-conversation-action="stop"]');
  assert.ok(stop, "the conversation offers Stop");
  await click(stop);
  const confirm = row()?.querySelector('[data-plan-c-conversation-confirm="stop"]');
  if (confirm) await click(confirm);
  await act(async () => { await wait(); });
  const posts = wire.filter(call => call.method === "POST");
  assert.equal(proxy.posts().length, 1, "the browser sent exactly one command");
  assert.ok(proxy.posts()[0].path.endsWith(`/plan-c/conversations/${ID}/stop`), `the browser command is the stop for ${ID}: ${proxy.posts()[0].path}`);
  assert.equal(posts.length, 1, "exactly one command reached the backend");
  assert.ok(posts[0].path.endsWith(`/conversations/${ID}/stop`), `the backend command is the stop for ${ID}: ${posts[0].path}`);
  assert.match(String(posts[0].body?.commandKey), /^[0-9a-f]{64}$/, "the stop carries an idempotency key");
  return { mock, page: document.body.textContent ?? "" };
}

test("finding 2: Stop posts exactly one stop command and the page says Stop recorded once the backend recorded it (control)", async () => {
  const { mock } = await pressStop();
  assert.deepEqual(mock.state.commits.map(c => [c.action, c.target]), [["stop", ID]], "the backend applied one stop and nothing else");
  assert.equal(mock.state.conversations[ID].owner, "stopped");
  assert.match(document.querySelector("[data-plan-c-confirmation]")?.textContent ?? "", /Stop recorded/);
});

test("finding 2: a refused stop (403) posts once, shows the refusal and never says Stop recorded", async () => {
  const { page } = await pressStop({ wireFault: failStop(403) });
  assert.ok(page.includes(PLAN_C_REFUSED_TEXT), "the refusal is shown");
  assert.doesNotMatch(page, /Stop recorded/);
});

test("finding 2: an unconfirmed stop (503) posts once, says unconfirmed and never says Stop recorded", async () => {
  const { page } = await pressStop({ wireFault: failStop(503) });
  assert.match(page, /unconfirmed/i);
  assert.doesNotMatch(page, /Stop recorded/);
});

test("finding 2: a stop whose reply is lost after commit posts once, says unconfirmed and never says Stop recorded", async () => {
  const { mock, page } = await pressStop({ prepare: m => { m.faults.dropReplyAfterCommit = true; } });
  assert.deepEqual(mock.state.commits.map(c => [c.action, c.target]), [["stop", ID]], "the backend did apply it, once");
  assert.match(page, /unconfirmed/i);
  assert.doesNotMatch(page, /Stop recorded/);
});
