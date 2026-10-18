import assert from "node:assert/strict";
import { createConnectionBackend, configuredConnectionBackend } from "../lib/onlyfans-connections/backend";
import { CONNECTION_SCHEMA, connectionCapture, connectionOwner, validConnectionRequest, validConnectionRegistration,
  parseConnection, parseConnectionAck, parseRegistrationAck, canonicalConnection } from "../lib/onlyfans-connections/contract";
import { parseCommandJson } from "../lib/onlyfans/command-json";

async function main() {
  const capture = { headers: { user_id: "123", user_agent: "Synthetic test agent", x_bc: "synthetic-bc", x_of_rev: "synthetic-rev" },
    signing: { rules: { static_param: "synthetic-static", start: "synthetic-start", end: "synthetic-end", checksum_indexes: Array(32).fill(1), checksum_constant: 1 } },
    cookies: [{ name: "sess", value: "synthetic-session", domain: ".onlyfans.com", path: "/" }] };
  const payload = { ownerId: 123, capture, xHash: "synthetic-hash", proxyUrl: "http://synthetic:fixture@proxy.invalid:80", expiresAt: "2026-10-19T00:00:00Z", model: null };
  const command = { action: "save" as const, payload, expectedRevision: 0 };
  assert(connectionCapture(capture, 123)); assert.equal(connectionCapture(capture, 124), false);
  assert(validConnectionRequest(command));
  for (const changed of [{ ownerId: 124 }, { xHash: "" }, { expiresAt: "2026-10-19" }, { proxyUrl: "http://proxy.invalid" },
    { proxyUrl: "https://proxy.invalid:443/private" }, { proxyUrl: "https://proxy.invalid:443/?secret=x" }, { proxyUrl: "ftp://proxy.invalid:21" },
    { model: { modelId: "saved-model", apiKey: "" } }, { model: { modelId: "saved-model", apiKey: "synthetic", extra: "bad" } }])
    assert.equal(validConnectionRequest({ ...command, payload: { ...payload, ...changed } }), false);
  assert(validConnectionRequest({ ...command, payload: { ...payload, model: { modelId: "saved-model", apiKey: "synthetic-key" } } }));
  for (const cookies of [[], [capture.cookies[0], capture.cookies[0]], [{ ...capture.cookies[0], domain: "foreign.invalid" }], [{ ...capture.cookies[0], value: "bad;cookie" }]])
    assert.equal(connectionCapture({ ...capture, cookies }, 123), false);
  assert.equal(connectionCapture({ ...capture, signing: { rules: { ...capture.signing.rules, checksum_indexes: [1] } } }, 123), false);
  assert.equal(connectionOwner("123"), 123); assert.equal(connectionOwner("00123"), null); assert.equal(connectionOwner("9007199254740992"), null);
  for (const action of ["verify", "pause"] as const) {
    assert(validConnectionRequest({ action, payload: {}, expectedRevision: 1 }));
    assert.equal(validConnectionRequest({ action, payload: { enabled: true }, expectedRevision: 1 }), false);
  }
  assert(validConnectionRequest({ action: "activate", payload: { limitUnits: 10, throttleSeconds: 60, mediaEnabled: false }, expectedRevision: 1 }));
  for (const changed of [{ limitUnits: 0 }, { limitUnits: 10001 }, { throttleSeconds: 0 }, { throttleSeconds: 86401 }, { mediaEnabled: 1 }])
    assert.equal(validConnectionRequest({ action: "activate", payload: { limitUnits: 10, throttleSeconds: 60, mediaEnabled: false, ...changed }, expectedRevision: 1 }), false);
  assert.equal(validConnectionRequest({ ...command, actor: "browser-supplied" }), false);
  const registration = { creatorId: "existing-creator", ownerId: 123, handle: "synthetic-handle" };
  assert(validConnectionRegistration(registration)); assert.equal(validConnectionRegistration({ ...registration, creatorName: "invented" }), false);
  const connection = { accountId: "of-123", revision: 1, status: "pending", ownerId: "123", expiresAt: payload.expiresAt, verifiedAt: null,
    lastError: null, outgoingEnabled: false, policyRevision: 0, usedUnits: 0, limitUnits: 0, mediaEnabled: false, automateNewConversations: false };
  const read = { schemaVersion: CONNECTION_SCHEMA, ok: true, connection };
  assert(parseConnection(read, "of-123")); assert.equal(parseConnection(read, "of-124"), null);
  for (const changed of [{ status: "connected" }, { outgoingEnabled: true }, { ownerId: "bad" }, { lastError: "https://secret-url.invalid" },
    { apiKey: "secret" }, { capture }, { usedUnits: -1 }]) assert.equal(parseConnection({ ...read, connection: { ...connection, ...changed } }, "of-123"), null);
  const identity = { actor: "op-session:" + "a".repeat(64), commandKey: "b".repeat(64) };
  const ack = { schemaVersion: CONNECTION_SCHEMA, ok: true, applied: true, accountId: "of-123", commandKey: identity.commandKey, recordedRevision: 1, action: "save" };
  assert(parseConnectionAck(ack, { ...command, ...identity, accountId: "of-123" }));
  for (const changed of [{ action: "activate" }, { accountId: "of-124" }, { commandKey: "c".repeat(64) }, { recordedRevision: 2 }, { capture }])
    assert.equal(parseConnectionAck({ ...ack, ...changed }, { ...command, ...identity, accountId: "of-123" }), null);
  const registered = { schemaVersion: CONNECTION_SCHEMA, ok: true, applied: true, accountId: "of-123", commandKey: identity.commandKey, status: "unconfigured" };
  assert(parseRegistrationAck(registered, { ...registration, ...identity }));
  assert.equal(parseRegistrationAck({ ...registered, accountId: "of-124" }, registration), null);
  assert.equal(canonicalConnection({ action: "pause", payload: {} }), canonicalConnection({ payload: {}, action: "pause" }));
  assert.throws(() => parseCommandJson('{"action":"save","action":"activate"}'));
  const posted: string[] = [];
  const backend = createConnectionBackend({ baseUrl: "http://127.0.0.1:1", token: "synthetic-connection-only", fetchImpl: async (url, init) => {
    assert.equal(init?.credentials, "omit"); assert.equal(init?.redirect, "error"); assert.equal(init?.cache, "no-store");
    const headers = new Headers(init?.headers); assert.equal(headers.get("cookie"), null);
    assert.equal(headers.get("authorization"), "Bearer synthetic-connection-only"); assert.equal(headers.get("X-OnlyFans-Connection-Version"), CONNECTION_SCHEMA);
    if (init?.method === "GET") return Response.json(read);
    assert.equal(String(url), "http://127.0.0.1:1/onlyfans/connection/v1/accounts/of-123");
    posted.push(String(init?.body)); if (posted.length === 1) throw new Error("Synthetic lost acknowledgement"); return Response.json(ack);
  } });
  assert((await backend.get("of-123")).ok);
  const lost = await backend.command("of-123", { ...command, ...identity }); assert(!lost.ok && lost.outcome === "unconfirmed");
  assert.equal(posted.length, 1, "adapter retried a credential command automatically");
  assert((await backend.command("of-123", { ...command, ...identity })).ok); assert.equal(posted[0], posted[1]);
  const provisioned = await createConnectionBackend({ baseUrl: "http://127.0.0.1:1", token: "synthetic", fetchImpl: async (url, init) => {
    assert.equal(String(url), "http://127.0.0.1:1/onlyfans/connection/v1/accounts");
    assert.equal(JSON.parse(String(init?.body)).creatorName, "Verified existing name"); return Response.json(registered);
  } }).provision({ ...registration, ...identity, creatorName: "Verified existing name" });
  assert(provisioned.ok);
  const old = { base: process.env.ONLYFANS_API_BASE_URL, connection: process.env.ONLYFANS_CONNECTION_TOKEN, read: process.env.ONLYFANS_API_TOKEN };
  try {
    process.env.ONLYFANS_API_BASE_URL = "http://127.0.0.1:1"; process.env.ONLYFANS_CONNECTION_TOKEN = "same"; process.env.ONLYFANS_API_TOKEN = "same";
    assert.equal(configuredConnectionBackend(), null); process.env.ONLYFANS_CONNECTION_TOKEN = "separate"; assert(configuredConnectionBackend());
  } finally { for (const [key, value] of Object.entries({ ONLYFANS_API_BASE_URL: old.base, ONLYFANS_CONNECTION_TOKEN: old.connection, ONLYFANS_API_TOKEN: old.read }))
    if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  console.log("PASS connections: selected owner/capture, secret-free exact reads, explicit activation limits, existing creator request, scoped acknowledgements, no automatic retries, separate credential");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
