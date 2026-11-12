// KNOWN RED (W3 lane 2 ui-onlyfans-launch, finding L7 data-risk; REVIEW.md inv 7 / RISKS D7: unconfirmed is not refused).
//   components/onlyfans-launch/a-shared.tsx:60-61  postCommand returns `refused` for any JSON error reply below 500 or equal to 503
//   that lacks a recognised `outcome`: such a reply would read as "not applied", and PersonalityScreen/PurchasesScreen would drop the
//   "Retry identical" hold.
// LATENT: no real route produces the red stubs today. The launch BFF's own pre-call 503 (a-route.ts:22) carries
// `outcome:"unavailable"` (kept, see control), and an upstream 503 also arrives with outcome "unavailable", which is finding L6, not
// this one. lib/onlyfans/route.ts:71's pre-call 503 IS on the command path (a-route.ts:57 requireOnlyFansRead write:true) and carries
// `state:"unavailable"`, `code:"agency_unavailable"` and no `outcome`; refused is correct for it (D7, pre-call). The red stubs carry no
// `code`, so they are not that body; no control pins it yet (findings R3-1). The reds pin the classifier so a future proxy, rate limiter or route that answers 429 / bare 503 after a write was handed on
// is not read as refused.
// Fixed looks like: `refused` only for statuses that prove nothing was applied (the D7 set) or an explicit BFF outcome
// (`refused`, pre-call `unavailable`); everything else `unconfirmed`. A fix should recognise route.ts's `code` marker (or that
// route should add `outcome`) rather than read every bare 503 as refused.
// Pure: real postCommand, global fetch stubbed (tests/helpers/w3-launch-fetch.ts). Offline, synthetic ids. Not wired into npm scripts.
//   nice -n 10 node --import tsx --test --test-name-pattern='^control' tests/known-red/W3-ui-onlyfans-launch-postcommand-d7.test.ts   (green)
//   nice -n 10 node --import tsx --test --test-skip-pattern='^control' tests/known-red/W3-ui-onlyfans-launch-postcommand-d7.test.ts   (red, ERR_ASSERTION)
import { html502, json, stubFetch } from "../helpers/w3-launch-fetch";
import assert from "node:assert/strict";
import test, { after } from "node:test";
import React from "react";
Object.assign(globalThis, { React });
const original = globalThis.fetch;
after(() => { globalThis.fetch = original; });

const COMMAND = { path: "personality/import", id: null, body: { expectedRevision: 1, expectedBindingId: "binding-a" } };
async function outcome(response: () => Response) {
  const stub = stubFetch(() => response());
  const { postCommand } = await import("../../components/onlyfans-launch/a-shared");
  const r = await postCommand("of-a", COMMAND);
  assert.deepEqual(stub.calls.map(c => `${c.method} ${c.url}`), ["POST /api/onlyfans-launch/abc/accounts/of-a/command"], "exactly one command POST");
  return r.ok ? "ok" : r.outcome;
}

test("control: 409 JSON is refused; 502 is unconfirmed; BFF 503 with outcome unavailable stays unavailable", async () => {
  assert.equal(await outcome(() => json({ error: "Revision changed." }, 409)), "refused");
  assert.equal(await outcome(html502), "unconfirmed");
  assert.equal(await outcome(() => json({ outcome: "unavailable", error: "Backend not configured." }, 503)), "unavailable", "BFF pre-call 503 keeps its explicit outcome");
});

test("L7: a 429 JSON error with no outcome is unconfirmed, not refused", async () => {
  assert.equal(await outcome(() => json({ error: "Too many requests." }, 429)), "unconfirmed");
});

test("L7: a 503 JSON error with no outcome is unconfirmed, not refused", async () => {
  assert.equal(await outcome(() => json({ error: "Upstream unavailable." }, 503)), "unconfirmed");
});
