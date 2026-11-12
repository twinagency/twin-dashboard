// Rule (promoted from known-red W2 team-351 F1 and W2c-delta N2): a capture converted from a pasted curl or a Browserbase login is
// held only when its owner matches the recorded owner (data.ownerId) or the owner typed in, the rule chooseCapture applies to a file.
// A mismatch keeps the owner, holds no capture, leaves Save disabled and says why. jsdom render of the real ConnectionEditor
// (accountId "of-a", initiallyOpen) driven through its DOM.
// Fakes: global fetch stubbed at the URL level the editor calls (GET/POST /api/onlyfans-connections/accounts/of-a[/capture-from-curl |
// /browserbase-login | /browserbase-login/<job>]); anything else throws. window.setTimeout/clearTimeout (jsdom) are a manual queue, so
// `tick()` runs one Browserbase poll step with no wall time. Router: Next's AppRouterContext.Provider with a no-op router. `.css`
// requires answered by a require.extensions hook. Synthetic values only (tests/helpers/W2-F1-N2-owner-guard-fixtures.ts).
// Run: nice -n 10 node --import tsx --test tests/rules/W2-F1-N2-owner-guard.test.tsx
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { after, afterEach, before } from "node:test";
import React, { act } from "react";
import { capture, doneJob, jobId, LIVE, sentinel } from "../helpers/W2-F1-N2-owner-guard-fixtures";
const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom");
require.extensions[".css"] = (module: NodeJS.Module) => { module.exports = new Proxy({}, { get: (_target, key) => String(key) }); };

const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/onlyfans/accounts" });
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent, React, IS_REACT_ACT_ENVIRONMENT: true });

let timers = new Map<number, () => void>(), nextTimer = 1;
dom.window.setTimeout = ((fn: () => void) => { const id = nextTimer++; timers.set(id, fn); return id; }) as typeof dom.window.setTimeout;
dom.window.clearTimeout = ((id: number) => { timers.delete(id); }) as typeof dom.window.clearTimeout;
const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
/** Runs every editor timer pending now (one poll step), then lets fetches and renders settle. */
async function tick() { const due = [...timers.values()]; timers.clear(); await act(async () => { for (const fn of due) fn(); }); await settle(); }

let createRoot: typeof import("react-dom/client").createRoot;
let AppRouterContext: React.Context<unknown>;
let root: ReturnType<typeof createRoot> | undefined;
before(async () => {
  ({ createRoot } = await import("react-dom/client"));
  ({ AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime") as unknown as { AppRouterContext: React.Context<unknown> });
});
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; timers.clear(); });
after(() => dom.window.close());

const ACCOUNT = "of-a", ENDPOINT = `/api/onlyfans-connections/accounts/${ACCOUNT}`, SCHEMA = "of-connections.v1";
const connection = (ownerId: string | null) => ({ schemaVersion: SCHEMA, ok: true, connection: { accountId: ACCOUNT, revision: 3, status: "pending", ownerId,
  expiresAt: null, verifiedAt: null, lastError: null, outgoingEnabled: false, policyRevision: 0, usedUnits: 0, limitUnits: 0, mediaEnabled: false,
  automateNewConversations: false } });
type Answer = () => Response | Promise<Response>;
type Call = { method: string; path: string; body?: string };
const json = (body: unknown, status = 200): Answer => () => Response.json(body, { status });

