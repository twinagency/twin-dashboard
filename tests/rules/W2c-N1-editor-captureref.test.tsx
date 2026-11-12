// Rule (W2c N1, step 3a of 3): curl and Browserbase captures are held only by the server-side handle (`captureId`); any capture/xHash
// in those replies is ignored and a reply without captureId is refused. Save sends payload.captureRef and no capture/xHash, the X-Hash
// field is disabled (the server takes xHash from the stored capture), and a 410 capture_expired clears only the ref, with no retry.
// A session file is the one raw-capture path left. Harness as tests/rules/W2-F1-N2-owner-guard.test.tsx (which also runs the owner
// guard with captureId replies). Synthetic values only. Run: nice -n 10 node --import tsx --test tests/rules/W2c-N1-editor-captureref.test.tsx
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
const timers = new Map<number, () => void>(); let nextTimer = 1;
dom.window.setTimeout = ((fn: () => void) => { const id = nextTimer++; timers.set(id, fn); return id; }) as typeof dom.window.setTimeout;
dom.window.clearTimeout = ((id: number) => { timers.delete(id); }) as typeof dom.window.clearTimeout;
const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
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

const ACCOUNT = "of-a", ENDPOINT = `/api/onlyfans-connections/accounts/${ACCOUNT}`, SCHEMA = "of-connections.v1", OWNER = 111;
const REF = `ref_${sentinel("cap").replace(/-/g, "_")}`;
const connection = { schemaVersion: SCHEMA, ok: true, connection: { accountId: ACCOUNT, revision: 3, status: "pending", ownerId: String(OWNER),
  expiresAt: null, verifiedAt: null, lastError: null, outgoingEnabled: false, policyRevision: 0, usedUnits: 0, limitUnits: 0, mediaEnabled: false,
  automateNewConversations: false } };
type Answer = () => Response;
type Call = { method: string; path: string; body?: string };
const json = (body: unknown, status = 200): Answer => () => Response.json(body, { status });
const ack = json({ schemaVersion: SCHEMA, ok: true, applied: true, accountId: ACCOUNT, commandKey: "a".repeat(64), recordedRevision: 4, action: "save" });
const expired = json({ schemaVersion: SCHEMA, ok: false, code: "capture_expired", error: "That capture expired. Capture the session again." }, 410);

async function mount(opts: { curl?: Answer[]; start?: Answer; polls?: Answer[]; saves?: Answer[]; refreshAfterSave?: Answer }) {
  let saved = false; const calls: Call[] = [], curls = [...opts.curl ?? []], polls = [...opts.polls ?? []], saves = [...opts.saves ?? []];
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = new URL(String(input), "https://fixture.invalid").pathname, method = init.method ?? "GET";
    calls.push({ method, path, body: typeof init.body === "string" ? init.body : undefined });
    const next = (queue: Answer[]) => { const answer = queue.shift(); if (!answer) throw new Error(`unexpected fetch ${method} ${path}`); return answer(); };
    if (path === ENDPOINT && method === "GET") return saved && opts.refreshAfterSave ? opts.refreshAfterSave() : Response.json(connection);
    if (path === ENDPOINT && method === "POST") { saved = true; return next(saves); }
    if (path === `${ENDPOINT}/capture-from-curl` && method === "POST") return next(curls);
    if (path === `${ENDPOINT}/browserbase-login` && method === "POST" && opts.start) return opts.start();
    if (path.startsWith(`${ENDPOINT}/browserbase-login/`) && method === "GET") return next(polls);
    throw new Error(`unexpected fetch ${method} ${path}`);
  }) as typeof fetch;
  const router = { refresh() {}, push() {}, replace() {}, back() {}, forward() {}, prefetch() {} };
  const { default: ConnectionEditor } = await import("../../components/onlyfans-preview/ConnectionEditor");
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(<AppRouterContext.Provider value={router}><ConnectionEditor accountId={ACCOUNT} initiallyOpen /></AppRouterContext.Provider>); });
  await settle();
  return calls;
}
const q = <T extends Element = HTMLInputElement>(selector: string) => document.querySelector<T>(selector);
const notice = () => q("[data-of-connection-notice]")?.textContent ?? "";
const hash = () => q("[data-of-connection-hash]")!;
const saveDisabled = () => q<HTMLButtonElement>("[data-of-connection-save]")?.disabled;
async function click(selector: string) {
  const node = q(selector); assert.ok(node, `${selector} exists`);
  await act(async () => { node.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); }); await settle();
}
async function type(selector: string, value: string) {
  const node = q<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  const proto = node.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(node, value); node.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
}
async function pasteAndApply() {
  await click("[data-of-connection-method=extension] input");
  await type("[data-of-connection-curl]", `curl 'https://example.invalid/api2/v2/users/me' -H 'synthetic: ${sentinel()}'`);
  await click("[data-of-connection-curl-apply]");
}
const refReply = (extra = {}) => json({ schemaVersion: SCHEMA, ok: true, ownerId: OWNER, captureId: REF, ...extra });
const posted = (calls: Call[]) => calls.filter(c => c.method === "POST" && c.path === ENDPOINT).map(c => JSON.parse(c.body!) as { payload: Record<string, unknown> });
function assertRefSave(calls: Call[]) {
  const [sent] = posted(calls); assert.ok(sent, "Save posted a command (not a silent no-op)");
  assert.equal(sent.payload.captureRef, REF);
  assert.equal("capture" in sent.payload, false, "no capture in the body"); assert.equal("xHash" in sent.payload, false, "no xHash in the body");
}

