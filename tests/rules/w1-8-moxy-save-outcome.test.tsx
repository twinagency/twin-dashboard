// RULE (characterization, green now; W1 lane 8; REVIEW.md inv 7 "No false success", "No auto-retry"; D7 only for the case below).
// MoxyControls save, exactly what is pinned: (a) a non-JSON (HTML) 502 reads unconfirmed, never saved; (b)/(b2) a 200 whose ack does
// not match the change (moxyAck: same account, mode, revision + 1) never reads saved; (c) after the POST the component re-reads the
// current mode, with no automatic retry. NOT pinned: D7 classification of a non-ok JSON reply. MoxyControls.tsx:84 shows any non-ok
// `error` string as the final notice without reading status/`outcome` (finding P18; mitigated by the route, see the findings file).
// Path: a Moxy-selected account (mode off, revision 3, manager, canManage) and "Save mode" with the current mode, the simplest real path
// to an enabled Save that does not go through the hard-coded creator select (P2). Copy is not pinned beyond "saved" vs "unconfirmed".
// Mutation-proven (RISKS D15): tests/rules/mutations/W1-preview-shell-launch/mut-1 (drop moxyAck: (b) red), mut-2 (catch says saved: (a) red).
// Not wired into npm scripts; init.sh's rules-tests glob (tests/rules/*.test.*) picks it up. Offline: jsdom, stub fetch, synthetic ids.
//   node --import tsx --test tests/rules/w1-8-moxy-save-outcome.test.tsx   (green)
import { button, click, html502, json, liveText, moxyAckBody, moxySelected, mount, settle, stubFetch, unmount } from "../helpers/w1-8-dom";
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

const MOXY = "/api/onlyfans-configuration/accounts/of-a/moxy";
async function saveWith(post: () => Response | Promise<Response>) {
  const stub = stubFetch((url, method) => {
    if (url !== MOXY) throw new TypeError(`unexpected fetch ${url}`);
    return method === "POST" ? post() : json(moxySelected("off", { revision: 3 }));
  });
  const { default: MoxyControls } = await import("../../components/onlyfans-launch/automation/MoxyControls");
  await mount(React.createElement(MoxyControls, { accountId: "of-a", manage: true, onOwnership: () => {} }));
  await settle();
  const save = button(/^save/i);
  assert.ok(save && !save.disabled, "Save is enabled for a manager on a Moxy-selected account");
  const readsBefore = stub.count(/\/moxy$/);
  await click(save); await settle();
  const posts = stub.calls.filter(c => c.method === "POST");
  assert.equal(posts.length, 1, "one POST, never retried automatically");
  assert.deepEqual(posts[0].body, { expectedRevision: 3, mode: "off", settings: moxySelected("off").moxy.settings });
  const notices = liveText();
  await unmount();
  return { notices, readsBefore, readsAfter: stub.count(/\/moxy$/) };
}
const saidSaved = (notices: string[]) => notices.some(n => /\bsaved\b/i.test(n));
const saidUnconfirmed = (notices: string[]) => notices.some(n => /unconfirmed|not confirmed|could not be confirmed/i.test(n));

test("control: a matching ack (mode off, revision 4) reads saved", async () => {
  const { notices } = await saveWith(() => json(moxyAckBody("off", 4)));
  assert.ok(saidSaved(notices), `notices: ${JSON.stringify(notices)}`);
});

test("(a) an HTML 502 (non-JSON) reads unconfirmed, never saved", async () => {
  const { notices } = await saveWith(html502);
  assert.equal(saidSaved(notices), false, `claimed saved: ${JSON.stringify(notices)}`);
  assert.ok(saidUnconfirmed(notices), `notices: ${JSON.stringify(notices)}`);
});

test("(b) a 200 whose ack revision does not match (3, not 4) never reads saved", async () => {
  const { notices } = await saveWith(() => json(moxyAckBody("off", 3)));
  assert.equal(saidSaved(notices), false, `claimed saved on a mismatched ack: ${JSON.stringify(notices)}`);
});

test("(b2) a 200 whose ack mode does not match (preview, not off) never reads saved", async () => {
  const { notices } = await saveWith(() => json(moxyAckBody("preview", 4)));
  assert.equal(saidSaved(notices), false, `claimed saved on a mismatched ack: ${JSON.stringify(notices)}`);
});

test("(c) after any POST outcome the component re-reads the current mode", async () => {
  const outcomes: Array<[string, () => Response | Promise<Response>]> = [["html 502", html502], ["mismatched ack", () => json(moxyAckBody("off", 3))],
    ["lost reply", async () => { throw new TypeError("connection reset"); }], ["matching ack", () => json(moxyAckBody("off", 4))]];
  for (const [name, post] of outcomes) {
    const { readsBefore, readsAfter } = await saveWith(post);
    assert.equal(readsAfter, readsBefore + 1, `${name}: no re-read after the POST`);
  }
});
