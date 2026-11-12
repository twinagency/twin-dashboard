// KNOWN RED (W2 team-351 F1, F3, F4, F5, F6; docs/review/W2/team-351-curl-capture.md). jsdom render of the real ConnectionEditor
// (components/onlyfans-preview/ConnectionEditor.tsx, accountId "of-a", initiallyOpen) driven through its DOM.
// F1 trace: ConnectionEditor.tsx:108 applyCurl does setOwner(String(ownerId)) from the curl with no check against the recorded owner
//   (data.ownerId, field locked at :187) or a typed owner, while chooseCapture (:83-85) refuses a mismatch. A curl from another creator
//   replaces the owner and its capture is accepted. Two cases: recorded owner 111, and unbound account with 111 typed in.
// F3 trace: :103-107 treats every non-OK, non-401/403 reply (400 curl unreadable, 404/503 not available, 502 timeout/unconfirmed) as
//   one remedy ("Copy a fresh curl … paste it again"); only a thrown fetch (:110) differs. The notice must also never relay an upstream
//   error body, which can quote the pasted `sign` (session_bootstrap.py:532,541); a per-run sign sentinel is put in the 400 body.
// F4 trace: the curl textarea (:194) shows the pasted cookie jar in plain text and has no spellCheck={false}; clearSecrets (:37-40)
//   never clears curlText, so after a failed conversion and a file-capture save the pasted session stays on screen.
//   F4a accepts ANY of these masks: a class matching /\bblur-/ (the shared primitive, components/clone/fields.tsx:549), an inline
//   -webkit-text-security style, an input[type=password], or the pasted value never present in the DOM (no element's value or text
//   contains it after typing); AND spellcheck="false" (or the field is a password input).
// F5 trace: the extension link (:190) is static /downloads/fastt-login-capture.zip; lib/app-mode.ts:34-65 has no /downloads entry, so
//   with TWIN_APP_MODE=onlyfans middleware.ts:46 redirects the download to the OnlyFans home. Checked via onlyFansOnlyVerdict only; the
//   path must also not be under /creator-auth/ or /creator/ (creator-only routes refuse the operator, so copying the connector route
//   is not a fix).
// F6 trace: applyCurl's generation/active guard (:98) runs before `await response.json()` (:103) and not after; the file input stays
//   enabled during conversion (fieldset disabled only on busy || hasRetry, :185). Deterministic: the curl reply is a real Response over
//   a ReadableStream that enqueues the JSON and closes only on release(), so text()/json() both wait until the file capture is chosen.
//   If the file input (or its fieldset) is disabled while the conversion is pending, F6 passes (that is a valid fix).
// Fixed looks like: F1, a curl whose owner differs from data.ownerId ?? typed owner is refused (chooseCapture's rule) and the owner is
//   unchanged. F3, copy keyed on status: 400 = the curl itself is unusable, 502 = try again, 503/404 = not available here; never upstream
//   text. F4, a mask from the accepted set + spellCheck={false}; curlText cleared with the other secrets. F5, the zip served under an
//   OnlyFans-mode allowed, operator-reachable path. F6, re-check active.current && generation after body parsing (or S4's acceptCapture).
// Fakes: global fetch stubbed (only the dashboard routes /api/onlyfans-connections/accounts/of-a[/capture-from-curl] answer; anything else
//   throws). Each mount() sets its own curl answer (default 404), so nothing leaks between tests. Router: no module mock; the tree is
//   wrapped in Next's own AppRouterContext.Provider (next/dist/shared/lib/app-router-context.shared-runtime) with a no-op router, which is
//   exactly what useRouter() reads (next/dist/client/components/navigation.js:121-129). jsdom lacks scrollIntoView; it is stubbed to a
//   no-op. Files are Node File objects set on the input's `files` property. `.css` requires (CSS modules pulled in via
//   AdminOnlyFansSignIn) are answered by a require.extensions hook returning a class-name proxy. Cookie, x_bc, static_param, sign and
//   X-Hash values are synthetic, generated per run (tests/helpers/W2-team-351-curl-capture-fixtures.ts).
// Team's Claude owns the fix. Not wired into npm scripts.
// Run:  nice -n 10 node --import tsx --test --test-name-pattern='^control' tests/known-red/W2-team-351-curl-capture-editor.test.tsx  (green)
//       nice -n 10 node --import tsx --test --test-skip-pattern='^control' tests/known-red/W2-team-351-curl-capture-editor.test.tsx  (red)
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { after, before } from "node:test";
import React, { act } from "react";
const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom");
// CSS modules (AdminOnlyFansSignIn -> HostedConnect.module.css) load through the CJS require path under tsx; map class names to themselves.
require.extensions[".css"] = (module: NodeJS.Module) => { module.exports = new Proxy({}, { get: (_target, key) => String(key) }); };

