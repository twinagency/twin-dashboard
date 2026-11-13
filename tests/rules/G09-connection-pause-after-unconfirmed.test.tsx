// RULE G09 (W3 ui-onlyfans-preview-1 F21, REVIEW inv 7): an unconfirmed ACTIVATE (a go) keeps its exact retry, and "Pause outgoing"
// (the stop) stays enabled beside it. A stop is never harder than the pending go. F23/F24 are not G09.
// Offline: jsdom, global fetch stubbed (https://fixture.invalid), real ConnectionEditor + Next contexts. Fake curl only.
import { ACCOUNT, bodyOf, close, click, http502, json, mount, never, posts, q, routeFailure, serve, settle, submit, type, type Answer } from "../helpers/w3-preview1-dom";
import assert from "node:assert/strict";
import test, { after } from "node:test";
import React from "react";
import { CONNECTION_SCHEMA } from "../../lib/onlyfans-connections/contract";

after(close);
const connection = { accountId: ACCOUNT, revision: 4, status: "verified", ownerId: "123456", expiresAt: "2030-01-01T00:00:00.000Z", verifiedAt: "2026-11-01T00:00:00.000Z",
  lastError: null, outgoingEnabled: false, policyRevision: 1, usedUnits: 0, limitUnits: 0, mediaEnabled: false, automateNewConversations: false };
const FAKE_CURL = "curl 'https://fixture.invalid/api2/v2/users/me' -H 'x-bc: fake-bc-value' -b 'fake=fake-cookie-value'";
const refused = (status: number, outcome: "refused" | "unconfirmed" = "refused") => routeFailure(status, outcome, { schemaVersion: CONNECTION_SCHEMA });

/** Connection GET always answers the verified, connected fixture; `write` answers the command POST, `curl` the capture-from-curl POST. */
function backend(opts: { write?: Answer; curl?: Answer }) {
  serve(call => {
    if (call.method === "GET") return json({ schemaVersion: CONNECTION_SCHEMA, ok: true, connection });
    if (call.url.endsWith("/capture-from-curl")) return opts.curl ? opts.curl() : refused(400);
    return opts.write ? opts.write() : refused(400);
  });
}
async function editor() {
  const { default: ConnectionEditor } = await import("../../components/onlyfans-preview/ConnectionEditor");
  await mount(<ConnectionEditor accountId={ACCOUNT} initiallyOpen />);
  assert.ok(q("[data-of-connection-status]"), "status rendered from the fixture");
}
async function activate() {
  await type(q("[data-of-connection-limit]"), "100");
  await type(q("[data-of-connection-throttle]"), "30");
  await submit(q("[data-of-connection-activate]")?.closest("form"));
  const sent = posts().filter(call => bodyOf(call).action === "activate");
  assert.equal(sent.length, 1, "one activate command sent");
}
const pause = () => q<HTMLButtonElement>("[data-of-connection-pause]");

test("control: on a clean load Pause outgoing is enabled; a failed curl conversion was posted once to capture-from-curl", async () => {
  backend({});
  await editor();
  assert.equal(pause()?.disabled, false);
  await type(q("[data-of-connection-curl]"), FAKE_CURL);
  await click(q("[data-of-connection-curl-apply]"));
  assert.deepEqual(posts().map(call => call.url), [`/api/onlyfans-connections/accounts/${ACCOUNT}/capture-from-curl`]);
  assert.match(q("[data-of-connection-notice]")?.textContent ?? "", /could not be used/);
});

test("control: an activate refused with 409 drops the retry and says refused", async () => {
  backend({ write: () => refused(409) });
  await editor();
  await activate();
  assert.equal(q("[data-of-connection-retry]"), null);
  assert.match(q("[data-of-connection-notice]")?.textContent ?? "", /Command refused/);
});

test("control: an activate with no usable reply (502) keeps its retry", async () => {
  backend({ write: http502 });
  await editor();
  await activate();
  assert.ok(q("[data-of-connection-retry]"));
  assert.match(q("[data-of-connection-notice]")?.textContent ?? "", /Outcome not confirmed/);
});

