// RULE G07b draft-loss (regression guard, finding L8 data-risk: a refused save never wipes the draft). Promoted from known-red
// W3-ui-onlyfans-launch-draft-loss. PersonalityScreen keeps the ReviewEditor mounted (disabled) through the re-read, so a 422 refusal
// followed by an unchanged re-read (same revision, loading phase committed) leaves the typed tone in the editor. The re-read is a deferred response the test
// releases itself, after asserting it was issued (2 GETs) and its "Loading personality" phase rendered. Refusals carry no new revision:
// a real 409 brings one and the revision-keyed remount then rightly shows the server copy. A failed (500) or pending (503) re-read keeps
// the draft too, disabled, with the read error and Retry shown. Switching accounts never paints of-a's tone, revision or binding under of-b: the
// shared useJsonResource (a-shared.tsx) returns loading, not the old url's data, in the render where the url changes. The screen is
// mounted without a key, since AbcWorkspace's key remount would hide the leak.
// Controls: refusal shown with one POST, and 502 -> identical retry offered and the hold kept, for personality and engagement settings.
// The engagement-settings half of L8 is not G07b and stays in the known-red file.
// Mounts the real PersonalityScreen (real ConfigurationEditor, its read answered 503) and the real EngagementPanel (editPolicy on,
// so the settings form renders). Offline: jsdom, stub fetch, synthetic ids.
//   node --import tsx --test tests/rules/G07b-draft-loss.test.tsx
import { button, click, deferred, html502, inNextApp, json, mount, pageText, settle, stubFetch, typeInto, unmount } from "../helpers/w3-launch-dom";
import { access, followUps, launchEnvelope, personality, personalityHistory, settings } from "../helpers/w3-launch-fixtures";
import { LAUNCH_SCHEMA } from "../../lib/onlyfans/launch/a-types";
import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";

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
async function editAndSavePersonality(p: Awaited<ReturnType<typeof openPersonality>>, reread = () => json(launchEnvelope(personality()))) {
  assert.equal(String(tone()?.value), "Short, warm replies.", "editor shows the saved review");
  await typeInto(tone(), TONE);
  await click(button(/^Save complete review as a new draft$/));
  assert.equal(p.stub.calls.filter(c => c.method === "GET" && c.url === `${ABC}/personality`).length, 2, "the save re-read the personality");
  assert.equal(pageText().includes("Loading personality"), true, "the re-read's loading phase committed");
  p.reread.resolve(reread());
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

for (const [what, reread, error] of [
  ["503 (pending)", () => json({ error: "Synthetic: personality backend unavailable." }, 503), "Synthetic: personality backend unavailable."],
  ["500 (error)", () => json({ error: "Synthetic: personality read failed." }, 500), "Synthetic: personality read failed."],
] as const) {
  test(`L8 personality: after a 422 refusal the re-read answers ${what}, the typed tone stays, disabled, with the read error and Retry shown`, async () => {
    await editAndSavePersonality(await openPersonality(refused422), reread);
    const retry = button(/^Retry$/);
    assert.deepEqual({ tone: String(tone()?.value), disabled: Boolean(tone()?.disabled), error: pageText().includes(error), retry: Boolean(retry && !retry.disabled) },
      { tone: TONE, disabled: true, error: true, retry: true }, "a failed re-read dropped the draft (PersonalityScreen.tsx shown/lastOk)");
    await unmount();
  });
}

test("personality account switch: of-a's tone, revision and binding never render under of-b, and of-b's read is what shows", async () => {
  const ABC_B = "/api/onlyfans-launch/abc/accounts/of-b", readB = deferred();
  const b = structuredClone(personality());
  b.revision = 5; b.bindingId = "binding-b"; b.document.review.persona = "Tone of account B.";
  const stub = stubFetch((url, method) => {
    for (const base of [ABC, ABC_B]) {
      const acct = base === ABC ? "of-a" : "of-b";
      if (url === `${base}/access`) return json(access(true, acct));
      if (url === `${base}/personality`) return base === ABC ? json(launchEnvelope(personality())) : readB.promise;
      if (url.startsWith(`${base}/personality/history`)) return json(launchEnvelope(personalityHistory(), acct));
    }
    if (url.startsWith("/api/onlyfans-configuration/")) return json({ error: "Not in this fixture." }, 503);
    throw new TypeError(`unexpected fetch ${method} ${url}`);
  });
  const { default: PersonalityScreen } = await import("../../components/onlyfans-launch/personality/PersonalityScreen");
  let switchTo: (id: string) => void = () => {};
  function Host() { const [id, setId] = React.useState("of-a"); switchTo = setId; return React.createElement(PersonalityScreen, { accountId: id }); }
  await mount(inNextApp(React.createElement(Host), "/onlyfans/launch"));
  assert.equal(String(tone()?.value), "Short, warm replies.", "of-a's review shows first");
  // Every DOM change from the switch on is sampled, so a single commit that paints of-a under of-b is caught even if a later one hides it.
  const leaks: string[] = [];
  const sample = () => { const t = tone(); if (t?.value === "Short, warm replies.") leaks.push("tone");
    if (/Personality revision 1\b/.test(document.body.textContent ?? "")) leaks.push("revision"); };
  const observer = new (document.defaultView!.MutationObserver)(sample);
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
  await act(async () => { switchTo("of-b"); }); await settle(); await settle();
  sample();
  assert.equal(stub.calls.some(c => c.url === `${ABC_B}/personality`), true, "of-b's personality was requested");
  assert.deepEqual({ leaks: [...new Set(leaks)], editor: Boolean(tone()) }, { leaks: [], editor: false }, "of-a's personality rendered under of-b");
  readB.resolve(json(launchEnvelope(b, "of-b")));
  await settle(); await settle();
  observer.disconnect();
  assert.deepEqual({ leaks: [...new Set(leaks)], tone: String(tone()?.value), revision: /Personality revision 5\b/.test(pageText()) },
    { leaks: [], tone: "Tone of account B.", revision: true });
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
  await mount(React.createElement(EngagementPanel, { accountId: "of-a", manage: true, goHold: null, editPolicy: true, onDenied: () => {} }));
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
