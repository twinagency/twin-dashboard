// RULE G09 (W3 ui-onlyfans-preview-1 F21, REVIEW inv 7): an unconfirmed ACTIVATE (a go) keeps its exact retry, and "Pause outgoing"
// (the stop) stays enabled beside it. A stop is never harder than the pending go. F23/F24 are not G09.
// Offline: jsdom, global fetch stubbed (https://fixture.invalid), real ConnectionEditor + Next contexts. Fake curl only.
import { ACCOUNT, bodyOf, close, click, http502, json, mount, posts, q, routeFailure, serve, submit, type, type Answer } from "../helpers/w3-preview1-dom";
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

test("control: an activate with no usable reply (502) keeps 'Retry same command'", async () => {
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