test("F21: after an unconfirmed activate, Pause outgoing stays enabled", async () => {
  backend({ write: http502 });
  await editor();
  await activate();
  assert.ok(q("[data-of-connection-retry]"), "the go is pending a retry");
  assert.equal(pause()?.disabled, false, "the stop must not be harder than the pending go");
});

/**
 * A backend that applies commands to a revisioned connection: a write carrying the current revision lands and bumps it, a stale
 * one is refused with 409. `lostActivate` lands the activate but loses its reply (502); `getFails` lists which GETs (0-based) fail.
 */
function landingBackend(opts: { lostActivate?: boolean; getFails?: number[]; getHangs?: number[]; pauseRefused?: boolean }) {
  let current = { ...connection }, gets = 0;
  serve(call => {
    if (call.method === "GET" && (opts.getHangs ?? []).includes(gets)) { gets++; return never(); }
    if (call.method === "GET") return (opts.getFails ?? []).includes(gets++) ? http502() : json({ schemaVersion: CONNECTION_SCHEMA, ok: true, connection: current });
    const body = bodyOf(call), action = body.action as string;
    if (body.expectedRevision !== current.revision || action === "pause" && opts.pauseRefused) return refused(409);
    current = { ...current, revision: current.revision + 1, outgoingEnabled: action === "activate" };
    if (action === "activate" && opts.lostActivate) return http502();
    return json({ schemaVersion: CONNECTION_SCHEMA, ok: true, applied: true, accountId: ACCOUNT, commandKey: "c".repeat(64), recordedRevision: current.revision, action });
  });
  return { current: () => current };
}
const notice = () => q("[data-of-connection-notice]")?.textContent ?? "";

test("FL1: an activate whose POST and refresh both fail (502, 502) leaves Pause outgoing on screen and enabled", async () => {
  landingBackend({ lostActivate: true, getFails: [1] });
  await editor();
  await activate();
  assert.ok(q("[data-of-connection-retry]"), "the go is pending a retry");
  assert.ok(pause(), "Pause outgoing is gone while the retry of the go remains");
  assert.equal(pause()?.disabled, false);
});

test("FA5: an unconfirmed activate that landed (refresh failed), then Pause: the pause is sent at the moved revision and recorded", async () => {
  const server = landingBackend({ lostActivate: true, getFails: [1] });
  await editor();
  await activate();
  assert.equal(server.current().outgoingEnabled, true, "the lost activate landed");
  await click(pause());
  const sent = posts().filter(call => bodyOf(call).action === "pause");
  assert.deepEqual(sent.map(call => bodyOf(call).expectedRevision), [5], "pause sent at the stale revision and refused");
  assert.equal(server.current().outgoingEnabled, false, "outgoing still enabled after Pause");
  assert.match(notice(), /Pause recorded/);
  assert.equal(q("[data-of-connection-retry]"), null, "a confirmed pause supersedes the pending go");
});

test("C1: a refused pause keeps the pending activate's unconfirmed state and its named retry", async () => {
  landingBackend({ lostActivate: true, pauseRefused: true });
  await editor();
  await activate();
  assert.equal(q("[data-of-connection-retry]")?.textContent, "Retry enabling outgoing", "the retry names the action it repeats");
  await click(pause());
  assert.match(notice(), /Command refused/);
  assert.ok(q("[data-of-connection-retry]"), "the refusal of the stop dropped the go's uncertain state");
  assert.equal(q<HTMLFieldSetElement>("[data-of-connection-activate]")?.closest("fieldset")?.disabled, true, "the go stays held");
});

test("CF-P1: a Pause whose preflight read hangs still sends the pause, bounded, at the last-known revision", async () => {
  const server = landingBackend({ getHangs: [1] });
  await editor();
  await click(pause());
  await settle(3_300);
  const sent = posts().filter(call => bodyOf(call).action === "pause");
  assert.deepEqual(sent.map(call => bodyOf(call).expectedRevision), [4], "a hung status read blocked the stop");
  assert.equal(server.current().revision, 5, "the pause landed");
  assert.match(notice(), /Pause recorded/);
});
