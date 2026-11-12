// KNOWN RED (findings F1, F2; REVIEW.md inv 7 D7, docs/RISKS.md D7; W3 lane 1 + lane 3 F1/F16/F30/F36 handoffs): an upstream 503 on a
// write does not prove the write was not applied, so the lib must return outcome "unconfirmed" (keep the exact request),
// never "refused" (the UI then drops the kept retry and the next submit mints a new requestKey/commandKey: a second mass
// campaign to up to 1000 fans, a second sync op/draft, a STOP read as "not accepted"). The five write backends below
// list 503 among their refusal statuses: campaigns-backend.ts:19, controls-backend.ts:27, configuration-backend.ts:21,
// content-backend.ts:25,47, content-sync-backend.ts:8 (REFUSED). b-d7-503-unconfirmed covers Plan C / engine operator /
// catalogue only. Controls: the same writes answered 502 read unconfirmed and 409 read refused (proves the fake's status
// reaches the classifier, not a catch). Team's Claude owns the fix.
// Not wired into npm scripts or init.sh (its list is hard-coded); run with node --import tsx --test.
import assert from "node:assert/strict";
import test from "node:test";
import { createCampaignBackend } from "../../lib/onlyfans/campaigns-backend";
import { createControlBackend } from "../../lib/onlyfans/controls-backend";
import { createConfigurationBackend } from "../../lib/onlyfans/configuration-backend";
import { createContentBackend } from "../../lib/onlyfans/content-backend";
import { createContentSyncBackend } from "../../lib/onlyfans/content-sync-backend";
import { agencyScopedFetch, AGENCY_ACCESS_HEADER, AGENCY_CHAT_ACCESS_VERSION } from "../../lib/onlyfans/agency-scope";

const answering = (status: number) => (async () => new Response(JSON.stringify({ error: "unavailable" }),
  { status, headers: { "Content-Type": "application/json" } })) as typeof fetch;
const options = (status: number) => ({ baseUrl: "https://backend.invalid", token: "synthetic-token", fetchImpl: answering(status) });
const KEY = "c".repeat(64);
const ACTOR = "op-session:synthetic";

const writes: Record<string, (status: number) => Promise<{ ok: boolean; outcome?: string }>> = {
  "campaign create (mass message, up to 1000 fans)": status => createCampaignBackend(options(status)).create("of-a",
    { name: "Synthetic", body: "Hello", audience: { kind: "all_known" }, scheduledAt: null, actor: ACTOR, commandKey: KEY }),
  "campaign cancel": status => createCampaignBackend(options(status)).change("of-a", "0a1b2c3d-1111-4222-8333-444455556661",
    { action: "cancel", expectedRevision: 3, actor: ACTOR, commandKey: KEY }),
  "conversation control pause_automation (STOP)": status => createControlBackend(options(status))({ accountId: "of-a",
    conversationId: "of-a:42", action: "pause_automation", expectedRevision: 2, commandKey: KEY, actor: ACTOR }),
  "configuration save": status => createConfigurationBackend(options(status)).save("of-a",
    { patch: {} as never, expectedRevision: 1, expectedFingerprint: "b".repeat(64), commandKey: KEY, actor: ACTOR }),
  "content item save (v1)": status => createContentBackend(options(status)).save("of-a", "123",
    { patch: {} as never, expectedRevision: 1, expectedFingerprint: "b".repeat(64), commandKey: KEY, actor: ACTOR }),
  "content item save (v2)": status => createContentBackend(options(status)).saveV2("of-a", "123",
    { patch: {} as never, expectedRevision: 1, expectedFingerprint: "b".repeat(64), acknowledgeOverride: false, commandKey: KEY, actor: ACTOR }),
  "conversation manual_message (fan send)": status => createControlBackend(options(status))({ accountId: "of-a",
    conversationId: "of-a:42", action: "manual_message", body: "Hello", expectedRevision: 2, commandKey: KEY, actor: ACTOR }),
  "content sync now": status => createContentSyncBackend(options(status)).syncNow("of-a", { kind: "full", commandKey: KEY, actor: ACTOR }),
  "content sync create draft": status => createContentSyncBackend(options(status)).createDraft("of-a", { commandKey: KEY, actor: ACTOR }),
};

for (const [name, write] of Object.entries(writes)) {
  test(`control: ${name} answered 502 is unconfirmed`, async () => {
    const result = await write(502);
    assert.equal(result.ok, false);
    assert.equal(result.outcome, "unconfirmed");
  });
}
for (const [name, write] of Object.entries(writes)) {
  test(`control: ${name} answered 409 is refused`, async () => {
    const result = await write(409);
    assert.equal(result.ok, false);
    assert.equal(result.outcome, "refused");
  });
}
for (const [name, write] of Object.entries(writes)) {
  test(`D7: ${name} answered 503 is unconfirmed, not refused`, async () => {
    const result = await write(503);
    assert.equal(result.ok, false);
    assert.equal(result.outcome, "unconfirmed");
  });
}

// agency-scope.ts:34: the agency transport turns a reply that lacks the scope-version header into a synthesized 503
// AFTER the upstream write ran. For a write that is not proof of "not applied" either.
test("D7: an agency-scoped campaign create whose landed reply lacks the scope header is unconfirmed", async () => {
  let posts = 0;
  const upstream = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    if ((init?.method ?? "GET") === "GET") return new Response("{}", { status: 200, headers: { [AGENCY_ACCESS_HEADER]: AGENCY_CHAT_ACCESS_VERSION } });
    posts += 1;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  const grant = { creatorIds: ["0a1b2c3d-1111-4222-8333-444455556661"], actor: "agency-user:synthetic", canManage: true, canChat: false };
  const scoped = agencyScopedFetch(grant, { baseUrl: "https://backend.invalid", token: "synthetic-token" }, upstream);
  const result = await createCampaignBackend({ baseUrl: "https://backend.invalid", token: "synthetic-token", fetchImpl: scoped }).create("of-a",
    { name: "Synthetic", body: "Hello", audience: { kind: "all_known" }, scheduledAt: null, actor: ACTOR, commandKey: KEY });
  assert.equal(posts, 1, "the write reached upstream");
  assert.equal(result.ok, false);
  assert.equal(result.outcome, "unconfirmed");
});
