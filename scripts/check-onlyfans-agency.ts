import assert from "node:assert/strict";
import { agencyGrant, agencyOnlyFansRequest, agencyScopedFetch, AGENCY_SCOPE_HEADER, AGENCY_ACCESS_HEADER, AGENCY_ACCESS_VERSION } from "../lib/onlyfans/agency-scope";
import { authorizeRead } from "../lib/onlyfans/reads";
import { handoverForViewer } from "../lib/onlyfans/handover";
import { availableActions } from "../lib/onlyfans-preview/actions";
import { accounts, conversationDetails } from "../lib/onlyfans-preview/fixtures";

async function main() {
  const id = "11111111-1111-4111-8111-111111111111", userId = "22222222-2222-4222-8222-222222222222";
  const identity = { id, userId, cloneIds: [id], canManage: true };
  const grant = agencyGrant(identity, true)!;
  assert(grant && grant.actor === `agency-user:${id}:${userId}`);
  assert.equal(agencyGrant({ ...identity, userId: undefined }, true), null, "view-as identities carry no authenticated member");
  assert.equal(agencyGrant({ ...identity, canManage: false }, true)?.canManage, false);
  assert.equal(agencyGrant(identity, false)?.canManage, false);
  assert.equal(authorizeRead({ operatorSession: false, agency: true, viewAs: false, agencyGrant: grant }), null);
  assert.equal(authorizeRead({ operatorSession: true, agency: true, viewAs: true, agencyGrant: grant })?.status, 403);
  assert.equal(authorizeRead({ operatorSession: true, agency: true, viewAs: false })?.status, 403);
  assert.equal(authorizeRead({ operatorSession: false, agency: false, viewAs: false })?.status, 401);
  assert(agencyOnlyFansRequest("/onlyfans/inbox", "GET", false, false));
  assert(agencyOnlyFansRequest("/api/onlyfans/accounts/acc-a/conversations/acc-a:101/handover", "GET", false, false));
  assert(agencyOnlyFansRequest("/api/onlyfans/accounts/acc-a/conversations/acc-a%3A101/handover", "GET", false, false));
  for (const id of ["acc-a%2F101", "acc-a%5C101", "acc-a%253A101", "acc-a%ZZ101"])
    assert(!agencyOnlyFansRequest(`/api/onlyfans/accounts/acc-a/conversations/${id}`, "GET", false, false));
  assert(!agencyOnlyFansRequest("/onlyfans/operations", "GET", false, true));
  for (const path of ["/api/onlyfans-connections/accounts", "/api/onlyfans/accounts/acc-a/operations", "/api/earnings", "/creator/settings"])
    assert(!agencyOnlyFansRequest(path, "GET", false, true), path);
  for (const purpose of ["controls", "configuration", "content", "campaigns"]) {
    const path = `/api/onlyfans-${purpose}/accounts/acc-a`;
    assert(!agencyOnlyFansRequest(path, "POST", false, false));
    assert(agencyOnlyFansRequest(path, "POST", false, true));
    assert(!agencyOnlyFansRequest(path, "POST", true, true));
  }
  const baseUrl = "http://127.0.0.1:9999";
  const calls: { url: string; method: string }[] = [];
  const fake: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method ?? "GET" });
    assert(String(url).startsWith(baseUrl + "/onlyfans/agency/v1/"), "an old backend never receives a legacy write path");
    assert.deepEqual(JSON.parse(new Headers(init?.headers).get(AGENCY_SCOPE_HEADER)!), grant);
    return Response.json({ ok: true }, { headers: { [AGENCY_ACCESS_HEADER]: AGENCY_ACCESS_VERSION } });
  };
  const scoped = agencyScopedFetch(grant, { baseUrl, token: "synthetic-read" }, fake);
  assert((await scoped(baseUrl + "/onlyfans/control/v1/accounts/acc-a", { method: "POST" })).ok);
  assert.equal(calls.length, 2);
  const oldCalls: string[] = [];
  const old = agencyScopedFetch(grant, { baseUrl, token: "synthetic-read" }, async url => { oldCalls.push(String(url)); return Response.json({ ok: true }); });
  assert.equal((await old(baseUrl + "/onlyfans/control/v1/accounts/acc-a", { method: "POST" })).status, 503);
  assert.equal(oldCalls.length, 1, "no write follows a failed version preflight");
  const readOnly = agencyScopedFetch({ ...grant, canManage: false }, { baseUrl, token: "synthetic-read" }, async () => { throw Error("must not call backend"); });
  assert.equal((await readOnly(baseUrl + "/onlyfans/content/v1/accounts/acc-a", { method: "POST" })).status, 503);
  assert.equal((await scoped("https://another-service.invalid/onlyfans/api/v1/accounts")).status, 503);
  const raw = { schemaVersion: "of-handover.v1", accountId: "acc-a", conversationId: "acc-a:101", revision: 1, mode: "human_controlled", takeoverState: "effective",
    ownerActor: grant.actor, hasMore: false, events: [{ action: "request_takeover", mode: "human_controlled", revision: 1, actor: grant.actor, at: "2026-10-20T00:00:00Z" }] };
  const own = handoverForViewer(raw, "acc-a", "acc-a:101", grant.actor, true, true)!;
  assert(own.canActAsOwner && own.owner === "you");
  assert(!JSON.stringify(own).includes(grant.actor), "actor identifiers never reach the browser");
  assert.equal(handoverForViewer(raw, "acc-b", "acc-a:101", grant.actor, true, true), null);
  assert.equal(handoverForViewer(raw, "acc-a", "acc-a:101", "someone-else", true, true)?.canActAsOwner, false);
  assert.equal(handoverForViewer(raw, "acc-a", "acc-a:101", grant.actor, false, true)?.canActAsOwner, false);
  const detail = Object.values(conversationDetails)[0];
  const account = { ...accounts[0], health: "connected" as const, capabilities: { ...accounts[0].capabilities, sendManualMessage: "available" as const, requestTakeover: "available" as const } };
  const actions = availableActions({ account, summary: { ...detail.summary, automationMode: "human_controlled", takeoverState: "effective", delivery: "sent" },
    viewer: { kind: "operator", label: "Team member", canManage: true, scopedAccountIds: [], canActAsOwner: false } });
  assert(!actions.available.some(item => ["send_manual_message", "release_takeover"].includes(item.action)));
  console.log("PASS OnlyFans agency scope, rollout version, read-only actions and staff ownership");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
