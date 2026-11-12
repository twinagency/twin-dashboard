/** Browserbase login: contract parsing, backend adapter, route gating, and the ConnectionEditor flow in an offline DOM. No network. */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test, { after, before } from "node:test";
import React, { act } from "react";
const { JSDOM } = createRequire(import.meta.url)("jsdom");

const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/onlyfans/accounts" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent, React, IS_REACT_ACT_ENVIRONMENT: true });
dom.window.HTMLElement.prototype.scrollIntoView = () => {}; // jsdom has no layout
createRequire(import.meta.url).extensions[".css"] = module => { module.exports = {}; };
let createRoot: typeof import("react-dom/client").createRoot;
let AppRouterContext: React.Context<unknown>;
let root: ReturnType<typeof createRoot> | undefined;
before(async () => {
  ({ createRoot } = await import("react-dom/client"));
  ({ AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime") as unknown as { AppRouterContext: React.Context<unknown> });
});
after(async () => { await act(async () => root?.unmount()); dom.window.close(); });
const q = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector);
const settle = async (ms = 25) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
const click = async (element: Element | null) => { assert.ok(element, "element to click exists"); await act(async () => { element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 25)); }); };
const repo = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => readFileSync(path.join(repo, file), "utf8");

const OWNER = 99123456, ACCOUNT = `of-${OWNER}`, JOB = "bbjob_0123456789abcdef";
const LIVE = "https://www.browserbase.com/devtools-fullscreen/inspector.html?wss=connect.browserbase.com/debug/synthetic";
const capture = { headers: { user_id: String(OWNER), user_agent: "Synthetic test agent", x_bc: "synthetic-bc", x_of_rev: "synthetic-rev" },
  signing: { rules: { static_param: "synthetic-static", start: "synthetic-start", end: "synthetic-end", checksum_indexes: Array(32).fill(1), checksum_constant: 1 } },
  cookies: [{ name: "sess", value: "synthetic-session", domain: ".onlyfans.com", path: "/" }] };
const connection = { accountId: ACCOUNT, revision: 1, status: "unconfigured", ownerId: null, expiresAt: null, verifiedAt: null,
  lastError: null, outgoingEnabled: false, policyRevision: 0, usedUnits: 0, limitUnits: 0, mediaEnabled: false, automateNewConversations: false };

test("job ids and live view URLs are validated strictly", async () => {
  const { browserbaseJobId, browserbaseLiveViewUrl, parseBrowserbaseJob } = await import("../../lib/onlyfans-connections/browserbase");
  assert.equal(browserbaseJobId(JOB), JOB);
  assert.equal(browserbaseJobId("3f2b8c1e-1d2a-4b5c-9e8f-0a1b2c3d4e5f"), "3f2b8c1e-1d2a-4b5c-9e8f-0a1b2c3d4e5f");
  for (const bad of ["", "short", "../../etc/passwd", "a".repeat(129), "job id with spaces", "job%2Fslash", "job/slash/abc", null, 12345678])
    assert.equal(browserbaseJobId(bad), null, `accepted ${String(bad)}`);
  assert.equal(browserbaseLiveViewUrl(LIVE), LIVE);
  assert.equal(browserbaseLiveViewUrl("https://sub.browserbase.com/x"), "https://sub.browserbase.com/x");
  for (const bad of ["http://www.browserbase.com/x", "https://browserbase.com.evil.invalid/x", "https://evilbrowserbase.com/x", "javascript:alert(1)", "https://user:pw@www.browserbase.com/x", "https://www.browserbase.com:8443/x"])
    assert.equal(browserbaseLiveViewUrl(bad), null, `accepted ${bad}`);
  assert.deepEqual(parseBrowserbaseJob({ ok: true, jobId: JOB, state: "waiting_login", liveViewUrl: LIVE }, JOB),
    { jobId: JOB, state: "waiting_login", liveViewUrl: LIVE, error: null, capture: null, xHash: null, ownerId: null });
  assert.equal(parseBrowserbaseJob({ ok: true, jobId: JOB, state: "waiting_login", liveViewUrl: LIVE }, "bbjob_other_job_0001"), null, "echoed job mismatch");
  assert.equal(parseBrowserbaseJob({ ok: true, jobId: JOB, state: "mystery", liveViewUrl: LIVE }), null);
  assert.equal(parseBrowserbaseJob({ ok: true, jobId: JOB, state: "waiting_login", liveViewUrl: "https://evil.invalid/x" }), null);
  const done = parseBrowserbaseJob({ ok: true, jobId: JOB, state: "done", liveViewUrl: LIVE, capture, xHash: "synthetic-hash", ownerId: OWNER });
  assert.equal(done?.ownerId, OWNER); assert.equal(done?.xHash, "synthetic-hash");
  assert.equal(parseBrowserbaseJob({ ok: true, jobId: JOB, state: "done", liveViewUrl: LIVE, capture, xHash: "synthetic-hash", ownerId: OWNER + 1 }), null, "capture/owner mismatch");
  assert.equal(parseBrowserbaseJob({ ok: true, jobId: JOB, state: "done", liveViewUrl: LIVE }), null, "done without capture");
  const failed = parseBrowserbaseJob({ ok: true, jobId: JOB, state: "failed", liveViewUrl: null, error: "OF login\nrejected\u0000: “captcha” " + "x".repeat(400) });
  assert.ok(failed, "an unprintable or long error does not reject the job");
  assert.equal(failed.state, "failed"); assert.equal(failed.error?.length, 300);
  assert.match(failed.error ?? "", /^OF login rejected : {1}.captcha. x+$/);
});

