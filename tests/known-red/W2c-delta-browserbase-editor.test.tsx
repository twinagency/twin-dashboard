// KNOWN RED (W2c-delta findings N2, N5, N6, N12; docs/review/W2c/delta.md). jsdom render of the real ConnectionEditor
// (components/onlyfans-preview/ConnectionEditor.tsx, accountId "of-a", initiallyOpen) driven through its DOM.
// N2 trace: CE:210-213, a done job does setOwner(String(job.ownerId)) with no check against the recorded owner (data.ownerId, field locked
//   at CE:316); browserbase.ts:32-33 only checks the capture against the job's own ownerId. Logging into another OnlyFans account
//   re-points the connection. Fixed: refuse when a recorded owner exists and differs; owner unchanged; Save disabled.
//   Scope: this is a CLIENT-SIDE guard test (the status reply is stubbed with the mismatched owner). A fix that refuses server-side
//   instead (the status route rejecting a done job whose owner differs from the account's) needs its own route test that stubs the
//   backend's mismatched reply on the wire; this file would then only see the refusal, not the mismatch.
// N5 trace: CE:166-171, a start reply that lands after unmount (or pagehide / run change) is dropped by the `active`/`run` guard with no
//   cancel, so the paid Browserbase session the backend just opened is stranded until its TTL. Fixed: a stale start reply carrying a
//   jobId fires the cancel.
// N6 trace: CE:188-191, give-up (5 unreadable polls) and the wall-clock deadline call end(): bbLive=null, an UNAWAITED cancel, job marked
//   failed/expired with "was stopped" / "Start it again" copy before the cancel is confirmed. Fixed: say stopping, await the cancel,
//   report "not confirmed" if it fails, and do not invite a second paid start while the first may still run.
// N12 trace: CE:161-171, startBrowserbase leaves a ready curl/file capture in place (capture.current, captureReady), so Save stays enabled
//   for the old capture while a new Browserbase login runs. Fixed: clear the capture on start.
// Fakes:
//  - global fetch stubbed at the URL level the editor calls (GET/POST /api/onlyfans-connections/accounts/of-a[/capture-from-curl |
//    /browserbase-login | /browserbase-login/<job> | /browserbase-login/<job>/cancel]); anything else throws. The status/curl answers use
//    the route shape at e1744a90 ({capture, xHash, ownerId} in the body). When N1 / W3 p7 F1 land (capture kept server-side behind a
//    handle), move these stubs to the new shape or the N2/N12 controls go red after a correct fix.
//  - window.setTimeout/clearTimeout (jsdom) replaced by a manual queue: `tick()` runs the timers pending at that moment, so a 2 s poll
//    costs no wall time. React's scheduler and `settle()` use Node's own timers and are untouched.
//  - Router: Next's AppRouterContext.Provider with a no-op router (what useRouter() reads). jsdom lacks scrollIntoView (stubbed no-op).
//    `.css` requires answered by a require.extensions hook.
// Run: nice -n 10 node --import tsx --test --test-name-pattern='^control' tests/known-red/W2c-delta-browserbase-editor.test.tsx  (green)
//      nice -n 10 node --import tsx --test --test-skip-pattern='^control' tests/known-red/W2c-delta-browserbase-editor.test.tsx  (red)
// Synthetic values only (tests/helpers/W2c-delta-fixtures.ts); the live-view URL is put in an iframe src jsdom never loads.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { after, before, afterEach } from "node:test";
import React, { act } from "react";
import { capture, doneJob, jobId, LIVE, sentinel } from "../helpers/W2c-delta-fixtures";
const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom");
require.extensions[".css"] = (module: NodeJS.Module) => { module.exports = new Proxy({}, { get: (_target, key) => String(key) }); };

const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/onlyfans/accounts" });
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent, React, IS_REACT_ACT_ENVIRONMENT: true });

// ── Manual timer queue for the editor's window.setTimeout (poll loop) ──
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
const never: Answer = () => new Promise<Response>(() => {});
const offline: Answer = () => Promise.reject(new TypeError("synthetic network failure"));
function deferred() { let resolve!: (r: Response) => void; const promise = new Promise<Response>(r => { resolve = r; }); return { promise, resolve }; }

