/** Vault processing panel: real React in an offline DOM against a fixture backend behind the panel's own fetch. No network. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { after, before } from "node:test";
import React, { act } from "react";
const { JSDOM } = createRequire(import.meta.url)("jsdom");

const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/onlyfans/vault" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent, React, IS_REACT_ACT_ENVIRONMENT: true });
let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof createRoot> | undefined;
before(async () => { ({ createRoot } = await import("react-dom/client")); });
after(async () => { await act(async () => root?.unmount()); dom.window.close(); });
const q = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector);
const text = () => document.body.textContent ?? "";
const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
const click = async (element: Element | null) => { assert.ok(element, "element to click exists"); await act(async () => { element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 25)); }); };
const control = (name: string) => q<HTMLButtonElement>(`[data-vp-control="${name}"]`);

const ACCOUNT = "acc-a", KEY = "a".repeat(64);
const counts = (patch = {}) => ({ eligible: 10, queued: 0, processing: 0, completed: 10, unresolved: 0, skippedOperator: 0, ...patch });
const fullCoverage = { scope: "full", state: "complete", reason: null, established_by: "provider_total", providerTotal: { photo: 80, video: 20 }, seen: { photo: 80, video: 20 }, uniqueImported: { photo: 80, video: 20 } };
const windowCoverage = { scope: "window", state: "partial", reason: "window_not_full_vault", established_by: null, providerTotal: { photo: null, video: null }, seen: { photo: 1000, video: 700 }, uniqueImported: { photo: 1000, video: 700 } };
const status = (patch: Record<string, unknown> = {}) => ({ account: ACCOUNT, paused: false, pauseReason: null, import: fullCoverage,
  analysis: { ...counts(), byKind: { photo: counts({ eligible: 8, completed: 8 }), video: counts({ eligible: 2, completed: 2 }) }, unresolvedReasons: {} },
  credential: { state: "ok" }, updatedAt: "2026-11-15T01:02:03Z", ...patch });

type Posted = { url: string; body: Record<string, unknown> };
function backend(initial: Record<string, unknown>, options: { getStatus?: number; postStatus?: number; postThrows?: boolean } = {}) {
  const calls = { gets: 0, posts: [] as Posted[] }, state = { current: initial };
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    assert.equal(url, `/api/onlyfans-content/accounts/${ACCOUNT}/vault/processing`);
    assert.equal(init?.credentials, "same-origin"); assert.equal(init?.cache, "no-store"); assert.equal(init?.redirect, "error");
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body)); calls.posts.push({ url, body });
      assert.deepEqual(Object.keys(body).filter(k => !["requestId", "action", "mediaIds"].includes(k)), [], "the browser sends no identity or command key");
      if (options.postThrows) throw new Error("Synthetic lost reply");
      if (options.postStatus && options.postStatus !== 200) return Response.json({ ok: false }, { status: options.postStatus });
      if (body.action === "pause") state.current = { ...state.current, paused: true, pauseReason: "operator_pause" };
      if (body.action === "resume") state.current = { ...state.current, paused: false, pauseReason: null };
      return Response.json({ schemaVersion: "of-content.v1", ok: true, applied: true, accountId: ACCOUNT, commandKey: KEY, processing: state.current });
    }
    calls.gets++;
    if (options.getStatus && options.getStatus !== 200) return Response.json({ ok: false }, { status: options.getStatus });
    return Response.json({ schemaVersion: "of-content.v1", ok: true, accountId: ACCOUNT, processing: state.current });
  }) as typeof fetch;
  return { calls, state, fetchImpl };
}
async function mount(props: { backend: ReturnType<typeof backend>; readOnly?: boolean; selectedIds?: string[]; sync?: Record<string, unknown> | null }) {
  if (root) await act(async () => root!.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  const { default: VaultProcessingPanel } = await import("../../components/onlyfans-preview/VaultProcessingPanel");
  await act(async () => { root!.render(<VaultProcessingPanel accountId={ACCOUNT} readOnly={props.readOnly} selectedIds={props.selectedIds} sync={props.sync as never} fetchImpl={props.backend.fetchImpl} />); });
  await settle();
}

test("a proven full import renders as complete with provider totals and how coverage was established", async () => {
  await mount({ backend: backend(status()) });
  const imp = q("[data-vp-import]")!;
  assert.equal(imp.getAttribute("data-vp-full"), "true"); assert.equal(imp.getAttribute("data-vp-import-state"), "complete");
  assert.match(imp.textContent!, /Complete: Full vault imported/); assert.match(q("[data-vp-import-row='photo']")!.textContent!, /80 unique imported of 80 on the provider/);
  assert.match(q("[data-vp-established]")!.textContent!, /provider's reported totals/); assert.equal(q("[data-vp-not-full]"), null);
  assert.equal(q("[data-vp-analysis]")!.getAttribute("data-vp-analysis-state"), "done");
  assert.match(q("[data-vp-eligibility]")!.textContent!, /does not make a file sellable/);
});
test("a finished window (v3) import is shown as partial, never complete or full", async () => {
  await mount({ backend: backend(status({ import: windowCoverage })), sync: { status: "complete", scope: { version: 3, selection: "newest_per_type", photos: 1000, videos: 1000, order: "created_at_desc_id_desc" } } });
  const imp = q("[data-vp-import]")!;
  assert.equal(imp.getAttribute("data-vp-full"), "false"); assert.notEqual(imp.getAttribute("data-vp-import-state"), "complete");
  assert.match(imp.textContent!, /Partial: Only a window of the vault was imported\. This is not the full vault/);
  assert.match(q("[data-vp-not-full]")!.textContent!, /Do not treat the imported library as the whole provider vault/); assert.match(q("[data-vp-import-reason]")!.textContent!, /newest media in a window/);
  assert.doesNotMatch(imp.textContent!, /Full vault imported|Complete:/);
  assert.equal(q("[data-vp-analysis]")!.getAttribute("data-vp-analysis-state"), "done_partial_import");
  assert.match(q("[data-vp-analysis-note]")!.textContent!, /not full/);
});
test("a full import whose latest sync is running or failed is not shown complete", async () => {
  await mount({ backend: backend(status()), sync: { status: "running" } });
  assert.equal(q("[data-vp-import]")!.getAttribute("data-vp-full"), "false"); assert.match(q("[data-vp-import]")!.textContent!, /In progress/);
  await mount({ backend: backend(status()), sync: { status: "failed", lastError: "vault_total_page_limit" } });
  assert.equal(q("[data-vp-import]")!.getAttribute("data-vp-full"), "false"); assert.match(q("[data-vp-import]")!.textContent!, /Unresolved/);
});
test("analysis, unresolved reasons, operator skips, credential problem and pause are all prominent", async () => {
  const b = backend(status({ paused: true, pauseReason: "budget_exhausted", credential: { state: "budget" },
    analysis: { ...counts({ eligible: 20, queued: 3, processing: 2, completed: 9, unresolved: 5, skippedOperator: 1 }), byKind: {}, unresolvedReasons: { credential_missing: 4, timeout: 1 } } }));
  await mount({ backend: b });
  assert.equal(q("[data-vp-analysis]")!.getAttribute("data-vp-analysis-state"), "active");
  assert.match(q("[data-vp-analysis-totals]")!.textContent!, /Eligible 20 · Queued 3 · Processing 2 · Completed 9 · Unresolved 5 · Skipped by operator 1/);
  assert.match(q("[data-vp-unresolved-reason='credential_missing']")!.textContent!, /Describe credential missing: 4/); assert.match(q("[data-vp-unresolved-reason='timeout']")!.textContent!, /Timed out: 1/);
  const credential = q("[data-vp-credential][data-vp-blocking]")!; assert.equal(credential.getAttribute("role"), "alert"); assert.match(credential.textContent!, /budget is exhausted/);
  assert.match(q("[data-vp-paused]")!.textContent!, /paused/i);
});
test("pause then resume: one POST each with only a nonce and the action, and the status refreshes", async () => {
  const b = backend(status()); await mount({ backend: b });
  assert.equal(control("pause")!.disabled, false); assert.equal(control("resume")!.disabled, true);
  await click(control("pause")); await settle();
  assert.equal(b.calls.posts.length, 1); assert.equal(b.calls.posts[0].body.action, "pause"); assert.match(String(b.calls.posts[0].body.requestId), /^[0-9a-f-]{36}$/); assert.equal("mediaIds" in b.calls.posts[0].body, false);
  assert.ok(q("[data-vp-paused]")); assert.equal(control("resume")!.disabled, false); assert.equal(control("pause")!.disabled, true); assert.match(q("[data-vp-notice]")!.textContent!, /paused/);
  await click(control("resume")); await settle();
  assert.equal(b.calls.posts[1].body.action, "resume"); assert.notEqual(b.calls.posts[0].body.requestId, b.calls.posts[1].body.requestId, "each command has its own nonce");
  assert.equal(q("[data-vp-paused]"), null);
});
test("retry unresolved is enabled only with unresolved work and sends no media IDs", async () => {
  await mount({ backend: backend(status()) }); assert.equal(control("retry")!.disabled, true);
  const b = backend(status({ analysis: { ...counts({ completed: 7, unresolved: 3 }), byKind: {}, unresolvedReasons: { provider_error: 3 } } })); await mount({ backend: b });
  assert.equal(control("retry")!.disabled, false); await click(control("retry"));
  assert.equal(b.calls.posts.length, 1); assert.equal(b.calls.posts[0].body.action, "retry"); assert.equal("mediaIds" in b.calls.posts[0].body, false);
});
test("re-describe selected needs a selection, asks for confirmation, and sends exactly the selected IDs", async () => {
  await mount({ backend: backend(status()), selectedIds: [] }); assert.equal(control("redescribe")!.disabled, true);
  const b = backend(status()); await mount({ backend: b, selectedIds: ["11", "9007199254740993"] });
  assert.equal(control("redescribe")!.disabled, false); assert.match(control("redescribe")!.textContent!, /\(2\)/);
  await click(control("redescribe")); assert.ok(q("[data-vp-confirm]")); assert.equal(b.calls.posts.length, 0, "no metered work before confirmation");
  assert.match(q("[data-vp-confirm]")!.textContent!, /metered/); assert.match(q("[data-vp-confirm]")!.textContent!, /do not change/);
  await click(q("[data-vp-confirm-no]")); assert.equal(q("[data-vp-confirm]"), null); assert.equal(b.calls.posts.length, 0);
  await click(control("redescribe")); await click(q("[data-vp-confirm-yes]"));
  assert.equal(b.calls.posts.length, 1); assert.deepEqual({ ...b.calls.posts[0].body, requestId: "x" }, { requestId: "x", action: "redescribe", mediaIds: ["11", "9007199254740993"] });
  const big = backend(status()); await mount({ backend: big, selectedIds: Array.from({ length: 201 }, (_, i) => String(i + 1)) });
  assert.equal(control("redescribe")!.disabled, true);
});
test("read-only team access sees status but no controls", async () => {
  await mount({ backend: backend(status()), readOnly: true, selectedIds: ["11"] });
  assert.ok(q("[data-vp-import]")); assert.equal(q("[data-vp-control]"), null);
});
test("a lost reply says the outcome is unconfirmed and re-reads the truth", async () => {
  const b = backend(status(), { postThrows: true }); await mount({ backend: b }); const before = b.calls.gets;
  await click(control("pause")); await settle();
  assert.match(q("[data-vp-notice]")!.textContent!, /Outcome not confirmed/); assert.ok(b.calls.gets > before); assert.equal(control("pause")!.disabled, false, "unlocks so the operator can check and retry");
  const refused = backend(status(), { postStatus: 409 }); await mount({ backend: refused }); await click(control("pause")); await settle();
  assert.match(q("[data-vp-notice]")!.textContent!, /refused/);
});
test("401/403 shows sign-in and no status; an unreadable status says nothing can be taken as complete", async () => {
  const denied = backend(status(), { getStatus: 403 }); await mount({ backend: denied });
  assert.ok(q("[data-vp-denied]")); assert.equal(q("[data-vp-import]"), null); assert.equal(q("[data-vp-control]"), null); assert.equal(denied.calls.gets, 1, "polling stops after a denial");
  await mount({ backend: backend(status(), { getStatus: 500 }) });
  assert.match(q("[data-vp-unavailable]")!.textContent!, /Nothing below should be taken as complete/); assert.equal(q("[data-vp-import]"), null);
});
test("a status for another account or with URL-shaped text is never rendered", async () => {
  const other = backend({ ...status(), account: "acc-b" }); await mount({ backend: other });
  assert.ok(q("[data-vp-unavailable]")); assert.equal(q("[data-vp-import]"), null);
  await mount({ backend: backend(status({ paused: true, pauseReason: "https://evil.invalid/secret?token=1", analysis: { ...counts({ completed: 5, unresolved: 5 }), byKind: {}, unresolvedReasons: { "https://evil.invalid/x": 5 } } })) });
  assert.doesNotMatch(document.body.innerHTML, /evil\.invalid|token=1/);
});
test("sparse status (no import, analysis or credential) is shown as not reported, never as complete", async () => {
  await mount({ backend: backend({ account: ACCOUNT, paused: false }) });
  assert.equal(q("[data-vp-import]")!.getAttribute("data-vp-full"), "false"); assert.match(q("[data-vp-import]")!.textContent!, /not reported/i);
  assert.equal(q("[data-vp-analysis]")!.getAttribute("data-vp-analysis-state"), "not_reported"); assert.match(text(), /credential status is not reported/i);
});