for (const [shape, extra] of [["no capture", {}], ["capture + xHash too (ignored)", { capture: capture(OWNER), xHash: sentinel("xh") }]] as const)
test(`a curl reply with captureId and ${shape}: X-Hash disabled, Save sends captureRef only`, async () => {
  const calls = await mount({ curl: [refReply(extra)], saves: [ack] });
  await pasteAndApply(); assert.equal(hash().value, "", "no X-Hash held in ref mode");
  assert.equal(q("[data-of-connection-owner]")?.value, String(OWNER));
  assert.equal(hash().disabled, true, "X-Hash is taken from the stored capture"); assert.equal(saveDisabled(), false);
  assert.match(notice(), /^Curl applied: session captured and owner filled in\./);
  await click("[data-of-connection-save]");
  assertRefSave(calls); assert.match(notice(), /Credential save recorded/);
});

test("a curl reply without captureId (capture + xHash only) holds nothing", async () => {
  await mount({ curl: [json({ schemaVersion: SCHEMA, ok: true, capture: capture(OWNER), xHash: sentinel("xh"), ownerId: OWNER })] });
  await pasteAndApply(); assert.match(notice(), /could not be used/); assert.equal(hash().value, ""); assert.equal(saveDisabled(), true);
});

test("a done Browserbase job with captureId and no capture is held, not cancelled, and Save sends captureRef", async () => {
  const job = jobId(), { capture: _c, xHash: _x, ...done } = doneJob(job, OWNER);
  const calls = await mount({ start: json({ schemaVersion: SCHEMA, ok: true, jobId: job, state: "waiting_login", liveViewUrl: LIVE }),
    polls: [json({ schemaVersion: SCHEMA, ...done, captureId: REF })], saves: [ack] });
  await click("[data-of-connection-browserbase]"); await tick();
  assert.equal(q("[data-of-connection-browserbase-status]")?.getAttribute("data-state"), "done");
  assert.equal(calls.some(c => c.path.endsWith("/cancel")), false, "the job is not cancelled");
  assert.equal(hash().disabled, true); assert.equal(saveDisabled(), false);
  await click("[data-of-connection-save]");
  assertRefSave(calls);
});

const EXPIRED = "That capture expired. If an earlier attempt may have saved, check the status below. Otherwise capture the session again.";
test("410 capture_expired: says so, offers no retry, clears only the capture (typed proxy kept) and refreshes the status", async () => {
  const calls = await mount({ curl: [refReply()], saves: [expired] });
  await pasteAndApply(); await type("[data-of-connection-proxy]", "http://user:pass@proxy.invalid:8080"); await click("[data-of-connection-save]");
  assertRefSave(calls);
  assert.equal(notice(), EXPIRED); assert.doesNotMatch(notice(), /—/);
  assert.equal(q("[data-of-connection-retry]"), null, "no Retry same command");
  assert.equal(saveDisabled(), true, "the capture is cleared"); assert.equal(hash().disabled, false, "ref mode ended");
  assert.equal(q("[data-of-connection-proxy]")?.value, "http://user:pass@proxy.invalid:8080", "typed proxy kept");
  const save = calls.findIndex(c => c.method === "POST" && c.path === ENDPOINT);
  assert.ok(calls.slice(save + 1).some(c => c.method === "GET" && c.path === ENDPOINT), "status refreshed after the 410");
});
test("410 capture_expired keeps its notice when the follow-up status refresh fails", async () => {
  await mount({ curl: [refReply()], saves: [expired], refreshAfterSave: json({ ok: false }, 500) });
  await pasteAndApply(); await click("[data-of-connection-save]"); assert.equal(notice(), EXPIRED);
});

test("an unconfirmed ref save retries the exact same captureRef", async () => {
  const calls = await mount({ curl: [refReply()], saves: [json({ ok: false }, 502), ack] });
  await pasteAndApply(); await click("[data-of-connection-save]"); await click("[data-of-connection-retry]");
  const sent = posted(calls); assert.equal(sent.length, 2); assert.deepEqual(sent[1], sent[0]); assert.equal(sent[1].payload.captureRef, REF);
});

test("control: a session file (here after a curl ref) saves its own capture and the typed X-Hash, no captureRef", async () => {
  const held = capture(OWNER), calls = await mount({ curl: [refReply()], saves: [ack] });
  await pasteAndApply(); await click("[data-of-connection-method=file] input");
  const input = q("[data-of-connection-capture]")!;
  Object.defineProperty(input, "files", { value: [new File([JSON.stringify(held)], "capture.json", { type: "application/json" })] });
  await act(async () => { input.dispatchEvent(new dom.window.Event("change", { bubbles: true })); }); await settle();
  assert.equal(hash().disabled, false, "ref mode ended"); await type("[data-of-connection-hash]", "synthetic-file-hash");
  await click("[data-of-connection-save]");
  const [sent] = posted(calls); assert.ok(sent); assert.equal("captureRef" in sent.payload, false); assert.deepEqual(sent.payload.capture, held);
  assert.equal(sent.payload.xHash, "synthetic-file-hash");
});
