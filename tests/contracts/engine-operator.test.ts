import assert from "node:assert/strict";
import test from "node:test";
import { createEngineOperatorBackend, ENGINE_OPERATOR_HEADER, ENGINE_OPERATOR_SCHEMA } from "../../lib/onlyfans/engine-operator";
import { agencyOnlyFansRequest, chatBackendPath } from "../../lib/onlyfans/agency-scope";

const command = { accountId: "acc-a", conversationId: "acc-a:101", requestId: "12345678-1234-1234-1234-123456789abc",
  action: "request_handover" as const, expectedRevision: 3, commandKey: "a".repeat(64), actor: "op-session:" + "b".repeat(64), environment: "live" as const };
const ack = { schemaVersion: ENGINE_OPERATOR_SCHEMA, ok: true, accountId: command.accountId, conversationId: command.conversationId,
  requestId: command.requestId, action: command.action, commandKey: command.commandKey, status: "handover_pending",
  owner: "engine", nextStep: "await_handover_acceptance", recordedRevision: 4, replayed: false };

test("operator transport sends a scoped versioned command and verifies its acknowledgement", async () => {
  const fetchImpl: typeof fetch = async (input, init) => {
    assert.match(String(input), /\/accounts\/acc-a\/conversations\/acc-a%3A101\/requests\//);
    assert.equal(new Headers(init?.headers).get(ENGINE_OPERATOR_HEADER), ENGINE_OPERATOR_SCHEMA);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.target, command.actor); assert.equal(body.commandKey, command.commandKey);
    assert.equal(init?.redirect, "error"); assert.equal(init?.credentials, "omit");
    return Response.json(ack);
  };
  assert.deepEqual(await createEngineOperatorBackend({ baseUrl: "http://fixture.invalid", token: "fixture", fetchImpl })(command), { ok: true });
});

test("scope mismatches, malformed acknowledgements, and lost replies cannot claim success", async () => {
  for (const response of [Response.json({ ...ack, conversationId: "acc-a:999" }), Response.json({ ...ack, recordedRevision: 5 }), new Response(null, { status: 500 })]) {
    const backend = createEngineOperatorBackend({ baseUrl: "http://fixture.invalid", token: "fixture", fetchImpl: async () => response });
    const result = await backend(command); assert.equal(result.ok, false); if (!result.ok) assert.equal(result.outcome, "unconfirmed");
  }
  const unavailable = createEngineOperatorBackend({ baseUrl: "http://fixture.invalid", token: "fixture", fetchImpl: async () => { throw new Error("lost"); } });
  const lost = await unavailable(command); assert.equal(lost.ok, false); if (!lost.ok) assert.equal(lost.outcome, "unconfirmed");
  const conflict = createEngineOperatorBackend({ baseUrl: "http://fixture.invalid", token: "fixture", fetchImpl: async () => new Response(null, { status: 409 }) });
  const refused = await conflict(command); assert.equal(refused.ok, false); if (!refused.ok) assert.equal(refused.outcome, "refused");
});

test("chat access permits only the explicitly scoped request route", () => {
  const suffix = `/accounts/acc-a/conversations/acc-a:101/requests/${command.requestId}`;
  assert.equal(chatBackendPath(`/onlyfans/control/v1${suffix}`, "POST"), true);
  assert.equal(chatBackendPath(`/onlyfans/control/v1${suffix.replace(":", "%3A")}`, "POST"), true);
  assert.equal(chatBackendPath(`/onlyfans/control/v1${suffix.replace("/requests/", "%2Frequests/")}`, "POST"), false);
  assert.equal(agencyOnlyFansRequest(`/api/onlyfans-controls${suffix}`, "POST", false, false, true), true);
  assert.equal(chatBackendPath(`/onlyfans/control/v1${suffix}/other`, "POST"), false);
  assert.equal(agencyOnlyFansRequest(`/api/onlyfans-controls${suffix}`, "POST", false, false, false), false);
});