test("backend adapter calls the account-scoped Browserbase paths and surfaces the unconfigured code", async () => {
  const { createConnectionBackend } = await import("../../lib/onlyfans-connections/backend");
  const calls: Array<{ method: string; url: string; body: string | undefined }> = [];
  let startStatus = 200;
  const backend = createConnectionBackend({ baseUrl: "http://backend.invalid/", token: "synthetic-connection-only", fetchImpl: async (url, init) => {
    calls.push({ method: String(init?.method), url: String(url), body: init?.body ? String(init.body) : undefined });
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer synthetic-connection-only");
    const u = String(url);
    if (u.endsWith("/browserbase-login") && startStatus === 429) return Response.json({ ok: false, code: "browserbase_busy", error: "3 sessions running" }, { status: 429 });
    if (u.endsWith("/browserbase-login") && startStatus === 503) return Response.json({ ok: false, code: "browserbase_unconfigured", error: "BROWSERBASE_API_KEY missing" }, { status: 503 });
    if (u.endsWith("/browserbase-login")) return Response.json({ ok: true, jobId: JOB, state: "starting", liveViewUrl: LIVE });
    if (u.endsWith("/cancel")) return Response.json({ ok: true, state: "cancelled" });
    return Response.json({ ok: true, jobId: JOB, state: "done", liveViewUrl: LIVE, capture, xHash: "synthetic-hash", ownerId: OWNER });
  } });
  const base = `http://backend.invalid/onlyfans/connection/v1/accounts/${ACCOUNT}/browserbase-login`;
  const started = await backend.browserbaseStart(ACCOUNT);
  assert.ok(started.ok); assert.equal(started.data.jobId, JOB);
  assert.deepEqual(calls[0], { method: "POST", url: base, body: "{}" });
  const status = await backend.browserbaseStatus(ACCOUNT, JOB);
  assert.ok(status.ok); assert.equal(status.data.state, "done"); assert.equal(calls[1].method, "GET"); assert.equal(calls[1].url, `${base}/${JOB}`);
  const cancelled = await backend.browserbaseCancel(ACCOUNT, JOB);
  assert.ok(cancelled.ok); assert.equal(cancelled.data.state, "cancelled"); assert.deepEqual(calls[2], { method: "POST", url: `${base}/${JOB}/cancel`, body: "{}" });
  startStatus = 503;
  const unconfigured = await backend.browserbaseStart(ACCOUNT);
  assert.ok(!unconfigured.ok); assert.equal(unconfigured.status, 503); assert.equal(unconfigured.code, "browserbase_unconfigured");
  assert.doesNotMatch(unconfigured.error, /BROWSERBASE_API_KEY/, "backend detail is not forwarded");
  startStatus = 429;
  const busy = await backend.browserbaseStart(ACCOUNT);
  assert.ok(!busy.ok); assert.equal(busy.status, 429); assert.equal(busy.code, "browserbase_busy");
  assert.equal(busy.error, "Too many Browserbase logins are running. Try again in a few minutes.");
});

test("CI runs this file through test:offline", () => {
  const scripts = JSON.parse(read("package.json")).scripts as Record<string, string>;
  assert.equal(scripts["test:browserbase-login"], "node --import tsx --test tests/components/browserbase-login.test.tsx");
  assert.match(scripts["test:offline"], /npm run test:browserbase-login(?: |$)/);
});

