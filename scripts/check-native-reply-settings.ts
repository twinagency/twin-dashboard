import assert from "node:assert/strict";
import { CONFIGURATION_SCHEMA, FACT_KEYS, parseConfiguration, validConfigurationRequest } from "../lib/onlyfans/configuration";

const configuration = {
  configurationRevision: 7, fingerprint: "a".repeat(64), persona: "Creator-approved fixture persona", personaTruncated: false,
  creatorFacts: Object.fromEntries(FACT_KEYS.map(key => [key, null])),
  factFields: FACT_KEYS.map(key => ({ key, label: key })), factsValid: true, readOnlyFacts: [], modelsValid: true,
  sharedFacts: { state: "unconfigured", checkedAt: null, sourceUpdatedAt: null, overrideKeys: [] },
  defaultModel: "synthetic/model", replyModelOverride: null, replyOverridePresent: false,
  resolvedReplyModel: "synthetic/model", modelOptions: ["synthetic/model"],
  salesConfigurationValid: true, onRequestSalesEnabled: true, fasttDiscountResend: false, fasttPostBuyUpsell: true,
  dailyCostCapCents: 500, reasoningEffort: null, reasoningOptions: { "synthetic/model": [] },
};
const response = (c: unknown) => ({ schemaVersion: CONFIGURATION_SCHEMA, accountId: "of-fixture", ok: true, configuration: c });
assert.ok(parseConfiguration(response(configuration), "of-fixture"), "older API remains readable before backend rollout");
for (const field of ["nativeReplyPacingEnabled", "nativeReplyFormatEnabled"] as const) {
  for (const value of [true, false]) {
    const received = parseConfiguration(response({ ...configuration, [field]: value }), "of-fixture");
    assert.equal(received?.[field], value);
    const request = {expectedRevision: 7, expectedFingerprint: "a".repeat(64), patch: {[field]: value}};
    assert.ok(validConfigurationRequest(request));
    assert.deepEqual(Object.keys(request.patch), [field]);
  }
  for (const value of [null, 0, 1, "true", "false", [], {}]) {
    assert.equal(parseConfiguration(response({...configuration, [field]: value}), "of-fixture"), null);
    assert.equal(validConfigurationRequest({expectedRevision: 7, expectedFingerprint: "a".repeat(64), patch: {[field]: value}}), false);
  }
}
assert.ok(parseConfiguration(response({...configuration,nativeReplyPacingEnabled:true,nativeReplyFormatEnabled:false,fasttContextualSalesMode:"shadow"}), "of-fixture"));
assert.equal(validConfigurationRequest({expectedRevision:7,expectedFingerprint:"a".repeat(64),patch:{nativeReplyPacingEnabled:true,activateNewFans:true}}),false);
console.log("Reply settings contract: legacy compatibility, independent booleans, contextual coexistence and invalid-write rejection passed");
