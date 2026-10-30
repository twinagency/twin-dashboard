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
for (const value of ["off", "shadow", "live"]) {
  const received = parseConfiguration(response({ ...configuration, fasttContextualSalesMode: value }), "of-fixture");
  assert.equal(received?.fasttContextualSalesMode, value);
  assert.equal(received?.dailyCostCapCents, 500);
  assert.equal(received?.fasttPostBuyUpsell, true);
  const request = { expectedRevision: 7, expectedFingerprint: "a".repeat(64), patch: { fasttContextualSalesMode: value } };
  assert.ok(validConfigurationRequest(request));
  assert.deepEqual(Object.keys(request.patch), ["fasttContextualSalesMode"]);
}
for (const bad of [null, true, 1, "On", "preview", "", [], {}]) {
  assert.equal(parseConfiguration(response({ ...configuration, fasttContextualSalesMode: bad }), "of-fixture"), null);
  assert.equal(validConfigurationRequest({ expectedRevision: 7, expectedFingerprint: "a".repeat(64), patch: { fasttContextualSalesMode: bad } }), false);
}
assert.equal(validConfigurationRequest({ expectedRevision: 7, expectedFingerprint: "a".repeat(64), patch: { fasttContextualSalesMode: "live", activateNewFans: true } }), false);
console.log("Contextual configuration: old API compatibility, all modes, invalid writes, unrelated settings and activation refusal passed");
