// W1 lane 3 shared preparation stub: a synthetic preparation config/state and a stop POSTed through the real
// configuredPreparationBackend against a stubbed fetch (https://backend.invalid, synthetic token, env restored after).
// Used by tests/known-red/w1-commerce-preparation-{stop,free-text}.test.ts and tests/rules/w1-commerce-holds.test.ts.
import assert from "node:assert/strict";
import { configuredPreparationBackend } from "../../lib/onlyfans/preparation-backend";
import { CONFIGURATION_SCHEMA } from "../../lib/onlyfans/configuration";

export const HASH = "e".repeat(64);
export const preparationConfig = { contract_version: "preparation.v1", provider_account: "acct_synthetic", creator_id: "123",
  qualification: { mode: "fixture", reference: "synthetic-approval" }, limits: { provider_requests: 10, provider_credit_budget: 100, provider_credits_per_request: 5 } };
export const preparationState = (extra: Record<string, unknown> = {}) => ({ configured: true, revision: 4, status: "configured", fingerprint: HASH, config: preparationConfig,
  providerRequestsUsed: 0, providerCreditsReserved: 0, automaticRepliesEnabled: false, salesEnabled: false, historyCoverage: "pending", ownershipCoverage: "pending", ...extra });

/** POSTs a stop carrying `commandKey`; the stub answers 200 with `ack.commandKey` and `ack.preparation`. */
export async function sendPreparationStop(commandKey: string, ack: { commandKey: string; preparation: unknown }) {
  const fetchImpl = (async () => new Response(JSON.stringify({ schemaVersion: CONFIGURATION_SCHEMA, ok: true, accountId: "of-a", ...ack }),
    { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;
  const saved = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith("ONLYFANS_")));
  for (const k of Object.keys(process.env)) if (k.startsWith("ONLYFANS_")) delete process.env[k];
  process.env.ONLYFANS_API_BASE_URL = "https://backend.invalid"; process.env.ONLYFANS_CONFIGURATION_TOKEN = "synthetic-token";
  let backend: ReturnType<typeof configuredPreparationBackend>;
  try { backend = configuredPreparationBackend(fetchImpl); }
  finally { for (const k of Object.keys(process.env)) if (k.startsWith("ONLYFANS_")) delete process.env[k]; Object.assign(process.env, saved); }
  assert.ok(backend, "synthetic CONFIGURATION env must configure the backend");
  // expectedRevision is here only because the stop type demands it: request() takes Omit<PreparationCommand,"requestId">
  // (preparation-backend.ts:7), and Omit on the union keeps only the common keys, so `config` is dropped and a configure
  // cannot be sent through this type at all. An F7 fix that removes expectedRevision from the stop type turns this call
  // tsc-red: drop the field here and record it as a TEST-CHANGE (findings F7).
  return backend.request("of-a", { action: "stop", expectedRevision: 3, reason: "stop spending", actor: "operator:synthetic", commandKey });
}
