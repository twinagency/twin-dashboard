import assert from "node:assert/strict";
import { CAMPAIGN_SCHEMA, RECIPIENT_STATUSES, canonicalCampaign, parseCampaign, parseCampaignAck,
  parseCampaignDetail, parseCampaignList, validCampaignChange, validCampaignCreate } from "../lib/onlyfans/campaigns";
import { createCampaignBackend } from "../lib/onlyfans/campaigns-backend";
import { parseCommandJson } from "../lib/onlyfans/command-json";

async function main() {
  const id = "00000000-0000-4000-8000-000000000001", accountId = "acc-a", at = "2026-10-18T12:00:00Z";
  const create = { requestKey: id, name: "Saved conversation campaign", body: "  Exact text\n", audience: { kind: "explicit" as const, conversationIds: ["acc-a:101"] }, scheduledAt: null };
  assert(validCampaignCreate(create)); assert(validCampaignCreate({ ...create, audience: { kind: "all_known" } }));
  for (const changed of [{ actor: "forged" }, { requestKey: "" }, { body: "🙂".repeat(5001) }, { name: " " },
    { scheduledAt: "2026-10-18T12:00:00" }, { audience: { kind: "explicit", conversationIds: ["acc-a:101", "acc-a:101"] } },
    { audience: { kind: "all_known", query: "arbitrary" } }]) assert(!validCampaignCreate({ ...create, ...changed }));
  assert(validCampaignChange({ action: "pause", expectedRevision: 0 })); assert(!validCampaignChange({ action: "start", expectedRevision: 0 }));
  const counts = Object.fromEntries(RECIPIENT_STATUSES.map(status => [status, status === "pending" ? 1 : 0]));
  const campaign = { campaignId: id, accountId, name: create.name, body: create.body,
    audience: { kind: "explicit", count: 1, snapshotHash: "a".repeat(64) }, scheduledAt: at, createdAt: at, updatedAt: at,
    status: "scheduled", revision: 0, counts, recipientCount: 1, deliveryMode: "individual_messages", offer: null,
    reporting: { replies: null, replyWindowHours: 24, purchases: null, refundedPurchases: null,
      revenueCents: null, currency: null, ledgerAsOf: null, revenueStatus: "ledger_unavailable" } };
  assert(parseCampaign(campaign, accountId));
  const offer = { catalogItemId: 1, label: "Saved collection", priceCents: 1000, currency: "USD", mediaIds: ["11", "12"], previewIds: ["11"], snapshotHash: "c".repeat(64) };
  assert(parseCampaign({ ...campaign, offer }, accountId)); assert(validCampaignCreate({ ...create, catalogItemId: 1 }));
  assert.equal(parseCampaign({ ...campaign, offer: { ...offer, previewIds: ["99"] } }, accountId), null);
  assert.equal(parseCampaign({ ...campaign, offer: { ...offer, priceCents: 1000.5 } }, accountId), null);
  assert.equal(parseCampaign({ ...campaign, counts: { ...counts, accepted: 1 } }, accountId), null);
  assert.equal(parseCampaign({ ...campaign, reporting: { replies: 0, revenueCents: 0, currency: "USD" } }, accountId), null, "Unavailable attribution cannot be invented as zero");
  const available = { replies: 1, replyWindowHours: 24, purchases: 1, refundedPurchases: 0, revenueCents: 1000,
    currency: "USD", ledgerAsOf: "2026-10-18T12:00:00Z", revenueStatus: "available" };
  assert(parseCampaign({ ...campaign, reporting: available }, accountId));
  for (const changed of [{ ledgerAsOf: null }, { replies: 2 }, { revenueStatus: "ledger_held" },
    { revenueCents: -1 }, { refundedPurchases: 1 }, { currency: "AUD" }])
    assert.equal(parseCampaign({ ...campaign, reporting: { ...available, ...changed } }, accountId), null);
  assert.equal(parseCampaign(campaign, "other"), null);
  const list = { schemaVersion: CAMPAIGN_SCHEMA, ok: true, accountId, campaigns: [campaign], truncated: false };
  assert(parseCampaignList(list, accountId)); assert.equal(parseCampaignList({ ...list, campaigns: [campaign, campaign] }, accountId), null);
  const recipient = { conversationId: "acc-a:101", status: "pending", reason: null, intentId: null, providerMessageId: null, updatedAt: at };
  assert(parseCampaignDetail({ schemaVersion: CAMPAIGN_SCHEMA, ok: true, accountId, campaign, recipients: [recipient] }, accountId, id));
  const ack = { schemaVersion: CAMPAIGN_SCHEMA, ok: true, commandKey: "b".repeat(64), accountId, campaignId: id, recordedRevision: 0 };
  assert(parseCampaignAck(ack, { accountId, commandKey: ack.commandKey }));
  assert.equal(parseCampaignAck({ ...ack, accountId: "foreign" }, { accountId }), null);
  assert.equal(parseCampaignAck({ ...ack, action: "pause", recordedRevision: 0 }, { accountId, campaignId: id, action: "pause", expectedRevision: 0 }), null);
  assert.equal(canonicalCampaign({ b: 2, a: { d: 4, c: 3 } }), canonicalCampaign({ a: { c: 3, d: 4 }, b: 2 }));
  for (const raw of ['{"name":"first","name":"second"}', '{"nested":{"a":1,"\\u0061":2}}', '{"x":1e999}', '[1,]', '{"a":true} trailing']) assert.throws(() => parseCommandJson(raw));
  assert.deepEqual(parseCommandJson('{"body":"quote \\\" : ","audience":{"kind":"all_known"}}'), { body: 'quote " : ', audience: { kind: "all_known" } });
  const posts: string[] = [];
  const wire: typeof fetch = async (url, init) => {
    assert.match(String(url), /\/onlyfans\/campaign\/v1\/accounts\/acc-a\/campaigns$/);
    assert.equal(init?.credentials, "omit"); assert.equal(init?.redirect, "error"); assert.equal(init?.cache, "no-store");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer synthetic-campaign"); assert.equal(new Headers(init?.headers).get("cookie"), null);
    if (init?.method === "GET") return Response.json(list);
    posts.push(String(init?.body)); if (posts.length === 1) throw new Error("Lost committed ack"); return Response.json(ack);
  };
  const backend = createCampaignBackend({ baseUrl: "http://127.0.0.1:1", token: "synthetic-campaign", fetchImpl: wire });
  assert((await backend.list(accountId)).ok);
  const { requestKey: _key, ...payload } = create; const command = { ...payload, actor: "op-session:test", commandKey: ack.commandKey };
  const lost = await backend.create(accountId, command); assert(!lost.ok && lost.outcome === "unconfirmed");
  assert((await backend.create(accountId, command)).ok); assert.equal(posts[0], posts[1]);
  assert.equal(JSON.parse(posts[0]).body, create.body); assert.equal("requestKey" in JSON.parse(posts[0]), false);
  const actionBackend = createCampaignBackend({ baseUrl: "http://127.0.0.1:1", token: "synthetic", fetchImpl: async (url, init) => {
    assert.equal(String(url), `http://127.0.0.1:1/onlyfans/campaign/v1/accounts/acc-a/campaigns/${id}/actions`);
    assert.deepEqual(JSON.parse(String(init?.body)), { action: "pause", expectedRevision: 1, actor: command.actor, commandKey: ack.commandKey });
    return Response.json({ ...ack, action: "pause", recordedRevision: 2 });
  } });
  assert((await actionBackend.change(accountId, id, { action: "pause", expectedRevision: 1, actor: command.actor, commandKey: ack.commandKey })).ok);
  for (const status of [400, 401, 403, 404, 409, 413, 503]) {
    const result = await createCampaignBackend({ baseUrl: "http://127.0.0.1:1", token: "synthetic", fetchImpl: async () => new Response("refused", { status }) }).create(accountId, command);
    assert(!result.ok && result.outcome === "refused");
  }
  console.log("PASS campaigns: scoped strict contracts, bounded saved audiences, truthful counts/attribution, UTF-8 text, explicit timezone, duplicate-key refusal, no cookie forwarding and identical lost-ack retry");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