test("the proxy routes exist, gate every handler with the operator session, and validate the job id", () => {
  const dir = "app/api/onlyfans-connections/accounts/[accountId]/browserbase-login";
  const routes: Array<[string, string, RegExp]> = [[`${dir}/route.ts`, "POST", /connectionCommandContext\(request\)/],
    [`${dir}/[jobId]/route.ts`, "GET", /connectionSessionContext\(request\)/], [`${dir}/[jobId]/cancel/route.ts`, "POST", /connectionCommandContext\(request\)/]];
  for (const [file, method, gate] of routes) {
    assert.ok(existsSync(path.join(repo, file)), `${file} exists`);
    const source = read(file);
    assert.match(source, new RegExp(`export async function ${method}\\(`), `${file} exports ${method}`);
    assert.match(source, gate, `${file} is gated`);
    assert.match(source, /requestId\(/, `${file} validates the account id`);
    if (file.includes("[jobId]")) assert.match(source, /browserbaseJobId\(/, `${file} validates the job id`);
    if (method === "POST") assert.match(source, /Object\.keys\(body\)\.length/, `${file} accepts only an empty body`);
  }
});

type Reply = { status?: number; body: unknown };
async function mountEditor(replies: { start: Reply; polls?: Reply[]; cancel?: Reply }) {
  const calls: Array<{ method: string; path: string; body?: string }> = [];
  const polls = [...(replies.polls ?? [])];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "https://fixture.invalid"), method = init?.method ?? "GET";
    calls.push({ method, path: url.pathname, body: init?.body ? String(init.body) : undefined });
    const send = (r: Reply) => Response.json(r.body, { status: r.status ?? 200 });
    if (url.pathname === `/api/onlyfans-connections/accounts/${ACCOUNT}`) return send({ body: { schemaVersion: "of-connections.v1", ok: true, connection } });
    if (url.pathname.endsWith("/browserbase-login") && method === "POST") return send(replies.start);
    if (url.pathname.endsWith("/cancel") && method === "POST") return send(replies.cancel ?? { body: { ok: true, state: "cancelled" } });
    if (url.pathname.includes("/browserbase-login/") && method === "GET") return send(polls.shift() ?? { body: { ok: true, jobId: JOB, state: "waiting_login", liveViewUrl: LIVE } });
    return new Response(null, { status: 404 });
  }) as typeof fetch;
  const router = { refresh() {}, push() {}, replace() {}, back() {}, forward() {}, prefetch() {} };
  const { default: ConnectionEditor } = await import("../../components/onlyfans-preview/ConnectionEditor");
  if (root) await act(async () => root!.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(<AppRouterContext.Provider value={router}><ConnectionEditor accountId={ACCOUNT} initiallyOpen /></AppRouterContext.Provider>); });
  await settle();
  return calls;
}
const notice = () => q("[data-of-connection-notice]")?.textContent ?? "";

test("start, poll every 2s, done: capture, X-Hash and owner are filled and the live view is gone", async () => {
  const calls = await mountEditor({ start: { body: { ok: true, jobId: JOB, state: "starting", liveViewUrl: LIVE } },
    polls: [{ body: { ok: true, jobId: JOB, state: "waiting_login", liveViewUrl: LIVE } },
      { body: { ok: true, jobId: JOB, state: "done", liveViewUrl: LIVE, capture, xHash: "synthetic-bb-hash", ownerId: OWNER } }] });
  await click(q("[data-of-connection-browserbase]"));
  const frame = q<HTMLIFrameElement>("[data-of-connection-browserbase-frame]");
  assert.ok(frame, "live view is embedded");
  assert.equal(frame.getAttribute("src"), LIVE);
  assert.equal(frame.getAttribute("sandbox"), "allow-scripts allow-same-origin allow-forms allow-popups");
  assert.equal(q("[data-of-connection-browserbase-open]")?.getAttribute("href"), LIVE);
  assert.equal(q("[data-of-connection-browserbase-open]")?.getAttribute("target"), "_blank");
  assert.match(q("[data-of-connection-browserbase-status]")?.textContent ?? "", /Starting/);
  assert.equal(calls.filter(c => c.method === "GET" && c.path.includes("/browserbase-login/")).length, 0, "no poll before 2s");
  await settle(2100);
  assert.match(q("[data-of-connection-browserbase-status]")?.textContent ?? "", /Sign in to OnlyFans/);
  await settle(2100);
  const polled = calls.filter(c => c.method === "GET" && c.path.includes("/browserbase-login/"));
  assert.equal(polled.length, 2); assert.equal(polled[0].path, `/api/onlyfans-connections/accounts/${ACCOUNT}/browserbase-login/${JOB}`);
  assert.equal(notice(), "Logged in via Browserbase: capture, X-Hash and owner filled in. Set the proxy and window if needed, then Save credentials.");
  assert.equal(q<HTMLInputElement>("[data-of-connection-hash]")?.value, "synthetic-bb-hash");
  assert.equal(q<HTMLInputElement>("[data-of-connection-owner]")?.value, String(OWNER));
  assert.equal(q<HTMLButtonElement>("[data-of-connection-save]")?.disabled, false, "Save credentials is enabled");
  assert.equal(q("[data-of-connection-browserbase-frame]"), null, "live view closed after done");
  await settle(2200);
  assert.equal(calls.filter(c => c.method === "GET" && c.path.includes("/browserbase-login/")).length, 2, "polling stops at a terminal state");
});

