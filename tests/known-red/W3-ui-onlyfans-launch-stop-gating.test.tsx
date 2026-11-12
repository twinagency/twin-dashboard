// KNOWN RED (W3 lane 2 ui-onlyfans-launch, findings L1 L2 L3 L4; REVIEW.md inv 7 "Holds and STOP": a STOP is never harder than a
// go, and an unconfirmed STOP is labelled "stop unconfirmed" and held).
//   L1 automation/AccountControls.tsx:140  Emergency stop is `disabled={!manage || busy || pending !== null || !reason.trim()}`: an
//      unconfirmed Resume (502) leaves `pending` set, so STOP stays disabled until "Use current account view".
//   L2 automation/AccountControls.tsx:103  STOP (and its Reason box) renders only inside `r.state.kind === "ok"`: a 503 on the
//      emergency-stop read removes it. A full fix also needs the server side: account-controls-route.ts:48 refuses a STOP without
//      `expectedFingerprint` (finding R13), so either that route accepts a fingerprint-less STOP or the panel keeps a last-known fingerprint.
//      Green alone does not close L2 (the client-only fix-2 turns it green; the route then answers 400). See findings R3-2..R3-4.
//   L3 automation/BAutomationPanel.tsx:83  one 403 on a conversation control calls setManage(false), and `manage` gates STOP. The red
//      uses the origin-check refusal of the route this URL hits (onlyfans-controls/.../conversations/[conversationId]/route.ts:25-28,
//      body {schemaVersion, ok:false, outcome:"refused", error}); the B gate's twin is b-route.ts:22-24 (bRefuse, code "refused"). Both
//      classify as bFetch `denied` (b-common.ts). A 401 (expired session) takes the same path.
//   L4 automation/AccountControls.tsx:58-70 + BAutomationPanel.tsx:130-139  an unconfirmed STOP shows bFetch's B_UNCONFIRMED "The
//      outcome is not confirmed. Refresh before trying again." (no "stop") and the conversation go action (resume_automation) stays enabled.
// Fixed looks like: [data-b-emergency] rendered whatever the read says and gated only on manage + reason; manage not withdrawn by a
// 401/403 on another control; an unconfirmed stop named as a stop and holding go actions. Copy is not pinned beyond the key words.
// Mounts the real BAutomationPanel (real AccountControls, MoxyControls) inside real Next router contexts. Offline: jsdom, stub fetch,
// synthetic ids. Not wired into npm scripts.
//   nice -n 10 node --import tsx --test --test-name-pattern='^control' tests/known-red/W3-ui-onlyfans-launch-stop-gating.test.tsx   (green)
//   nice -n 10 node --import tsx --test --test-skip-pattern='^control' tests/known-red/W3-ui-onlyfans-launch-stop-gating.test.tsx   (red, ERR_ASSERTION)
import { button, click, html502, inNextApp, json, mount, stubFetch, typeInto, unmount } from "../helpers/w3-launch-dom";
import { accounts, conversations, runtime, stopRead } from "../helpers/w3-launch-fixtures";
import { CONTROL_SCHEMA } from "../../lib/onlyfans/controls";
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

const STOP_URL = "/api/onlyfans-launch/automation/accounts/of-a/emergency-stop";
type Answers = { stopGet?: (n: number) => Response; stopPost?: () => Response; control?: () => Response; resumeReady?: boolean };
async function open(a: Answers = {}) {
  const stub = stubFetch((url, method, n) => {
    if (url === "/api/onlyfans/accounts") return json(accounts("of-a"));
    if (url === "/api/onlyfans/accounts/of-a/conversations") return json(conversations());
    if (url === "/api/onlyfans/accounts/of-a/workspace/settings") return json(runtime());
    if (url === STOP_URL && method === "GET") return a.stopGet ? a.stopGet(n) : json(stopRead(a.resumeReady ? { enabled: false, readyToEnable: true } : {}));
    if (url === STOP_URL && method === "POST") return a.stopPost ? a.stopPost() : html502();
    if (url.startsWith("/api/onlyfans-controls/accounts/of-a/conversations/") && method === "POST") return a.control ? a.control() : html502();
    // Moxy ownership and engagement: not under test; the engagement panel stays hidden.
    if (url.startsWith("/api/onlyfans-configuration/") || url.startsWith("/api/onlyfans-launch/automation/accounts/of-a/")) return json({ error: "Not in this fixture." }, 503);
    throw new TypeError(`unexpected fetch ${method} ${url}`);
  });
  const { default: BAutomationPanel } = await import("../../components/onlyfans-launch/automation/BAutomationPanel");
  await mount(inNextApp(React.createElement(BAutomationPanel, { canManage: true, initialAccountId: "of-a" })));
  return stub;
}
const reasonInput = () => document.querySelector<HTMLInputElement>('[data-b-card="account"] input');
const stopButton = () => document.querySelector<HTMLButtonElement>("[data-b-emergency]");
/** Booleans and strings only: a failing assertion that inspects a jsdom node can exhaust the heap. */
const stop = () => { const b = stopButton(); return { present: Boolean(b), enabled: Boolean(b && !b.disabled) }; };
const goAction = (action: string) => { const b = document.querySelector<HTMLButtonElement>(`[data-b-conversation="c-1"] [data-b-action="${action}"]`); return { present: Boolean(b), enabled: Boolean(b && !b.disabled) }; };
const stopNote = () => (document.querySelector("[data-b-stop-note]")?.textContent ?? "").trim();

