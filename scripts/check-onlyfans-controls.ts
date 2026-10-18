/** Synthetic transports for command acknowledgement and local action gates. */
import assert from "node:assert/strict";
import { createControlBackend } from "../lib/onlyfans/controls-backend";
import { CONTROL_SCHEMA, parseControlAck } from "../lib/onlyfans/controls";
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
  const unsupported = await transport.submitControl!({ ...request, command: "send_manual_message", payload: { kind: "manual_message", body: "hello" } });
  assert.equal(unsupported.outcome, "refused"); assert.equal(posted.length, 2);
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
  console.log("PASS controls: exact acknowledgement, separate credential, no redirect/cookie forwarding, refusals versus uncertainty, identical retry, disconnected stop controls, unresolved hand-back hold, no-contact exclusion");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