async function mount(opts: { ownerId: string | null; start?: Answer; polls?: Answer[]; cancel?: Answer; curl?: Answer }) {
  const calls: Call[] = [];
  const polls = [...(opts.polls ?? [])];
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = new URL(String(input), "https://fixture.invalid").pathname, method = init.method ?? "GET";
    calls.push({ method, path, body: typeof init.body === "string" ? init.body : undefined });
    if (path === ENDPOINT && method === "GET") return Response.json(connection(opts.ownerId));
    if (path === `${ENDPOINT}/capture-from-curl` && method === "POST" && opts.curl) return opts.curl();
    if (path === `${ENDPOINT}/browserbase-login` && method === "POST" && opts.start) return opts.start();
    if (path.startsWith(`${ENDPOINT}/browserbase-login/`) && path.endsWith("/cancel") && method === "POST") return (opts.cancel ?? json({ ok: true, state: "cancelled" }))();
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
const copy = () => `${bbStatus()?.textContent ?? ""} | ${notice()}`;
const saveDisabled = () => q<HTMLButtonElement>("[data-of-connection-save]")?.disabled;
async function click(selector: string) {
  const node = q(selector); assert.ok(node, `${selector} exists`);
  await act(async () => { node.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
  await settle();
}
async function type(selector: string, value: string) {
  const node = q<HTMLTextAreaElement>(selector); assert.ok(node, `${selector} exists`);
  await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value")!.set!.call(node, value); node.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
}
const startCalls = (calls: Call[]) => calls.filter(c => c.method === "POST" && c.path === `${ENDPOINT}/browserbase-login`);
const pollCalls = (calls: Call[]) => calls.filter(c => c.method === "GET" && c.path.startsWith(`${ENDPOINT}/browserbase-login/`));
const cancelCalls = (calls: Call[], job: string) => calls.filter(c => c.method === "POST" && c.path === `${ENDPOINT}/browserbase-login/${job}/cancel`);
const waiting = (job: string) => json({ schemaVersion: SCHEMA, ok: true, jobId: job, state: "waiting_login", liveViewUrl: LIVE });

// ── N2: a done job for another owner re-points the locked owner ──
test("control N2: a done job for the recorded owner reaches done, fills the owner and enables Save", async () => {
  const job = jobId();
  const calls = await mount({ ownerId: "111", start: waiting(job), polls: [json({ schemaVersion: SCHEMA, ...doneJob(job, 111) })] });
  await click("[data-of-connection-browserbase]");
  await tick();
  assert.equal(pollCalls(calls).length, 1);
  assert.equal(bbStatus()?.getAttribute("data-state"), "done");
  assert.equal(q("[data-of-connection-owner]")?.value, "111");
  assert.equal(saveDisabled(), false);
});

test("RED N2: a done job for another OnlyFans owner (222) leaves the recorded owner 111 and Save disabled", async () => {
  const job = jobId();
  const calls = await mount({ ownerId: "111", start: waiting(job), polls: [json({ schemaVersion: SCHEMA, ...doneJob(job, 222) })] });
  await click("[data-of-connection-browserbase]");
  await tick();
  assert.equal(pollCalls(calls).length, 1, "harness reached the done poll");
  assert.equal(q("[data-of-connection-owner]")?.value, "111", "the locked recorded owner was overwritten by the Browserbase login's owner");
  assert.equal(saveDisabled(), true, "Save is enabled for another account's session");
});

// ── N5: a start reply that lands after unmount strands the job ──
test("control N5: a start reply that lands while mounted is cancelled on unmount", async () => {
  const job = jobId(), reply = deferred();
  const calls = await mount({ ownerId: "111", start: () => reply.promise });
  await click("[data-of-connection-browserbase]");
  assert.equal(startCalls(calls).length, 1, "start POST in flight");
  reply.resolve(Response.json({ schemaVersion: SCHEMA, ok: true, jobId: job, state: "waiting_login", liveViewUrl: LIVE }));
  await settle();
  await act(async () => root!.unmount()); root = undefined;
  await settle();
  assert.equal(cancelCalls(calls, job).length, 1, "unmount cancels a known job");
});

test("RED N5: a start reply carrying a jobId that lands after unmount is cancelled", async () => {
  const job = jobId(), reply = deferred();
  const calls = await mount({ ownerId: "111", start: () => reply.promise });
  await click("[data-of-connection-browserbase]");
  assert.equal(startCalls(calls).length, 1, "start POST in flight");
  await act(async () => root!.unmount()); root = undefined;
  reply.resolve(Response.json({ schemaVersion: SCHEMA, ok: true, jobId: job, state: "waiting_login", liveViewUrl: LIVE }));
  await settle(); await settle();
  assert.equal(cancelCalls(calls, job).length, 1, "the paid session started by a late reply was never cancelled");
});

// ── N6: give-up / deadline claim "stopped" before the cancel is confirmed ──
const unreadable = json({ schemaVersion: SCHEMA, ok: false, outcome: "refused", error: "The Browserbase login status could not be read." }, 503);
async function giveUp(cancel: Answer) {
  const job = jobId();
  const calls = await mount({ ownerId: "111", start: waiting(job), polls: Array(5).fill(unreadable), cancel });
  await click("[data-of-connection-browserbase]");
  for (let i = 0; i < 5; i++) await tick();
  return { job, calls };
}

test("control N6: five unreadable polls reach the give-up path and send one cancel", async () => {
  const { job, calls } = await giveUp(never);
  assert.equal(pollCalls(calls).length, 5);
  assert.equal(cancelCalls(calls, job).length, 1);
});

test("RED N6: while the give-up cancel is unanswered the UI does not say the login ended or invite a new start", async () => {
  const { job, calls } = await giveUp(never);
  assert.equal(cancelCalls(calls, job).length, 1, "harness reached give-up");
  assert.doesNotMatch(copy(), /was stopped|Start it again|login failed/i, "the job is reported ended while its cancel is unconfirmed (a second paid start is invited)");
});

test("RED N6: a give-up cancel that fails (network) is reported as not confirmed", async () => {
  const { job, calls } = await giveUp(offline);
  assert.equal(cancelCalls(calls, job).length, 1, "harness reached give-up");
  assert.match(copy(), /(not|n't|could not be) confirmed|unconfirmed/i, "a failed cancel is silently treated as stopped");
});

async function pastDeadline(cancel: Answer) {
  const job = jobId();
  const calls = await mount({ ownerId: "111", start: waiting(job), cancel });
  await click("[data-of-connection-browserbase]");
  const realNow = Date.now;
  Date.now = () => realNow() + 11 * 60_000 + 1_000;
  try { await tick(); } finally { Date.now = realNow; }
  return { job, calls };
}

test("control N6: past the wall-clock deadline the editor stops polling and sends one cancel", async () => {
  const { job, calls } = await pastDeadline(never);
  assert.equal(pollCalls(calls).length, 0);
  assert.equal(cancelCalls(calls, job).length, 1);
});

test("RED N6: past the deadline, with the cancel unanswered, the copy does not say the login was stopped", async () => {
  const { job, calls } = await pastDeadline(never);
  assert.equal(cancelCalls(calls, job).length, 1, "harness reached the deadline path");
  assert.doesNotMatch(copy(), /was stopped/i, "'was stopped' shown before the cancel is confirmed");
});

// ── N12: starting Browserbase leaves an older curl capture saveable ──
const curlReply = (owner: number) => json({ schemaVersion: SCHEMA, ok: true, capture: capture(owner), xHash: sentinel("xh"), ownerId: owner });
async function curlThenBrowserbase(job: string) {
  const calls = await mount({ ownerId: "111", curl: curlReply(111), start: waiting(job) });
  await click("[data-of-connection-method=extension] input");
  await type("[data-of-connection-curl]", `curl 'https://example.invalid/api2/v2/users/me' -H 'synthetic: ${sentinel()}'`);
  await click("[data-of-connection-curl-apply]");
  return calls;
}

test("control N12: a converted curl makes the capture ready and Save enabled", async () => {
  const calls = await curlThenBrowserbase(jobId());
  assert.equal(calls.filter(c => c.path === `${ENDPOINT}/capture-from-curl`).length, 1);
  assert.equal(saveDisabled(), false);
});

test("RED N12: starting a Browserbase login clears the earlier curl capture (Save disabled while it runs)", async () => {
  const job = jobId();
  const calls = await curlThenBrowserbase(job);
  assert.equal(saveDisabled(), false, "curl capture ready before the start");
  await click("[data-of-connection-method=browser] input");
  await click("[data-of-connection-browserbase]");
  assert.equal(startCalls(calls).length, 1, "Browserbase start POST made");
  assert.equal(bbStatus()?.getAttribute("data-state"), "waiting_login");
  assert.equal(saveDisabled(), true, "Save still saves the old curl capture while a new Browserbase login runs");
});