const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/onlyfans/accounts" });
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent, React, IS_REACT_ACT_ENVIRONMENT: true });

import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { CONNECTION_SCHEMA, connectionCapture, parseConnection } from "../../lib/onlyfans-connections/contract";
import { onlyFansOnlyVerdict } from "../../lib/app-mode";
import { capture, synthetic } from "../helpers/W2-team-351-curl-capture-fixtures";

let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof createRoot> | undefined;
before(async () => { ({ createRoot } = await import("react-dom/client")); });
after(async () => { await act(async () => root?.unmount()); dom.window.close(); });

const ACCOUNT = "of-a", ENDPOINT = `/api/onlyfans-connections/accounts/${ACCOUNT}`, REVISION = 3;
// conversion() is the route reply at HEAD ({capture, xHash, ownerId}); when W3 F1 lands (route returns {ownerId, captureId, xHash}),
// move it to that shape, or control 1 goes red after a correct cross-lane fix.
const conversion = (owner: number) => ({ schemaVersion: CONNECTION_SCHEMA, ok: true, capture: capture(owner), xHash: synthetic(), ownerId: owner });
const refusal = (status: number, error: string) => () => Response.json({ schemaVersion: CONNECTION_SCHEMA, ok: false, error }, { status });
const connection = (ownerId: string | null) => ({ schemaVersion: CONNECTION_SCHEMA, ok: true, connection: { accountId: ACCOUNT, revision: REVISION,
  status: "pending", ownerId, expiresAt: null, verifiedAt: null, lastError: null, outgoingEnabled: false, policyRevision: 0, usedUnits: 0,
  limitUnits: 0, mediaEnabled: false, automateNewConversations: false } });
const ack = { schemaVersion: CONNECTION_SCHEMA, ok: true, applied: true, accountId: ACCOUNT, commandKey: "c".repeat(64), recordedRevision: REVISION + 1, action: "save" };

type CurlAnswer = () => Response | Promise<Response>;
type Posted = { url: string; body: unknown };
let posted: Posted[] = [];
function stubFetch(ownerId: string | null, curlAnswer: CurlAnswer) {
  posted = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    if (init.method === "POST") {
      posted.push({ url, body: typeof init.body === "string" ? JSON.parse(init.body) : init.body });
      if (url === `${ENDPOINT}/capture-from-curl`) return curlAnswer();
      if (url === ENDPOINT) return Response.json(ack);
    } else if (url === ENDPOINT) return Response.json(connection(ownerId));
    throw new Error(`unexpected fetch ${init.method ?? "GET"} ${url}`);
  }) as typeof fetch;
}

