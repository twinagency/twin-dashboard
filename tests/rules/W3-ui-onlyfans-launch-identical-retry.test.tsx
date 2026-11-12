/**
 * Characterization (W3 lane 2 ui-onlyfans-launch; REVIEW.md inv 7 / RISKS D7: an unconfirmed write is never re-sent on its own, and
 * the operator's retry is the IDENTICAL command, so the server derives the same command key, a-route.ts:44). Holds at HEAD:
 *   purchases/PurchasesScreen.tsx:37,73       ledger command 502 -> "Retry identical ledger command" posts the stored `pending` body.
 *   automation/EngagementPanel.tsx:273-277,344  settings 502 -> "Retry identical engagement settings" posts the stored `pendingSettings`.
 * Both: no second POST without a click, and the retry body is byte-identical to the first POST even though the re-read state moved on
 * (new scan fingerprint / settings revision), so a "rebuild from current state" retry is caught. Mutation proofs:
 * tests/rules/mutations/W3-ui-onlyfans-launch/. Offline: jsdom, stub fetch, synthetic ids.
 */
import { button, click, html502, json, mount, settle, stubFetch, unmount } from "../helpers/w3-launch-dom";
import { access, followUps, launchEnvelope, ledger, ledgerEvidence, settings } from "../helpers/w3-launch-fixtures";
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

const ABC = "/api/onlyfans-launch/abc/accounts/of-a";
test("an unconfirmed ledger command is retried only on click, with a byte-identical body", async () => {
  const stub = stubFetch((url, method, n) => {
    if (url === `${ABC}/access`) return json(access(true));
    // After the lost reply the scan state moved on: a body rebuilt from current state would differ.
    if (url === `${ABC}/purchases`) return json(launchEnvelope(ledger("of-a", (n === 0 ? "c" : "9").repeat(64))));
    if (url.startsWith(`${ABC}/purchases/evidence`)) return json(launchEnvelope(ledgerEvidence()));
    if (url === `${ABC}/command` && method === "POST") return html502();
    throw new TypeError(`unexpected fetch ${method} ${url}`);
  });
  const { default: PurchasesScreen } = await import("../../components/onlyfans-launch/purchases/PurchasesScreen");
  await mount(React.createElement(PurchasesScreen, { accountId: "of-a" }));
  await click(document.querySelector("[data-ledger-retry]"));
  await settle(200);
  const posts = () => stub.posts(/\/command$/).map(c => String(c.raw));
  assert.equal(posts().length, 1, "one POST, no automatic retry");
  assert.equal(JSON.parse(posts()[0]).path, "ledger/retry");
  const retry = button(/^Retry identical ledger command$/);
  assert.equal(Boolean(retry && !retry.disabled), true, "identical retry offered after the 502");
  await click(retry);
  await settle(200);
  assert.equal(posts().length, 2, "exactly one more POST, on the click");
  assert.equal(posts()[1] === posts()[0], true, "retry body is byte-identical to the first POST");
  await unmount();
});

const AUTO = "/api/onlyfans-launch/automation/accounts/of-a";
test("unconfirmed engagement settings are retried only on click, with a byte-identical body", async () => {
  const stub = stubFetch((url, method, n) => {
    if (url === `${AUTO}/settings` && method === "GET") return json(settings(n === 0 ? 3 : 4));
    if (url === `${AUTO}/settings` && method === "POST") return html502();
    if (url.startsWith(`${AUTO}/follow-ups`) && method === "GET") return json(followUps([]));
    throw new TypeError(`unexpected fetch ${method} ${url}`);
  });
  const { default: EngagementPanel } = await import("../../components/onlyfans-launch/automation/EngagementPanel");
  await mount(React.createElement(EngagementPanel, { accountId: "of-a", manage: true }));
  await click(button(/^Save engagement settings$/));
  await settle(200);
  const posts = () => stub.posts(/\/settings$/).map(c => String(c.raw));
  assert.equal(posts().length, 1, "one POST, no automatic retry");
  assert.equal(JSON.parse(posts()[0]).expectedRevision, 3);
  const retry = button(/^Retry identical engagement settings$/);
  assert.equal(Boolean(retry && !retry.disabled), true, "identical retry offered after the 502");
  await click(retry);
  await settle(200);
  assert.equal(posts().length, 2, "exactly one more POST, on the click");
  assert.equal(posts()[1] === posts()[0], true, "retry body is byte-identical to the first POST");
  await unmount();
});
