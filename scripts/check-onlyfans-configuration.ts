import assert from "node:assert/strict";
import { createConfigurationBackend } from "../lib/onlyfans/configuration-backend";
import { CONFIGURATION_SCHEMA, FACT_KEYS, canonicalConfiguration, parseConfiguration,
  parseConfigurationAck, validConfigurationRequest } from "../lib/onlyfans/configuration";

async function main() {
  const configuration = { configurationRevision: 7, fingerprint: "a".repeat(64), persona: "Approved synthetic persona.", personaTruncated: false,
    creatorFacts: Object.fromEntries(FACT_KEYS.map(key => [key, null])), factFields: FACT_KEYS.map(key => ({ key, label: key })),
    factsValid: true, readOnlyFacts: [], modelsValid: true, salesConfigurationValid: true, onRequestSalesEnabled: false,
    dailyCostCapCents: 100, reasoningEffort: null, reasoningOptions: { "synthetic/model": ["low", "high"] },
    sharedFacts: { state: "unconfigured", checkedAt: null, sourceUpdatedAt: null, overrideKeys: [] },
    defaultModel: "synthetic/model", replyModelOverride: null,
    replyOverridePresent: true, resolvedReplyModel: null, modelOptions: ["synthetic/model"] };
  const read = { schemaVersion: CONFIGURATION_SCHEMA, ok: true, accountId: "acc-a", configuration };
  assert(parseConfiguration(read, "acc-a"));
  for (const changed of [{ fingerprint: "bad" }, { persona: null }, { personaTruncated: true }, { defaultModel: false },
    { creatorFacts: { unknown: "private" } }, { factFields: [] }, { readOnlyFacts: ["unknown"] }, { modelOptions: ["a", "a"] }, { sharedFacts: { ...configuration.sharedFacts, state: "current" } },
    { sharedFacts: { ...configuration.sharedFacts, overrideKeys: ["unknown"] } }, { unexpected: true },
    { salesConfigurationValid: "true" }, { onRequestSalesEnabled: 1 },
    { salesConfigurationValid: false, onRequestSalesEnabled: true }, {dailyCostCapCents:1.5}, {dailyCostCapCents:-1}, {reasoningEffort:17}, {reasoningOptions:{bad:["low"]}}]) {
    assert.equal(parseConfiguration({ ...read, configuration: { ...configuration, ...changed } }, "acc-a"), null);
  }
  assert.equal(parseConfiguration(read, "acc-b"), null);
  const command = { patch: { creatorFacts: { home_city: "New synthetic city" }, replyModelOverride: null },
    expectedRevision: 7, expectedFingerprint: configuration.fingerprint, actor: "op-session:" + "b".repeat(64), commandKey: "c".repeat(64) };
  const { actor: _actor, commandKey: _key, ...browserCommand } = command;
  assert(validConfigurationRequest(browserCommand));
  assert.equal(validConfigurationRequest(command), false);
  for (const patch of [{ dailyCostCap: 0 }, {}, { creatorFacts: { unknown: "x" } }, { creatorFacts: { age: 28 } }, { persona: "" },
    { inheritCreatorFacts: [] }, { inheritCreatorFacts: ["job", "job"] }, { inheritCreatorFacts: ["unknown"] },
    { creatorFacts: { job: null }, inheritCreatorFacts: ["job"] }, { onRequestSalesEnabled: "true" },
    { onRequestSalesEnabled: 1 }, { onRequestSalesEnabled: null }, { pack_send_enabled: true }])
    assert.equal(validConfigurationRequest({ ...browserCommand, patch }), false);
  assert(validConfigurationRequest({ ...browserCommand, patch: { inheritCreatorFacts: ["job"] } }));
  for (const onRequestSalesEnabled of [true, false]) {
    assert(validConfigurationRequest({ ...browserCommand, patch: { onRequestSalesEnabled } }));
    assert(parseConfiguration({ ...read, configuration: { ...configuration, onRequestSalesEnabled } }, "acc-a"));
  }
  assert(parseConfiguration({ ...read, configuration: { ...configuration, salesConfigurationValid: false } }, "acc-a"));
  assert(parseConfiguration({ ...read, configuration: { ...configuration,
    creatorFacts: { ...configuration.creatorFacts, limits: "x".repeat(14000) }, readOnlyFacts: ["limits"] } }, "acc-a"));
  const ack = { schemaVersion: CONFIGURATION_SCHEMA, ok: true, applied: true, accountId: "acc-a", commandKey: command.commandKey,
    recordedRevision: 8, recordedFingerprint: "d".repeat(64) };
  assert(parseConfigurationAck(ack, { ...command, accountId: "acc-a" }));
  for (const changed of [{ recordedRevision: 9 }, { recordedFingerprint: "bad" }, { accountId: "acc-b" }, { commandKey: "e".repeat(64) }, { extra: true }])
    assert.equal(parseConfigurationAck({ ...ack, ...changed }, { ...command, accountId: "acc-a" }), null);
  assert.equal(canonicalConfiguration({ patch: { persona: "x", creatorFacts: { job: "x", age: "28" } } }),
    canonicalConfiguration({ patch: { creatorFacts: { age: "28", job: "x" }, persona: "x" } }));
  const posted: string[] = [];
  const wire: typeof fetch = async (url, init) => {
    assert.equal(String(url), "http://127.0.0.1:1/onlyfans/configuration/v1/accounts/acc-a");
    assert.equal(init?.credentials, "omit"); assert.equal(init?.redirect, "error"); assert.equal(init?.cache, "no-store");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), "Bearer synthetic-configuration-only"); assert.equal(headers.get("cookie"), null);
    assert.equal(headers.get("X-OnlyFans-Configuration-Version"), CONFIGURATION_SCHEMA);
    if (init?.method === "GET") return Response.json(read);
    posted.push(String(init?.body));
    if (posted.length === 1) throw new Error("Synthetic lost reply");
    return Response.json(ack);
  };
  const backend = createConfigurationBackend({ baseUrl: "http://127.0.0.1:1", token: "synthetic-configuration-only", fetchImpl: wire });
  assert((await backend.get("acc-a")).ok);
  const lost = await backend.save("acc-a", command); assert(!lost.ok && lost.outcome === "unconfirmed");
  assert((await backend.save("acc-a", command)).ok); assert.equal(posted[0], posted[1]);
  for (const status of [400, 401, 403, 404, 409, 413, 503, 500]) {
    const reply = await createConfigurationBackend({ baseUrl: "http://127.0.0.1:1", token: "synthetic", fetchImpl: async () => new Response("refused", { status }) }).save("acc-a", command);
    assert(!reply.ok && reply.outcome === (status === 500 ? "unconfirmed" : "refused"));
  }
  console.log("PASS configuration: exact scoped metadata/acknowledgement, strict partial patches, stable identities, separate credential, no cookie/redirect forwarding, historical retry and uncertainty");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