const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };
const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
async function mount(ownerId: string | null, curlAnswer: CurlAnswer = () => new Response(null, { status: 404 })) {
  assert.ok(parseConnection(connection(ownerId), ACCOUNT), "GET fixture must parse");
  stubFetch(ownerId, curlAnswer);
  const { default: ConnectionEditor } = await import("../../components/onlyfans-preview/ConnectionEditor");
  if (root) await act(async () => root!.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(<AppRouterContext.Provider value={router as never}><ConnectionEditor accountId={ACCOUNT} initiallyOpen /></AppRouterContext.Provider>); });
  await settle();
  assert.ok(el("[data-of-connection-owner]"), "editor form rendered");
}
const el = <T extends Element = HTMLInputElement>(selector: string) => document.querySelector<T>(selector);
const notice = () => el("[data-of-connection-notice]")?.textContent ?? "";
const saveDisabled = () => el<HTMLButtonElement>("[data-of-connection-save]")?.disabled;
/** True when the control or its fieldset cannot be used. */
const unusable = (node: Element) => (node as HTMLInputElement).disabled || !!node.closest("fieldset")?.disabled || node.matches(":disabled");
function enabled<T extends Element>(selector: string): T {
  const node = el<T>(selector); assert.ok(node, `${selector} exists`);
  assert.equal(unusable(node), false, `${selector} and its fieldset are enabled`);
  return node;
}
async function type(selector: string, value: string) {
  const node = enabled<HTMLInputElement | HTMLTextAreaElement>(selector);
  const proto = node.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(node, value); node.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
}
async function click(selector: string) {
  const node = enabled<HTMLButtonElement>(selector);
  await act(async () => { node.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
  await settle();
}
async function chooseFile(value: unknown) {
  const node = enabled<HTMLInputElement>("[data-of-connection-capture]");
  Object.defineProperty(node, "files", { configurable: true, value: [new File([JSON.stringify(value)], "capture.json", { type: "application/json" })] });
  await act(async () => { node.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
  await settle();
}
const curl = (sign = synthetic()) => `curl 'https://onlyfans.com/api2/v2/users/me' -H 'user-id: 111' -H 'sign: ${sign}' -b 'sess=${synthetic()}'`;
async function pasteAndApply(text = curl()) { await type("[data-of-connection-curl]", text); await click("[data-of-connection-curl-apply]"); }
const savedCapture = () => (posted.find(p => p.url === ENDPOINT)?.body as { payload?: { capture?: unknown } } | undefined)?.payload?.capture;

test("control: a curl for the recorded owner fills owner and X-Hash and enables Save", async () => {
  const reply = conversion(111); assert.ok(connectionCapture(reply.capture, 111));
  await mount("111", () => Response.json(reply));
  await pasteAndApply();
  assert.equal(posted.length, 1, "one conversion POST");
  assert.deepEqual(Object.keys(posted[0].body as object), ["curl"]);
  assert.equal(el("[data-of-connection-owner]")?.value, "111");
  assert.equal(el("[data-of-connection-hash]")?.value, reply.xHash);
  assert.equal(saveDisabled(), false, "capture accepted, Save enabled");
});

test("control: a failed conversion leaves no capture and Save disabled", async () => {
  await mount("111", refusal(502, "The connection outcome is not confirmed."));
  await pasteAndApply();
  assert.equal(el("[data-of-connection-hash]")?.value, "");
  assert.equal(saveDisabled(), true);
});

test("F1: a curl that converts to another owner (222) is refused on an account recorded for owner 111", async () => {
  await mount("111", () => Response.json(conversion(222)));
  await pasteAndApply();
  assert.equal(el("[data-of-connection-owner]")?.value, "111", "the locked recorded owner must not change");
  assert.equal(saveDisabled(), true, "the other creator's capture must not be accepted (Save stays disabled)");
});

test("F1: on an unbound account with owner 111 typed in, a curl that converts to 222 is refused", async () => {
  await mount(null, () => Response.json(conversion(222)));
  await type("[data-of-connection-owner]", "111");
  await pasteAndApply();
  assert.equal(el("[data-of-connection-owner]")?.value, "111", "the typed owner must not be overwritten");
  assert.equal(saveDisabled(), true, "the other creator's capture must not be accepted (Save stays disabled)");
});

test("F3: unreadable curl (400), unavailable (404, 503) and unconfirmed (502) get distinct notices, never relaying upstream text", async () => {
  const sign = synthetic();
  const outcomes: Array<[string, CurlAnswer]> = [
    ["400", refusal(400, `Could not read that curl: sign ${sign} does not match the derived rules.`)],
    ["404", refusal(404, "The account connection change was refused.")],
    ["503", refusal(503, "Account connection management is not configured.")],
    ["502", refusal(502, "The connection outcome is not confirmed. Refresh or retry the same request.")],
    ["thrown", async () => { throw new TypeError("fetch failed"); }],
  ];
  const shown: Record<string, string> = {};
  for (const [label, answer] of outcomes) {
    await mount("111", answer);
    await pasteAndApply(curl(sign));
    shown[label] = notice();
    assert.ok(shown[label], `${label}: a notice is shown`);
    assert.equal(saveDisabled(), true, `${label}: no capture`);
  }
  for (const text of Object.values(shown)) assert.ok(!text.includes(sign), "the notice must never contain the pasted sign");
  // A thrown fetch (shown.thrown) is context only: a correct fix may share one "try again" notice with 502.
  const pairs: Array<[string, string]> = [["400", "502"], ["404", "400"], ["503", "400"], ["404", "502"], ["503", "502"]];
  const same = pairs.filter(([a, b]) => shown[a] === shown[b]).map(([a, b]) => `${a}=${b}`);
  assert.deepEqual(same, [], `400, 404/503 and 502 need different notices; identical: ${same.join(", ")} ("${shown["400"]}")`);
});

test("control: the curl paste field renders next to the password-masked X-Hash", async () => {
  await mount("111");
  assert.ok(el("[data-of-connection-curl]"));
  assert.equal(el("[data-of-connection-hash]")?.type, "password", "neighbouring X-Hash is masked");
});

test("F4a: the curl paste field (full cookie jar) is masked like other secret fields and not spellchecked", async () => {
  await mount("111");
  const pasted = curl();
  await type("[data-of-connection-curl]", pasted);
  const field = el<HTMLInputElement | HTMLTextAreaElement>("[data-of-connection-curl]")!;
  const password = field.tagName === "INPUT" && field.getAttribute("type") === "password";
  const inDom = [...document.querySelectorAll<HTMLElement>("*")].some(node =>
    String((node as HTMLInputElement).value ?? "").includes(pasted) || (node.children.length === 0 && (node.textContent ?? "").includes(pasted)));
  const masked = /\bblur-/.test(field.className) || /text-security/.test(field.className) || /-webkit-text-security\s*:\s*(disc|circle|square)/.test(field.getAttribute("style") ?? "") || /^(disc|circle|square)$/.test(field.style.getPropertyValue("-webkit-text-security")) || password || !inDom;
  const noSpellcheck = password || field.getAttribute("spellcheck") === "false";
  assert.ok(masked && noSpellcheck, `curl field must be masked (${masked}) and not spellchecked (${noSpellcheck}); class "${field.className}"`);
});

test("control: failed conversion then a file capture save posts the file capture and clears X-Hash", async () => {
  await mount("111", refusal(502, "The connection outcome is not confirmed."));
  await pasteAndApply();
  const file = capture(111); await chooseFile(file);
  await type("[data-of-connection-hash]", synthetic());
  await click("[data-of-connection-save]");
  assert.deepEqual(savedCapture(), file, "file capture saved");
  assert.equal(el("[data-of-connection-hash]")?.value, "", "clearSecrets ran");
});

test("F4b: after a failed conversion and a file-capture save, the pasted curl (session cookies) is cleared", async () => {
  await mount("111", refusal(502, "The connection outcome is not confirmed."));
  await pasteAndApply();
  await chooseFile(capture(111));
  await type("[data-of-connection-hash]", synthetic());
  await click("[data-of-connection-save]");
  assert.ok(savedCapture(), "save POSTed");
  assert.equal(el("[data-of-connection-hash]")?.value, "", "clearSecrets ran");
  assert.equal(el<HTMLTextAreaElement>("[data-of-connection-curl]")?.value, "", "clearSecrets must also clear the pasted curl");
});

test("control: a file capture chosen with no conversion in flight is saved", async () => {
  await mount("111");
  const file = capture(111); await chooseFile(file);
  await type("[data-of-connection-hash]", synthetic());
  await click("[data-of-connection-save]");
  assert.deepEqual(savedCapture(), file);
});

test("F6: a curl conversion whose body arrives after a file capture was chosen does not overwrite the file capture", async () => {
  const late = conversion(111);
  let release!: () => void;
  const stream = new ReadableStream<Uint8Array>({ start(controller) {
    release = () => { controller.enqueue(new TextEncoder().encode(JSON.stringify(late))); controller.close(); };
  } });
  await mount("111", () => new Response(stream, { status: 200, headers: { "Content-Type": "application/json" } }));
  await pasteAndApply();
  assert.equal(posted.length, 1, "conversion POSTed; headers arrived, body still pending");
  const fileInput = el("[data-of-connection-capture]")!;
  if (unusable(fileInput)) { await act(async () => { release(); }); await settle(); return; } // file input locked during conversion: F6 cannot happen
  const file = capture(111); await chooseFile(file);
  await act(async () => { release(); });
  await settle();
  assert.notEqual(el("[data-of-connection-hash]")?.value, late.xHash, "the stale curl must not fill X-Hash");
  await type("[data-of-connection-hash]", synthetic());
  await click("[data-of-connection-save]");
  assert.deepEqual(savedCapture(), file, "the file capture, chosen last, is what saves");
});

test("control: /onlyfans/overview is allowed in OnlyFans-only mode and the editor renders an extension link", async () => {
  assert.equal(onlyFansOnlyVerdict("/onlyfans/overview", true).kind, "allow");
  await mount("111");
  assert.ok(el<HTMLAnchorElement>("[data-of-connection-extension]")?.getAttribute("href"));
});

test("F5: the extension download path is reachable by the operator in OnlyFans-only mode (TWIN_APP_MODE=onlyfans)", async () => {
  await mount("111");
  const href = el<HTMLAnchorElement>("[data-of-connection-extension]")!.getAttribute("href")!;
  const path = new URL(href, "https://fixture.invalid").pathname;
  assert.ok(!/^\/creator(?:-auth)?\//.test(path), `${path} must not be a creator-only route (they refuse the operator)`);
  assert.deepEqual(onlyFansOnlyVerdict(path, true), { kind: "allow" }, `${path} must be allowed, not redirected/404`);
});