test("a done job whose capture does not validate fills nothing", async () => {
  await mountEditor({ start: { body: { ok: true, jobId: JOB, state: "capturing", liveViewUrl: LIVE } },
    polls: [{ body: { ok: true, jobId: JOB, state: "done", liveViewUrl: LIVE, capture, xHash: "synthetic-bb-hash", ownerId: OWNER + 1 } }] });
  await click(q("[data-of-connection-browserbase]"));
  await settle(2100);
  assert.equal(q<HTMLInputElement>("[data-of-connection-hash]")?.value, "");
  assert.equal(q<HTMLButtonElement>("[data-of-connection-save]")?.disabled, true);
  assert.match(notice(), /could not be used/);
});

test("unconfigured backend shows a clear notice and no live view", async () => {
  const calls = await mountEditor({ start: { status: 503, body: { schemaVersion: "of-connections.v1", ok: false, outcome: "refused", code: "browserbase_unconfigured", error: "Browserbase login is not configured." } } });
  await click(q("[data-of-connection-browserbase]"));
  assert.match(notice(), /Browserbase login is not configured/);
  assert.equal(q("[data-of-connection-browserbase-frame]"), null);
  await settle(2100);
  assert.equal(calls.filter(c => c.path.includes("/browserbase-login/")).length, 0, "no polling");
});

test("cancel posts to the job's cancel route, stops polling and closes the live view", async () => {
  const calls = await mountEditor({ start: { body: { ok: true, jobId: JOB, state: "waiting_login", liveViewUrl: LIVE } } });
  await click(q("[data-of-connection-browserbase]"));
  assert.ok(q("[data-of-connection-browserbase-frame]"));
  await click(q("[data-of-connection-browserbase-cancel]"));
  const cancel = calls.find(c => c.path.endsWith("/cancel"));
  assert.equal(cancel?.path, `/api/onlyfans-connections/accounts/${ACCOUNT}/browserbase-login/${JOB}/cancel`);
  assert.equal(cancel?.body, "{}");
  assert.equal(q("[data-of-connection-browserbase-frame]"), null);
  assert.match(q("[data-of-connection-browserbase-status]")?.textContent ?? "", /cancelled/i);
  await settle(2200);
  assert.equal(calls.filter(c => c.method === "GET" && c.path.includes("/browserbase-login/")).length, 0, "no poll after cancel");
});

test("unmount stops polling and cancels the open job", async () => {
  const calls = await mountEditor({ start: { body: { ok: true, jobId: JOB, state: "waiting_login", liveViewUrl: LIVE } } });
  await click(q("[data-of-connection-browserbase]"));
  await act(async () => root!.unmount()); root = undefined;
  await settle(2200);
  assert.equal(calls.filter(c => c.method === "GET" && c.path.includes("/browserbase-login/")).length, 0);
  assert.deepEqual(calls.filter(c => c.path.endsWith("/cancel")).map(c => [c.method, c.path, c.body]),
    [["POST", `/api/onlyfans-connections/accounts/${ACCOUNT}/browserbase-login/${JOB}/cancel`, "{}"]]);
});

