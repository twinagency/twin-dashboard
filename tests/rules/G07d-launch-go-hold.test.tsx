// RULE G07d launch-go-hold (REVIEW.md inv 7: a STOP or a deny is never harder than a go, unknown-delivery holds win). rwl batch 1 B6, B11, B13.
//   B11 an unknown STOP set `unconfirmed` and a STOP in flight filled `inFlight`, and either one disabled Pause account: a brake made harder by
//       a brake. The STOP lane now holds go (resume) only; Pause waits only for its own lane.
//   B13 bFetch mapped a non-GET 503 with a JSON body and no outcome to "refused", so an unknown STOP reply lifted the STOP hold. A non-GET 503
//       is now unknown unless the body carries the explicit pre-dispatch marker (code or outcome "refused").
//   B6  the access hold (`denied`) was set only by a conversation control and lifted by any ok control, a brake included. A 401/403 from the
//       account controls, Moxy or engagement endpoints now sets it through one onDenied(accountId), and only a successful go lifts it.
// Mounts the real BAutomationPanel inside real Next router contexts. Offline: jsdom, stub fetch, synthetic ids.
//   node --import tsx --test tests/rules/G07d-launch-go-hold.test.tsx
import { button, click, deferred, html502, inNextApp, json, mount, stubFetch, typeInto, unmount } from "../helpers/w3-launch-dom";
import { accounts, conversations, followUps, moxyLegacy, moxySelected, runtime, settings, stopRead } from "../helpers/w3-launch-fixtures";
import { bFetch } from "../../lib/onlyfans/launch/b-common";
import { CONTROL_SCHEMA } from "../../lib/onlyfans/controls";
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

const stopUrl = (id: string) => `/api/onlyfans-launch/automation/accounts/${id}/emergency-stop`;
type Answers = { stopGet?: () => Response; stopPost?: (action: string) => Response | Promise<Response>; control?: () => Response | Promise<Response>;
  moxy?: (method: string) => Response; settingsPost?: () => Response };
async function open(a: Answers = {}) {
  window.sessionStorage.clear();
  const stub = stubFetch((url, method, _n, raw) => {
    if (url === "/api/onlyfans/accounts") return json(accounts("of-a"));
    if (url === "/api/onlyfans/accounts/of-a/conversations") return json(conversations("of-a"));
    if (url === "/api/onlyfans/accounts/of-a/workspace/settings") return json(runtime("of-a"));
    if (url === stopUrl("of-a") && method === "GET") return a.stopGet ? a.stopGet() : json(stopRead());
    if (url === stopUrl("of-a") && method === "POST") return a.stopPost ? a.stopPost(String(JSON.parse(String(raw)).action)) : html502();
    if (url.startsWith("/api/onlyfans-controls/accounts/of-a/conversations/") && method === "POST") return a.control ? a.control() : html502();
    if (url === "/api/onlyfans-configuration/accounts/of-a/moxy" && a.moxy) return a.moxy(method);
    if (url === "/api/onlyfans-launch/automation/accounts/of-a/settings" && method === "GET") return json(settings(3));
    if (url === "/api/onlyfans-launch/automation/accounts/of-a/settings" && method === "POST") return a.settingsPost ? a.settingsPost() : html502();
    if (url === "/api/onlyfans-launch/automation/accounts/of-a/follow-ups" && method === "GET") return json(followUps([], null));
    if (url.startsWith("/api/onlyfans-configuration/")) return json({ error: "Not in this fixture." }, 503);
    throw new TypeError(`unexpected fetch ${method} ${url}`);
  });
  const { default: BAutomationPanel } = await import("../../components/onlyfans-launch/automation/BAutomationPanel");
  await mount(inNextApp(React.createElement(BAutomationPanel, { canManage: true, initialAccountId: "of-a" })));
  return stub;
}
const reasonInput = () => document.querySelector<HTMLInputElement>('[data-b-card="account"] input');
const conv = (action: string) => { const b = document.querySelector<HTMLButtonElement>(`[data-b-conversation="c-1"] [data-b-action="${action}"]`); return Boolean(b && !b.disabled); };
const why = (action: string) => (document.querySelector(`#why-c-1-${action}`)?.textContent ?? "").trim();
const enabled = (label: RegExp) => { const b = button(label); return Boolean(b && !b.disabled); };
const stopLive = () => { const b = document.querySelector<HTMLButtonElement>("[data-b-emergency]"); return Boolean(b && !b.disabled); };
const sent = (stub: Awaited<ReturnType<typeof open>>) => stub.posts(/emergency-stop$/).map(p => String(JSON.parse(String(p.raw)).action));
const recorded = () => json({ schemaVersion: "of-launch-b.v1", ok: true, accountId: "of-a", command: { recorded: true } });
const ack = (action: string) => json({ schemaVersion: CONTROL_SCHEMA, ok: true, applied: true, commandKey: "a".repeat(64), accountId: "of-a",
  conversationId: "c-1", action, recordedRevision: 5 });
const FORBIDDEN = () => json({ error: "Forbidden." }, 403);
async function account(action: "emergency stop" | "pause") {
  await typeInto(reasonInput(), "Synthetic reason");
  await click(action === "pause" ? button(/^Pause account$/) : document.querySelector("[data-b-emergency]"));
  await click(button(new RegExp(`^Confirm ${action}$`, "i")));
}

