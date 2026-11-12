// KNOWN RED (W3 lane 2 ui-onlyfans-launch, findings L16 false-success and L17; REVIEW.md: a write is reported only as what the
// backend proved, and an unconfirmed outcome stays visible).
//   L16 readiness/ReadinessScreen.tsx:64-75  the backfill POST is a raw bFetch: any 2xx JSON reads "Recovery was requested", even a
//       reply for another account; lib resumeHistory (b-memory-client.ts:62-68) checks schema/ok/accountId/requested and is bypassed.
//       DEFENCE IN DEPTH, not reachable today: the real BFF (b-native-routes.ts:202-217) only answers 2xx with the URL's accountId and a
//       matching `requested`, else 502 unconfirmed, so the of-b stub needs a broken or replaced BFF. The red pins that the component
//       validates the reply itself (as resumeHistory does) instead of trusting whatever 2xx arrives.
//   L17 readiness/ReadinessScreen.tsx:76,160-162  the notice renders only inside the readiness ok branch and the screen reloads first:
//       an unconfirmed backfill followed by a failing (503) readiness read shows no outcome at all.
// Fixed looks like: the reply validated as resumeHistory does (else unconfirmed); the outcome notice rendered outside the read branch.
// Copy matched on key words only ("was requested", "not confirmed"/"unconfirmed").
// Mounts the real ReadinessScreen. Offline: jsdom, stub fetch, synthetic ids (of-a, of-b). Not wired into npm scripts.
//   nice -n 10 node --import tsx --test --test-name-pattern='^control' tests/known-red/W3-ui-onlyfans-launch-readiness-backfill.test.tsx   (green)
//   nice -n 10 node --import tsx --test --test-skip-pattern='^control' tests/known-red/W3-ui-onlyfans-launch-readiness-backfill.test.tsx   (red, ERR_ASSERTION)
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

test("L17: backfill POST 502 then readiness re-read 503, the unconfirmed outcome is still shown", async () => {
  await open(html502, () => json({ error: "Readiness is not available right now." }, 503));
  assert.equal(showsUnconfirmed(), true, "outcome notice lives inside the readiness ok branch (ReadinessScreen.tsx:160-162)");
  await unmount();
});
