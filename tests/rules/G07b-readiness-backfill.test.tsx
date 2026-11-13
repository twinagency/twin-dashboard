// RULE G07b readiness-backfill (regression guard, finding L16 false-success; REVIEW.md: a write is reported only as what the backend
// proved). Promoted from known-red W3-ui-onlyfans-launch-readiness-backfill. ReadinessScreen validates the backfill reply as
// lib resumeHistory does (schema, ok, this accountId, requested): a 2xx for another account is unconfirmed, never "was requested".
// Defence in depth: the real BFF only answers 2xx with the URL's accountId, so the of-b stub stands for a broken or replaced BFF.
// Copy matched on key words only ("was requested", "not confirmed"/"unconfirmed"). L17 of the same known-red file is not G07b and stays there.
// Mounts the real ReadinessScreen. Offline: jsdom, stub fetch, synthetic ids (of-a, of-b).
//   node --import tsx --test tests/rules/G07b-readiness-backfill.test.tsx
import { button, click, html502, json, mount, pageText, stubFetch, unmount } from "../helpers/w3-launch-dom";
import { access, launchEnvelope, readiness } from "../helpers/w3-launch-fixtures";
import { B_CONTRACT_SCHEMA } from "../../lib/onlyfans/launch/b-common";
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

const ABC = "/api/onlyfans-launch/abc/accounts/of-a";
const BACKFILL = "/api/onlyfans-launch/memory/accounts/of-a/backfill";
async function open(post: () => Response, reread: () => Response = () => json(launchEnvelope(readiness({ backfill: true })))) {
  const stub = stubFetch((url, method, n) => {
    if (url === `${ABC}/access`) return json(access(true));
    if (url === `${ABC}/readiness`) return n === 0 ? json(launchEnvelope(readiness({ backfill: true }))) : reread();
    if (url === BACKFILL && method === "POST") return post();
    throw new TypeError(`unexpected fetch ${method} ${url}`);
  });
  const { default: ReadinessScreen } = await import("../../components/onlyfans-launch/readiness/ReadinessScreen");
  await mount(React.createElement(ReadinessScreen, { accountId: "of-a", onGo: () => {} }));
  await click(button(/^Request\/resume history recovery$/));
  assert.equal(stub.posts(/\/backfill$/).length, 1, "one backfill POST");
  assert.equal(stub.calls.filter(c => c.url === `${ABC}/readiness`).length, 2, "readiness re-read after the POST");
  return stub;
}
const ack = (accountId: string) => () => json({ schemaVersion: B_CONTRACT_SCHEMA, ok: true, accountId, requested: "account" });
const claimsRequested = () => /was requested/i.test(pageText());
const showsUnconfirmed = () => /not confirmed|unconfirmed/i.test(pageText());

test("control: backfill acknowledged for this account, the notice says recovery was requested", async () => {
  await open(ack("of-a"));
  assert.equal(claimsRequested(), true);
  await unmount();
});

test("L16: backfill reply is for another account (of-b), the notice does not claim recovery was requested", async () => {
  await open(ack("of-b"));
  assert.equal(claimsRequested(), false, "a 2xx for another account reads as a recovery request (ReadinessScreen.tsx:64-75)");
  await unmount();
});

test("control: backfill POST 502 then readiness re-read ok, the unconfirmed outcome is shown", async () => {
  await open(html502);
  assert.equal(showsUnconfirmed(), true);
  await unmount();
});