async function mount(opts: { ownerId: string | null; curl?: Answer; start?: Answer; polls?: Answer[] }) {
  const calls: Call[] = [];
  const polls = [...(opts.polls ?? [])];
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = new URL(String(input), "https://fixture.invalid").pathname, method = init.method ?? "GET";
    calls.push({ method, path, body: typeof init.body === "string" ? init.body : undefined });
    if (path === ENDPOINT && method === "GET") return Response.json(connection(opts.ownerId));
    if (path === `${ENDPOINT}/capture-from-curl` && method === "POST" && opts.curl) return opts.curl();
    if (path === `${ENDPOINT}/browserbase-login` && method === "POST" && opts.start) return opts.start();
    if (path.startsWith(`${ENDPOINT}/browserbase-login/`) && method === "GET") { const next = polls.shift(); if (next) return next(); }
    throw new Error(`unexpected fetch ${method} ${path}`);
  }) as typeof fetch;
  const router = { refresh() {}, push() {}, replace() {}, back() {}, forward() {}, prefetch() {} };
  const { default: ConnectionEditor } = await import("../../components/onlyfans-preview/ConnectionEditor");
  if (root) await act(async () => root!.unmount());
  timers.clear();
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(<AppRouterContext.Provider value={router}><ConnectionEditor accountId={ACCOUNT} initiallyOpen /></AppRouterContext.Provider>); });
  await settle();
  assert.ok(q("[data-of-connection-owner]"), "editor form rendered");
  return calls;
}
const q = <T extends Element = HTMLInputElement>(selector: string) => document.querySelector<T>(selector);
const notice = () => q("[data-of-connection-notice]")?.textContent ?? "";
const bbStatus = () => q("[data-of-connection-browserbase-status]");
const saveDisabled = () => q<HTMLButtonElement>("[data-of-connection-save]")?.disabled;
async function click(selector: string) {
  const node = q(selector); assert.ok(node, `${selector} exists`);
  await act(async () => { node.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
  await settle();
}
async function type(selector: string, value: string) {
  const node = q<HTMLInputElement | HTMLTextAreaElement>(selector); assert.ok(node, `${selector} exists`);
  assert.equal(node.disabled, false, `${selector} is enabled`);
  const proto = node.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(node, value); node.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
}
async function pasteAndApply() {
  await click("[data-of-connection-method=extension] input");
  await type("[data-of-connection-curl]", `curl 'https://example.invalid/api2/v2/users/me' -H 'synthetic: ${sentinel()}'`);
  await click("[data-of-connection-curl-apply]");
}
const REF = `ref_${sentinel("cap").replace(/-/g, "_")}`;
const conversion = (owner: number) => ({ schemaVersion: SCHEMA, ok: true, capture: capture(owner), xHash: sentinel("xh"), ownerId: owner, captureId: REF });
const curlCalls = (calls: Call[]) => calls.filter(c => c.method === "POST" && c.path === `${ENDPOINT}/capture-from-curl`);
const pollCalls = (calls: Call[]) => calls.filter(c => c.method === "GET" && c.path.startsWith(`${ENDPOINT}/browserbase-login/`));
const waiting = (job: string) => json({ schemaVersion: SCHEMA, ok: true, jobId: job, state: "waiting_login", liveViewUrl: LIVE });

// ── F1: pasted curl ──
test("control: a curl for the recorded owner fills the owner, holds the capture by ref (X-Hash disabled) and enables Save", async () => {
  const reply = conversion(111);
  const calls = await mount({ ownerId: "111", curl: json(reply) });
  await pasteAndApply();
  assert.equal(curlCalls(calls).length, 1, "one conversion POST");
  assert.deepEqual(Object.keys(JSON.parse(curlCalls(calls)[0].body!)), ["curl"]);
  assert.equal(q("[data-of-connection-owner]")?.value, "111");
  assert.equal(q("[data-of-connection-hash]")?.value, ""); assert.equal(q("[data-of-connection-hash]")?.disabled, true);
  assert.equal(saveDisabled(), false, "capture accepted, Save enabled");
});

test("control: a curl on an unbound account with no owner typed fills the owner and enables Save", async () => {
  await mount({ ownerId: null, curl: json(conversion(222)) });
  await pasteAndApply();
  assert.equal(q("[data-of-connection-owner]")?.value, "222");
  assert.equal(saveDisabled(), false);
});

test("control: a failed conversion leaves no capture and Save disabled", async () => {
  await mount({ ownerId: "111", curl: json({ schemaVersion: SCHEMA, ok: false, error: "The connection outcome is not confirmed." }, 502) });
  await pasteAndApply();
  assert.equal(q("[data-of-connection-hash]")?.value, "");
  assert.equal(saveDisabled(), true);
});

test("F1: a curl that converts to another owner (222) is refused on an account recorded for owner 111", async () => {
  await mount({ ownerId: "111", curl: json(conversion(222)) });
  await pasteAndApply();
  assert.equal(q("[data-of-connection-owner]")?.value, "111", "the locked recorded owner must not change");
  assert.equal(saveDisabled(), true, "the other creator's capture must not be accepted (Save stays disabled)");
  assert.match(notice(), /another OnlyFans account/, "the refusal is explained");
  assert.doesNotMatch(notice(), /—/, "no em dash in UI copy");
});

test("F1: on an unbound account with owner 111 typed in, a curl that converts to 222 is refused", async () => {
  await mount({ ownerId: null, curl: json(conversion(222)) });
  await type("[data-of-connection-owner]", "111");
  await pasteAndApply();
  assert.equal(q("[data-of-connection-owner]")?.value, "111", "the typed owner must not be overwritten");
  assert.equal(saveDisabled(), true, "the other creator's capture must not be accepted (Save stays disabled)");
  assert.match(notice(), /another OnlyFans account/, "the refusal is explained");
});

// ── N2: Browserbase done job ──
test("control N2: a done job for the recorded owner reaches done, fills the owner and enables Save", async () => {
  const job = jobId();
  const calls = await mount({ ownerId: "111", start: waiting(job), polls: [json({ schemaVersion: SCHEMA, ...doneJob(job, 111), captureId: REF })] });
  await click("[data-of-connection-browserbase]");
  await tick();
  assert.equal(pollCalls(calls).length, 1);
  assert.equal(bbStatus()?.getAttribute("data-state"), "done");
  assert.equal(q("[data-of-connection-owner]")?.value, "111");
  assert.equal(saveDisabled(), false);
});

test("N2: a done job for another OnlyFans owner (222) leaves the recorded owner 111 and Save disabled", async () => {
  const job = jobId();
  const calls = await mount({ ownerId: "111", start: waiting(job), polls: [json({ schemaVersion: SCHEMA, ...doneJob(job, 222), captureId: REF })] });
  await click("[data-of-connection-browserbase]");
  await tick();
  assert.equal(pollCalls(calls).length, 1, "harness reached the done poll");
  assert.equal(q("[data-of-connection-owner]")?.value, "111", "the locked recorded owner was overwritten by the Browserbase login's owner");
  assert.equal(saveDisabled(), true, "Save is enabled for another account's session");
  assert.match(notice(), /another OnlyFans account/, "the refusal is explained");
  assert.notEqual(bbStatus()?.getAttribute("data-state"), "done", "the status must not say the session was captured");
});
