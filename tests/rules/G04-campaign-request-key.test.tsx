// RULE G04 R1 (#390 findings 2, 6, 7): components/onlyfans-preview/CampaignManager.tsx create requestKey.
// 2: a 503 with no body or a non-JSON body (a proxy) was filed "refused" and the kept retry dropped, so the next Queue minted a new
//    requestKey after a write that may have been forwarded. Only a body the route produced (campaignRefuse, outcome "refused") is a refusal.
// 6: once a create is unconfirmed, a later refusal released it; only a recorded ack may release it.
// 7: the held create lived in component state, so navigating away and back lost it. It now lives in a module store per account
//    (in-page only; a reload drops it, G04c). Each test uses its own account so a held create never reaches the next test.
// Offline: jsdom, global fetch stubbed (https://fixture.invalid), real CampaignManager + Next contexts.
import { bodyOf, button, calls, click, close, json, lostReply, mount, q, routeFailure, serve, submit, unmount, type Call } from "../helpers/w3-preview1-dom";
import assert from "node:assert/strict";
import test, { after } from "node:test";
import React from "react";
import { CAMPAIGN_SCHEMA } from "../../lib/onlyfans/campaigns";
import { EMPTY_DRAFT, rememberDraft } from "../../lib/onlyfans/campaign-audience";

after(close);
const SENDER = { creatorName: "Fixture Creator", handle: "fixture" };
const ack = (accountId: string) => json({ schemaVersion: CAMPAIGN_SCHEMA, ok: true, commandKey: "c".repeat(64), accountId, campaignId: "0a1b2c3d-1111-4222-8333-444455556699", recordedRevision: 1 });
const refused = (status: number) => routeFailure(status, "refused", { schemaVersion: CAMPAIGN_SCHEMA });
/** Every read answers empty; the n-th create POST is answered by `create(n)`. */
async function manager(accountId: string, create: (n: number) => Response | Promise<Response>) {
  let n = 0;
  serve((call: Call) => {
    if (call.method === "POST") return create(n++);
    if (call.url.includes("/workspace/content")) return json({ workspace: { schemaVersion: "of-workspace.v2", section: "content", accountId, asOf: "2026-11-01T10:00:00.000Z",
      lastCompleteSyncAt: null, historyRecoveryRequired: false, providerConnectionVerified: true, nextCursor: null, items: [] } });
    if (call.url.includes("/conversations")) return json({ page: { items: [], nextCursor: null } });
    return json({ schemaVersion: CAMPAIGN_SCHEMA, ok: true, accountId, campaigns: [], truncated: false });
  });
  const { default: CampaignManager } = await import("../../components/onlyfans-preview/CampaignManager");
  await mount(<CampaignManager accountId={accountId} sender={SENDER} />, "/onlyfans/campaigns");
}
const queue = (accountId: string) => { rememberDraft(accountId, { ...EMPTY_DRAFT, name: "Spring note", body: "Hello there", audienceKind: "all_known" }); };
const keys = () => calls.filter(call => call.method === "POST").map(call => String(bodyOf(call).requestKey));
const retry = () => button(/^Retry same request$/);
const notice = () => q("[data-of-campaign-notice]")?.textContent ?? "";

test("control: the route's own refusal (503, outcome refused) offers no retry", async () => {
  queue("of-c1");
  await manager("of-c1", () => refused(503));
  await submit(q("[data-of-campaign-manager] form"));
  assert.equal(keys().length, 1);
  assert.equal(retry(), undefined);
  assert.match(notice(), /not accepted/);
});

test("finding 2: a 503 with no body or a non-JSON body keeps the request, and Retry resends its requestKey", async () => {
  for (const [label, first, account] of [["bare 503", () => new Response(null, { status: 503 }), "of-c2"], ["non-JSON 503", () => new Response("Service Unavailable", { status: 503 }), "of-c3"]] as const) {
    queue(account);
    await manager(account, n => n === 0 ? first() : ack(account));
    await submit(q("[data-of-campaign-manager] form"));
    assert.match(notice(), /outcome is not confirmed/, label);
    await click(retry());
    assert.equal(keys().length, 2, label);
    assert.equal(keys()[1], keys()[0], `${label}: the retry carries the first requestKey`);
    assert.equal(retry(), undefined, `${label}: the ack releases it`);
  }
});

test("finding 6: unconfirmed, then refused: the create stays held and the retry still resends the first requestKey", async () => {
  queue("of-c4");
  await manager("of-c4", n => n === 0 ? lostReply() : n === 1 ? refused(409) : ack("of-c4"));
  await submit(q("[data-of-campaign-manager] form"));
  await click(retry());
  assert.ok(retry(), "a refusal after an unconfirmed attempt released the held create");
  await submit(q("[data-of-campaign-manager] form"));
  assert.equal(keys().length, 2, "Queue sent a new create while the first may have committed");
  await click(retry());
  assert.deepEqual(new Set(keys()), new Set([keys()[0]]), `every attempt resends the first requestKey; got ${keys().join(", ")}`);
  assert.equal(keys().length, 3);
  assert.equal(retry(), undefined, "a recorded ack releases it");
});

test("finding 7: navigating away and back keeps the held create and its requestKey", async () => {
  queue("of-c5");
  await manager("of-c5", lostReply);
  await submit(q("[data-of-campaign-manager] form"));
  const [first] = keys();
  await unmount();
  await manager("of-c5", () => ack("of-c5"));
  assert.match(notice(), /outcome is not confirmed/, "the remount lost the held create");
  await click(retry());
  assert.deepEqual(keys(), [first], "the retry after a remount resends the first requestKey");
  assert.equal(retry(), undefined, "the ack releases it");
});

test("a 401 on a held retry releases the held create, so a remount offers no stale Retry", async () => {
  queue("of-c6");
  await manager("of-c6", n => n === 0 ? lostReply() : new Response(null, { status: 401 }));
  await submit(q("[data-of-campaign-manager] form"));
  await click(retry());
  await unmount();
  await manager("of-c6", () => ack("of-c6"));
  assert.equal(retry(), undefined, "the held create survived the session loss");
});
