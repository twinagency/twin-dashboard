// KNOWN RED (W3 lane 2 ui-onlyfans-launch, finding L8 data-risk: a refused save wipes the draft).
//   personality/PersonalityScreen.tsx:452,485  every submit reload()s; useJsonResource sets `loading` (a-shared.tsx:30), the
//      ReviewEditor (`state.kind === "ok"` only) unmounts and remounts from the server copy, so a refusal throws away the typed tone.
//   automation/EngagementPanel.tsx:285,328-334  same for the engagement Settings form: a refusal discards every edited field; on a 502
//      (unconfirmed) the disabled form shows the SERVER values while "Retry identical engagement settings" (:344) would post the
//      hidden edited `pendingSettings`, so the operator cannot see what the retry sends.
// Fixed looks like: the editor (or the parent-owned draft) survives the reload; while a retry is offered the form shows the pending
// body. The re-read is a deferred response the test releases itself: before releasing it, every test asserts the re-read was issued
// (2 GETs) and its loading phase committed ("Loading <label>…" shown), so the red cannot pass on a re-read that never rendered.
// The loading indicator, not "editor gone", is the precondition: a fix that keeps the editor mounted while reloading AND still shows
// the loading text turns green; a fix that hides loading altogether stays red (findings R3-5).
// Refusals are a 422 (personality command) / 400 (engagement settings) that carry no new revision: a real 409 brings a new revision,
// and the revision-keyed remount (PersonalityScreen.tsx:487, EngagementPanel.tsx:328) would then hide a correct fix. Copy not pinned:
// refusal text comes from the fixture; fields by id/aria-label.
// Controls: refusal shown with one POST, and 502 -> identical retry offered and the hold kept, for both write paths.
// Mounts the real PersonalityScreen (real ConfigurationEditor, its read answered 503) and the real EngagementPanel. Offline: jsdom,
// stub fetch, synthetic ids. Not wired into npm scripts.
//   nice -n 10 node --import tsx --test --test-name-pattern='^control' tests/known-red/W3-ui-onlyfans-launch-draft-loss.test.tsx   (green)
//   nice -n 10 node --import tsx --test --test-skip-pattern='^control' tests/known-red/W3-ui-onlyfans-launch-draft-loss.test.tsx   (red, ERR_ASSERTION)
import { button, click, deferred, html502, inNextApp, json, mount, pageText, settle, stubFetch, typeInto, unmount } from "../helpers/w3-launch-dom";
import { access, followUps, launchEnvelope, personality, personalityHistory, settings } from "../helpers/w3-launch-fixtures";
import { LAUNCH_SCHEMA } from "../../lib/onlyfans/launch/a-types";
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

const ABC = "/api/onlyfans-launch/abc/accounts/of-a";
const REFUSAL = "Synthetic refusal: the personality review was not accepted.";
const refused422 = () => json({ schemaVersion: LAUNCH_SCHEMA, ok: false, outcome: "refused", error: REFUSAL }, 422);
async function openPersonality(post: () => Response) {
  const reread = deferred();
  const stub = stubFetch((url, method, n) => {
    if (url === `${ABC}/access`) return json(access(true));
    // First read answers at once; the re-read after the command (same revision) waits until the test releases it.
    if (url === `${ABC}/personality`) return n === 0 ? json(launchEnvelope(personality())) : n === 1 ? reread.promise : json(launchEnvelope(personality()));
    if (url.startsWith(`${ABC}/personality/history`)) return json(launchEnvelope(personalityHistory()));
    if (url === `${ABC}/command` && method === "POST") return post();
    if (url.startsWith("/api/onlyfans-configuration/")) return json({ error: "Not in this fixture." }, 503);
    throw new TypeError(`unexpected fetch ${method} ${url}`);
  });
  const { default: PersonalityScreen } = await import("../../components/onlyfans-launch/personality/PersonalityScreen");
  await mount(inNextApp(React.createElement(PersonalityScreen, { accountId: "of-a" }), "/onlyfans/launch"));
  return { stub, reread };
}
const tone = () => document.querySelector<HTMLTextAreaElement>("#personality-tone");
const TONE = "Edited tone the operator typed";
/** Types, saves, checks the re-read is in flight and rendered as loading, then releases it. */
async function editAndSavePersonality(p: Awaited<ReturnType<typeof openPersonality>>) {
  assert.equal(String(tone()?.value), "Short, warm replies.", "editor shows the saved review");
  await typeInto(tone(), TONE);
  await click(button(/^Save complete review as a new draft$/));
  assert.equal(p.stub.calls.filter(c => c.method === "GET" && c.url === `${ABC}/personality`).length, 2, "the save re-read the personality");
  assert.equal(pageText().includes("Loading personality"), true, "the re-read's loading phase committed");
  p.reread.resolve(json(launchEnvelope(personality())));
  await settle(); await settle();
}