test("closing the tab (pagehide) cancels the open job", async () => {
  const calls = await mountEditor({ start: { body: { ok: true, jobId: JOB, state: "waiting_login", liveViewUrl: LIVE } } });
  await click(q("[data-of-connection-browserbase]"));
  await act(async () => { window.dispatchEvent(new dom.window.Event("pagehide")); await new Promise(resolve => setTimeout(resolve, 25)); });
  assert.deepEqual(calls.filter(c => c.path.endsWith("/cancel")).map(c => [c.method, c.path, c.body]),
    [["POST", `/api/onlyfans-connections/accounts/${ACCOUNT}/browserbase-login/${JOB}/cancel`, "{}"]]);
  await act(async () => root!.unmount()); root = undefined;
  assert.equal(calls.filter(c => c.path.endsWith("/cancel")).length, 1, "unmount after pagehide does not cancel twice");
});

const pollCount = (calls: Array<{ method: string; path: string }>) => calls.filter(c => c.method === "GET" && c.path.includes("/browserbase-login/")).length;
const cancelCount = (calls: Array<{ path: string }>) => calls.filter(c => c.path.endsWith("/cancel")).length;
const status = () => q("[data-of-connection-browserbase-status]")?.textContent ?? "";

test("a failed job shows its cause", async () => {
  await mountEditor({ start: { body: { ok: true, jobId: JOB, state: "starting", liveViewUrl: LIVE } },
    polls: [{ body: { ok: true, jobId: JOB, state: "failed", liveViewUrl: null, error: "OnlyFans\nrejected the login" } }] });
  await click(q("[data-of-connection-browserbase]"));
  await settle(2100);
  assert.match(status(), /Browserbase login failed\. OnlyFans rejected the login/);
});

test("busy backend (429 browserbase_busy) shows the capacity notice", async () => {
  const calls = await mountEditor({ start: { status: 429, body: { schemaVersion: "of-connections.v1", ok: false, outcome: "refused", code: "browserbase_busy", error: "Too many Browserbase logins are running. Try again in a few minutes." } } });
  await click(q("[data-of-connection-browserbase]"));
  assert.equal(notice(), "Too many Browserbase logins are running. Try again in a few minutes.");
  assert.equal(q("[data-of-connection-browserbase-frame]"), null);
  await settle(2100); assert.equal(pollCount(calls), 0);
});

test("an unconfirmed cancel keeps the job live: polling resumes and unmount still cancels it", async () => {
  const calls = await mountEditor({ start: { body: { ok: true, jobId: JOB, state: "waiting_login", liveViewUrl: LIVE } }, cancel: { status: 502, body: { ok: false } } });
  await click(q("[data-of-connection-browserbase]"));
  await click(q("[data-of-connection-browserbase-cancel]"));
  assert.equal(cancelCount(calls), 1);
  assert.match(notice(), /not confirmed/);
  assert.doesNotMatch(status(), /cancelled/i); assert.ok(q("[data-of-connection-browserbase-frame]"), "live view still open");
  assert.ok(q("[data-of-connection-browserbase-cancel]"), "cancel can be retried");
  await settle(2100); assert.equal(pollCount(calls), 1, "polling resumed");
  await act(async () => root!.unmount()); root = undefined;
  await settle(25); assert.equal(cancelCount(calls), 2, "unmount cancels the still-open job");
});

test("five failed polls fire a best-effort cancel before marking the job failed", async () => {
  const unreadable = { status: 503, body: { ok: false } };
  const calls = await mountEditor({ start: { body: { ok: true, jobId: JOB, state: "waiting_login", liveViewUrl: LIVE } }, polls: Array(5).fill(unreadable) });
  await click(q("[data-of-connection-browserbase]"));
  await settle(10_300);
  assert.equal(pollCount(calls), 5);
  assert.equal(cancelCount(calls), 1, "best-effort cancel sent");
  assert.match(status(), /failed/i);
  await act(async () => root!.unmount()); root = undefined;
  await settle(25); assert.equal(cancelCount(calls), 1, "no second cancel on unmount");
});

test("a login still open after the wall-clock deadline stops polling and is cancelled", async () => {
  const calls = await mountEditor({ start: { body: { ok: true, jobId: JOB, state: "waiting_login", liveViewUrl: LIVE } } });
  const realNow = Date.now;
  try {
    await click(q("[data-of-connection-browserbase]"));
    Date.now = () => realNow() + 11 * 60_000 + 1_000;
    await settle(2100);
    assert.equal(pollCount(calls), 0, "no poll after the deadline");
    assert.equal(cancelCount(calls), 1, "best-effort cancel sent");
    assert.match(notice(), /took too long/);
    assert.equal(q("[data-of-connection-browserbase-frame]"), null);
    await settle(2100); assert.equal(pollCount(calls), 0);
  } finally { Date.now = realNow; }
});