test("B11: after an unknown STOP, Pause account stays live and sends, resume stays held", async () => {
  const stub = await open({ stopPost: action => (action === "pause" ? recorded() : html502()) });
  await account("emergency stop");
  await typeInto(reasonInput(), "Synthetic reason");
  assert.deepEqual({ pause: enabled(/^Pause account$/), resume: conv("resume_automation"), again: enabled(/^Send stop again$/) },
    { pause: true, resume: false, again: true }, "an unknown STOP disabled Pause account (AccountControls.tsx blocked: unconfirmed)");
  await account("pause");
  assert.deepEqual(sent(stub), ["emergency_stop", "pause"]);
  await unmount();
});

test("B11: Pause account stays live while a STOP is in flight", async () => {
  const post = deferred();
  const stub = await open({ stopPost: action => (action === "pause" ? recorded() : post.promise) });
  await account("emergency stop");
  await typeInto(reasonInput(), "Synthetic reason");
  assert.equal(enabled(/^Pause account$/), true, "a STOP in flight disabled Pause account (AccountControls.tsx blocked: inFlight.length)");
  await account("pause");
  assert.deepEqual(sent(stub), ["emergency_stop", "pause"]);
  post.resolve(html502());
  await typeInto(reasonInput(), "Synthetic reason");
  await unmount();
});

test("B13: bFetch maps a write 503 without an explicit refusal marker to unknown, and keeps GET and marked refusals", async () => {
  const cases: Array<[string, "GET" | "POST", unknown, string]> = [
    ["POST 503 {error}", "POST", { error: "Backend unavailable." }, "unconfirmed"],
    ["POST 503 outcome unavailable", "POST", { ok: false, outcome: "unavailable", error: "Backend unavailable." }, "unconfirmed"],
    ["POST 503 code refused (bRefuse, pre-dispatch)", "POST", { ok: false, code: "refused", error: "Not sent." }, "refused"],
    ["POST 503 outcome refused", "POST", { ok: false, outcome: "refused", error: "Not sent." }, "refused"],
    ["GET 503 {error}", "GET", { error: "Backend unavailable." }, "unavailable"],
  ];
  for (const [label, method, body, kind] of cases) {
    stubFetch(() => json(body, 503));
    assert.equal((await bFetch("/api/x", { method, body: method === "GET" ? undefined : {} })).kind, kind, label);
  }
});

test("B13: a STOP answered 503 without an outcome keeps go held", async () => {
  await open({ stopPost: () => json({ schemaVersion: "of-launch-b.v1", ok: false, error: "Backend unavailable." }, 503) });
  await account("emergency stop");
  assert.deepEqual({ resume: conv("resume_automation"), again: enabled(/^Send stop again$/), stop: stopLive() }, { resume: false, again: true, stop: true },
    "a 503 STOP reply with no outcome read as refused and lifted the STOP hold (b-common.ts bFetch)");
  await unmount();
});

test("B6: Pause account answered 403 holds go on the account; STOP and brakes stay live", async () => {
  const stub = await open({ stopPost: action => (action === "pause" ? FORBIDDEN() : recorded()) });
  await account("pause");
  assert.deepEqual({ resume: conv("resume_automation"), takeover: conv("request_takeover"), stop: stopLive() }, { resume: false, takeover: true, stop: true },
    "a 403 on Pause account did not hold go");
  await account("emergency stop");
  assert.deepEqual(sent(stub), ["pause", "emergency_stop"]);
  await unmount();
});

test("B6: an account controls read answered 401 holds go", async () => {
  await open({ stopGet: () => json({ error: "Sign in again." }, 401) });
  assert.deepEqual({ resume: conv("resume_automation"), stop: Boolean(document.querySelector("[data-b-emergency]")) }, { resume: false, stop: true });
  await unmount();
});

test("B6: Moxy read answered 401, or a Moxy Off save answered 403, holds go", async () => {
  await open({ moxy: () => json({ error: "Sign in again." }, 401) });
  assert.equal(conv("resume_automation"), false, "a 401 Moxy read did not hold go");
  await unmount();
  await open({ moxy: method => (method === "POST" ? FORBIDDEN() : json(moxySelected("off"))) });
  assert.equal(conv("resume_automation"), true, "control: go is live before the save");
  await click(button(/^Save mode$/));
  assert.equal(conv("resume_automation"), false, "a 403 Moxy save did not hold go");
  await unmount();
});

test("B6: an engagement settings save answered 403 holds go", async () => {
  await open({ moxy: () => json(moxyLegacy()), settingsPost: FORBIDDEN });
  const box = (k: string) => [...document.querySelectorAll<HTMLLabelElement>("label")].find(l => l.textContent === k)?.querySelector("input");
  await click(box("follow ups")); // turning a flag off is a brake: never held
  await click(button(/^Save engagement settings$/));
  assert.equal(conv("resume_automation"), false, "a 403 engagement save did not hold go");
  await unmount();
});

test("B6: a go that succeeds lifts the access hold, even one set while it was in flight", async () => {
  const go = deferred();
  await open({ control: () => go.promise, stopPost: action => (action === "pause" ? FORBIDDEN() : recorded()) });
  await click(document.querySelector('[data-b-conversation="c-1"] [data-b-action="resume_automation"]'));
  await account("pause");
  assert.match(why("resume_automation"), /access was refused/i, "the 403 on Pause account did not hold go");
  go.resolve(ack("resume_automation"));
  await typeInto(reasonInput(), "Synthetic reason");
  assert.equal(conv("resume_automation"), true, "a recorded resume did not lift the access hold");
  await unmount();
});
