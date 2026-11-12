// KNOWN RED (W3 ui-onlyfans-preview-1, findings F21 F23 F24 in docs/review/W3/ui-onlyfans-preview-1.md). Team's Claude owns the fixes.
// F21 components/onlyfans-preview/ConnectionEditor.tsx:138,182: "Pause outgoing" is disabled={busy || hasRetry} and :138 sets
//     hasRetry for every unconfirmed command, so after an unconfirmed ACTIVATE (a go) the retry is enabled and Pause (the stop) is
//     disabled until "Discard retry" (REVIEW inv 7: STOP never harder than go).
// F23 ConnectionEditor.tsx:132: the client status list [400,404,409,413,503] files a 503 as "Command refused" and drops the exact
//     retry without reading the body `outcome` the route forwards; a 503 outcome "unconfirmed" on activate reads refused while
//     outgoing may already be on (D7).
//     Client half only: classify by body outcome; the harm closes only with the lib-onlyfans-1 / lib-onlyfans-4-plus2 relabel of upstream 503
//     (at HEAD onlyfans-connections/backend.ts:13,17 label an upstream 503 outcome "refused" and send unconfirmed as 502).
// F24 ConnectionEditor.tsx:37-40,106,110: the pasted curl (OnlyFans cookies and signing headers in real use) stays in the textarea
//     after a failed conversion; clearSecrets() never clears curlText (inv 6, "secret fields are blurred").
// Not wired into npm scripts; init.sh does not run it yet (shared file; wiring decided at window close). Offline: jsdom, global fetch stubbed (https://fixture.invalid), real ConnectionEditor + Next contexts.
// Fixture curl text is an obvious fake (no cookie, token or OnlyFans URL).
import { ACCOUNT, bodyOf, calls, close, click, http502, json, lostReply, mount, posts, q, routeFailure, serve, submit, type, type Answer } from "../helpers/w3-preview1-dom";
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

test("F23: an activate answered 503 outcome unconfirmed keeps the exact retry", async () => {
  backend({ write: () => refused(503, "unconfirmed") });
  await editor();
  await activate();
  assert.doesNotMatch(q("[data-of-connection-notice]")?.textContent ?? "", /Command refused/, "an unconfirmed outcome is not a refusal");
  assert.ok(q("[data-of-connection-retry]"), "the exact retry is kept");
});

test("F24: a pasted curl is cleared from the page after a failed conversion", async () => {
  for (const [answer, curl] of [["400", () => refused(400)], ["lost reply", lostReply]] as const) {
    backend({ curl });
    await editor();
    await type(q("[data-of-connection-curl]"), FAKE_CURL);
    await click(q("[data-of-connection-curl-apply]"));
    assert.equal(calls.filter(call => call.url.endsWith("/capture-from-curl")).length, 1, `${answer}: conversion attempted`);
    assert.equal(q<HTMLTextAreaElement>("[data-of-connection-curl]")?.value, "", `${answer}: the credential-bearing curl must not stay on the page`);
  }
});