test("control: personality save answers 422 refused, one command is posted and the refusal is shown", async () => {
  const p = await openPersonality(refused422);
  await editAndSavePersonality(p);
  assert.equal(p.stub.posts(/\/command$/).length, 1, "one command POST");
  assert.equal(pageText().includes(REFUSAL), true, "refusal notice shown");
  await unmount();
});

test("control: personality save answers 502, the identical retry is offered and the editor is held", async () => {
  const p = await openPersonality(html502);
  await editAndSavePersonality(p);
  assert.equal(p.stub.posts(/\/command$/).length, 1, "one command POST, no automatic retry");
  const retry = button(/^Retry identical personality command$/);
  assert.deepEqual({ retry: Boolean(retry && !retry.disabled), editorHeld: Boolean(tone()?.disabled) }, { retry: true, editorHeld: true });
  await unmount();
});

test("L8 personality: after a 422 refusal and an unchanged re-read, the typed tone is still in the editor", async () => {
  await editAndSavePersonality(await openPersonality(refused422));
  assert.equal(String(tone()?.value), TONE, "refused save replaced the draft with the server copy (PersonalityScreen.tsx:452,485)");
  await unmount();
});

const AUTO = "/api/onlyfans-launch/automation/accounts/of-a";
const SETTINGS_REFUSAL = "Synthetic refusal: settings were not accepted.";
const refused400 = () => json({ error: SETTINGS_REFUSAL }, 400);
async function openEngagement(post: () => Response) {
  const reread = deferred();
  const stub = stubFetch((url, method, n) => {
    if (url === `${AUTO}/settings` && method === "GET") return n === 0 ? json(settings(3)) : n === 1 ? reread.promise : json(settings(3));
    if (url === `${AUTO}/settings` && method === "POST") return post();
    if (url.startsWith(`${AUTO}/follow-ups`) && method === "GET") return json(followUps([]));
    throw new TypeError(`unexpected fetch ${method} ${url}`);
  });
  const { default: EngagementPanel } = await import("../../components/onlyfans-launch/automation/EngagementPanel");
  await mount(React.createElement(EngagementPanel, { accountId: "of-a", manage: true }));
  return { stub, reread };
}
const followUpText = () => document.querySelector<HTMLTextAreaElement>('textarea[aria-label="follow up text"]');
const EDIT = "Edited follow-up text the operator typed";
async function editAndSaveSettings(e: Awaited<ReturnType<typeof openEngagement>>) {
  assert.equal(String(followUpText()?.value), "Server follow-up text", "form shows the saved settings");
  await typeInto(followUpText(), EDIT);
  await click(button(/^Save engagement settings$/));
  assert.equal(e.stub.calls.filter(c => c.method === "GET" && c.url === `${AUTO}/settings`).length, 2, "the save re-read the settings");
  assert.equal(pageText().includes("Loading engagement settings"), true, "the re-read's loading phase committed");
  e.reread.resolve(json(settings(3)));
  await settle(); await settle();
}

test("control: engagement save answers 400, one POST and the refusal is shown", async () => {
  const e = await openEngagement(refused400);
  await editAndSaveSettings(e);
  assert.equal(e.stub.posts(/\/settings$/).length, 1);
  assert.equal(pageText().includes(SETTINGS_REFUSAL), true);
  await unmount();
});

test("control: engagement save answers 502, the identical retry is offered and the form is held", async () => {
  const e = await openEngagement(html502);
  await editAndSaveSettings(e);
  assert.equal(e.stub.posts(/\/settings$/).length, 1, "one POST, no automatic retry");
  const retry = button(/^Retry identical engagement settings$/);
  assert.deepEqual({ retry: Boolean(retry && !retry.disabled), formHeld: Boolean(followUpText()?.matches(":disabled")) }, { retry: true, formHeld: true });
  await unmount();
});

test("L8 engagement: after a 400 refusal and an unchanged re-read, the edited follow-up text is kept", async () => {
  await editAndSaveSettings(await openEngagement(refused400));
  assert.equal(String(followUpText()?.value), EDIT, "refused save replaced the edits with the server values (EngagementPanel.tsx:285,328-334)");
  await unmount();
});

test("L8 engagement: while 'Retry identical engagement settings' is shown, the form shows the pending (edited) value", async () => {
  await editAndSaveSettings(await openEngagement(html502));
  assert.equal(Boolean(button(/^Retry identical engagement settings$/)), true);
  assert.equal(String(followUpText()?.value), EDIT, "the retry posts the edited body but the form shows the server value (EngagementPanel.tsx:332,344)");
  await unmount();
});