test("control: readiness read ok and a reason typed, Emergency stop is present and enabled", async () => {
  await open();
  await typeInto(reasonInput(), "Synthetic stop reason");
  assert.deepEqual(stop(), { present: true, enabled: true });
  assert.deepEqual(goAction("resume_automation"), { present: true, enabled: true }, "paused conversation: resume is a live go action");
  await unmount();
});

test("control: STOP POST answers 502, the outcome is reported unconfirmed and an identical retry is offered", async () => {
  const stub = await open({ stopPost: html502 });
  await typeInto(reasonInput(), "Synthetic stop reason");
  await click(stopButton());
  await click(button(/^Confirm emergency stop$/i));
  assert.equal(stub.posts(/emergency-stop$/).length, 1, "one STOP POST");
  assert.match(stopNote(), /unconfirmed|not confirmed/i);
  assert.equal(Boolean(button(/Retry identical account command/i)), true);
  await unmount();
});

test("L2: emergency-stop read answers 503, Emergency stop is still usable", async () => {
  const stub = await open({ stopGet: () => json({ error: "Readiness is not available." }, 503) });
  const reason = reasonInput();
  if (reason) await typeInto(reason, "Synthetic stop reason");
  assert.deepEqual(stop(), { present: true, enabled: true }, "STOP disappears when the readiness read is not ok (AccountControls.tsx:103)");
  await click(stopButton());
  await click(button(/^Confirm emergency stop$/i));
  const posts = stub.posts(/emergency-stop$/);
  assert.equal(posts.length, 1, "exactly one STOP POST");
  assert.equal(String(JSON.parse(String(posts[0].raw)).action), "emergency_stop", "the POST is a STOP (expectedFingerprint deliberately unpinned)");
  await unmount();
});

test("L1: Resume POST answers 502 unconfirmed, Emergency stop stays enabled", async () => {
  const stub = await open({ resumeReady: true, stopPost: html502 });
  await typeInto(reasonInput(), "Synthetic resume reason");
  await click(button(/^Resume with current prerequisites$/));
  await click(button(/^Confirm resume$/i));
  assert.equal(stub.posts(/emergency-stop$/).length, 1, "the resume POST happened");
  assert.match(stopNote(), /unconfirmed|not confirmed/i, "resume outcome is unconfirmed");
  assert.equal(String(reasonInput() && (reasonInput() as HTMLInputElement).value), "Synthetic resume reason", "reason still typed");
  assert.deepEqual(stop(), { present: true, enabled: true }, "an unconfirmed go command disables STOP (AccountControls.tsx:140)");
  await unmount();
});

const ORIGIN_REFUSAL = { schemaVersion: CONTROL_SCHEMA, ok: false, outcome: "refused", error: "This change must be requested from this dashboard." };
test("L3: a conversation control answers the origin-check 403, Emergency stop stays enabled", async () => {
  const stub = await open({ control: () => json(ORIGIN_REFUSAL, 403) });
  await typeInto(reasonInput(), "Synthetic stop reason");
  await click(document.querySelector('[data-b-conversation="c-1"] [data-b-action="request_takeover"]'));
  assert.equal(stub.posts(/\/conversations\/c-1$/).length, 1, "the conversation control POST happened");
  assert.deepEqual(stop(), { present: true, enabled: true }, "one 403 on a conversation control withdraws STOP (BAutomationPanel.tsx:83)");
  await unmount();
});

test("L4: STOP POST answers 502, the notice names an unconfirmed stop and conversation resume is held", async () => {
  const stub = await open({ stopPost: html502 });
  await typeInto(reasonInput(), "Synthetic stop reason");
  await click(stopButton());
  await click(button(/^Confirm emergency stop$/i));
  assert.equal(stub.posts(/emergency-stop$/).length, 1, "one STOP POST");
  const note = stopNote();
  const resume = goAction("resume_automation");
  assert.deepEqual({ namesStop: /stop/i.test(note), unconfirmed: /unconfirmed|not confirmed/i.test(note), resumePresent: resume.present, resumeHeld: !resume.enabled },
    { namesStop: true, unconfirmed: true, resumePresent: true, resumeHeld: true }, `unconfirmed STOP must be labelled a stop and hold go actions; notice was: ${note}`);
  await unmount();
});
