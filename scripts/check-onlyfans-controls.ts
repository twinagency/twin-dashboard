/** Synthetic transports for command acknowledgement and local action gates. */
import assert from "node:assert/strict";
import { createControlBackend } from "../lib/onlyfans/controls-backend";
import { CONTROL_SCHEMA, controlRefusalNote, parseControlAck } from "../lib/onlyfans/controls";
import { createFetchOnlyFansTransport } from "../lib/onlyfans-preview/server-data-source";
import { availableActions, createCommandRequest } from "../lib/onlyfans-preview/actions";
import { operatorViewer } from "../lib/onlyfans-preview/fixture-data-source";
import { accounts, conversationDetails } from "../lib/onlyfans-preview/fixtures";
import { NO_PAYLOAD } from "../lib/onlyfans-preview/types";

async function main() {
  const command = { accountId: "acc-a", conversationId: "acc-a:101", action: "pause_automation" as const,
    expectedRevision: 7, commandKey: "a".repeat(64), actor: "op-session:" + "b".repeat(64) };
  const ack = { schemaVersion: CONTROL_SCHEMA, ok: true, applied: true, commandKey: command.commandKey,
    accountId: command.accountId, conversationId: command.conversationId, action: command.action, recordedRevision: 8 };
  assert(parseControlAck(ack, command));
  for (const changed of [{ schemaVersion: "future" }, { recordedRevision: 9 }, { accountId: "other" },
    { conversationId: "acc-b:101" }, { action: "resume_automation" }, { commandKey: "f".repeat(64) }, { applied: false }]) {
    assert.equal(parseControlAck({ ...ack, ...changed }, command), null);
  }
  let calls = 0;
  const wire: typeof fetch = async (url, init) => {
    calls += 1;
    assert.equal(String(url), "http://127.0.0.1:1/onlyfans/control/v1/accounts/acc-a/conversations/acc-a%3A101");
    assert.equal(init?.method, "POST"); assert.equal(init?.credentials, "omit");
    assert.equal(init?.redirect, "error"); assert.equal(init?.cache, "no-store");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), "Bearer synthetic-control-only");
    assert.equal(headers.get("cookie"), null);
    assert.equal(headers.get("X-OnlyFans-Control-Version"), CONTROL_SCHEMA);
    assert.deepEqual(JSON.parse(String(init?.body)), { action: command.action, expectedRevision: command.expectedRevision,
      commandKey: command.commandKey, actor: command.actor });
    return Response.json(ack);
  };
  assert.equal((await createControlBackend({ baseUrl: "http://127.0.0.1:1", token: "synthetic-control-only", fetchImpl: wire })(command)).ok, true);
  assert.equal(calls, 1);
  for (const status of [400, 401, 403, 404, 409, 413, 503]) {
    const result = await createControlBackend({ baseUrl: "http://127.0.0.1:1", token: "synthetic", fetchImpl: async () => new Response("refused", { status }) })(command);
    assert(!result.ok && result.outcome === "refused");
  }
  for (const fake of [async () => { throw new Error("synthetic lost reply"); }, async () => Response.json({ ...ack, recordedRevision: 99 }),
    async () => new Response("server failed", { status: 500 }), async () => new Response("not json")]) {
    const result = await createControlBackend({ baseUrl: "http://127.0.0.1:1", token: "synthetic", fetchImpl: fake })(command);
    assert(!result.ok && result.outcome === "unconfirmed");
  }
  const configurationRefusal = { schemaVersion: CONTROL_SCHEMA, ok: false, outcome: "refused", error: "Conversation controls are not configured." };
  assert.equal(controlRefusalNote(503, configurationRefusal), configurationRefusal.error);
  for (const changed of [{ schemaVersion: "other" }, { ok: true }, { outcome: "unconfirmed" }, { error: "private-token-or-provider-error" }]) {
    const note = controlRefusalNote(503, { ...configurationRefusal, ...changed });
    assert.match(note, /server connection or configuration needs attention/);
    assert(!note.includes("private-token"));
  }
  assert.match(controlRefusalNote(401, null), /session has expired/);
  assert.match(controlRefusalNote(403, null), /team access/);
  assert.match(controlRefusalNote(404, null), /no longer available/);
  assert.match(controlRefusalNote(409, null), /conversation changed or has an active hold/);
  assert.match(controlRefusalNote(413, null), /too large/);
  const request = createCommandRequest({ command: command.action, accountId: command.accountId,
    conversationId: command.conversationId, expectedRevision: command.expectedRevision, payload: NO_PAYLOAD });
  const posted: string[] = [];
  const transport = createFetchOnlyFansTransport(async (url, init) => {
    assert.equal(String(url), "/api/onlyfans-controls/accounts/acc-a/conversations/acc-a%3A101");
    assert.equal(init?.credentials, "same-origin");
    assert.equal(new Headers(init?.headers).get("authorization"), null);
    posted.push(String(init?.body));
    if (posted.length === 1) throw new Error("synthetic timeout");
    return Response.json(ack);
  });
  const lost = await transport.submitControl!(request);
  assert.equal(lost.outcome, "unconfirmed"); assert.equal(lost.applied, false);
  const retry = await transport.submitControl!(lost.request);
  assert.equal(retry.outcome, "recorded"); assert.equal(retry.recordedRevision, 8);
  assert.equal(posted[0], posted[1]);
  assert.deepEqual(JSON.parse(posted[0]), { action: command.action, expectedRevision: 7 });
  const unsupported = await transport.submitControl!({ ...request, command: "resolve_delivery_evidence", payload: { kind: "delivery_resolution", attemptId: "example", decision: "delivered" } });
  assert.equal(unsupported.outcome, "refused"); assert.equal(posted.length, 2);
  const manualRequest = { ...request, command: "send_manual_message" as const,
    idempotencyKey: "00000000-0000-4000-8000-000000000001", payload: { kind: "manual_message" as const, body: "  A deliberate reply\n" } };
  const manualAck = { ...ack, action: "manual_message", recordedRevision: 7, intentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", outcome: "queued" };
  assert(parseControlAck(manualAck, { ...command, action: "manual_message" }));
  for (const changed of [{ outcome: "sent" }, { recordedRevision: 8 }, { intentId: "" }, { providerMessageId: "fake" }])
    assert.equal(parseControlAck({ ...manualAck, ...changed }, { ...command, action: "manual_message" }), null);
  const manualPosts: string[] = [];
  const manualTransport = createFetchOnlyFansTransport(async (_url, init) => {
    manualPosts.push(String(init?.body));
    if (manualPosts.length === 1) throw new Error("synthetic lost queued acknowledgement");
    return Response.json(manualAck);
  });
  const manualLost = await manualTransport.submitControl!(manualRequest);
  assert.equal(manualLost.outcome, "unconfirmed");
  const manualRetry = await manualTransport.submitControl!(manualLost.request);
  assert.equal(manualRetry.outcome, "recorded"); assert.equal(manualRetry.intentId, manualAck.intentId);
  assert.match(manualRetry.note, /queued/); assert.equal(manualPosts[0], manualPosts[1]);
  assert.deepEqual(JSON.parse(manualPosts[0]), { action: "manual_message", expectedRevision: 7,
    body: manualRequest.payload.body, requestKey: manualRequest.idempotencyKey });
  assert.equal((await manualTransport.submitControl!({ ...manualRequest, payload: { kind: "manual_message", body: "🙂".repeat(1001) } })).outcome, "refused");
  assert.equal(manualPosts.length, 2, "Oversized UTF-8 messages never reach transport");
  const detail = Object.values(conversationDetails)[0];
  const account = { ...accounts[0], health: "disconnected" as const, capabilities: { ...accounts[0].capabilities,
    pauseAutomation: "available" as const, requestTakeover: "available" as const } };
  const allowed = (mode: typeof detail.summary.automationMode, takeover: typeof detail.summary.takeoverState,
    delivery: typeof detail.summary.delivery) => availableActions({ account, viewer: operatorViewer(),
      summary: { ...detail.summary, automationMode: mode, takeoverState: takeover, delivery } }).available.map(x => x.action);
  assert(allowed("automated", "none", "unknown").includes("pause_automation"));
  assert(allowed("automated", "none", "unknown").includes("mark_no_contact"));
  assert(allowed("automated", "none", "unknown").includes("request_takeover"));
  assert(!allowed("human_controlled", "effective", "unknown").includes("release_takeover"));
  assert(!allowed("paused", "requested", "sent").includes("resume_automation"));
  assert.equal(allowed("no_contact", "none", "sent").length, 0);
  const manualAccount = { ...account, health: "connected" as const, capabilities: { ...account.capabilities, sendManualMessage: "available" as const } };
  const manualAllowed = (mode: typeof detail.summary.automationMode, takeover: typeof detail.summary.takeoverState) =>
    availableActions({ account: manualAccount, viewer: operatorViewer(), summary: { ...detail.summary, automationMode: mode, takeoverState: takeover, delivery: "sent" } }).available.some(entry => entry.action === "send_manual_message");
  assert.equal(manualAllowed("automated", "none"), false); assert.equal(manualAllowed("paused", "none"), false);
  assert.equal(manualAllowed("human_controlled", "requested"), false); assert.equal(manualAllowed("human_controlled", "effective"), true);
  console.log("PASS controls: exact acknowledgement, separate credential, no redirect/cookie forwarding, refusals versus uncertainty, identical retry, disconnected stop controls, unresolved hand-back hold, no-contact exclusion");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
