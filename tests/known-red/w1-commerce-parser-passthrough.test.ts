// KNOWN RED (REVIEW.md inv 6 "Secrets": session data never reaches the browser; W1 lane 3 finding F9).
// parseMoxy (moxy.ts:26, `return v as MoxyView`) and parsePreparationState (preparation.ts:53, `return v as PreparationState`;
// the nested vault object at :46-50 too) validate the known keys and then return the raw upstream object, so any unknown key (debug, token shaped) reaches every
// agency reader. The category parsers use exact() and refuse unknown keys (contrast, commercial-categories.ts:11).
// Fixed looks like: refuse the payload, or return a projection built from the checked keys only.
// Team's Claude owns the fix. Not wired into npm scripts; init.sh does not list it yet (lane 10/orchestrator wires it).
import assert from "node:assert/strict";
import test from "node:test";
import { MOXY_SCHEMA, parseMoxy, starterSettings } from "../../lib/onlyfans/moxy";
import { parsePreparationState } from "../../lib/onlyfans/preparation";

const LEAK = "providerSessionDebug";
const decision = (extra: Record<string, unknown> = {}) => ({ id: "d-1", fanId: 42, kind: "offer", status: "held", reason: null, decision: null, intentId: null, ...extra });
const moxy = (extra: Record<string, unknown> = {}, d: Record<string, unknown> = decision()) => ({ ok: true, schemaVersion: MOXY_SCHEMA, accountId: "of-a",
  moxy: { engine: "moxy", moxySelected: true, mode: "off", revision: 2, readiness: { ready: false, blockers: ["synthetic_blocker"] }, settings: starterSettings("synthetic"), decisions: [d], ...extra } });
const preparation = (extra: Record<string, unknown> = {}) => ({ configured: true, revision: 4, status: "configured", fingerprint: "e".repeat(64),
  config: { contract_version: "preparation.v1", provider_account: "acct_synthetic", creator_id: "123", qualification: { mode: "fixture", reference: "synthetic-approval" },
    limits: { provider_requests: 10, provider_credit_budget: 100, provider_credits_per_request: 5 } },
  providerRequestsUsed: 0, providerCreditsReserved: 0, automaticRepliesEnabled: false, salesEnabled: false, historyCoverage: "pending", ownershipCoverage: "pending", ...extra });
const dropped = (result: unknown) => result === null || !JSON.stringify(result).includes(LEAK);

const vault = (extra: Record<string, unknown> = {}) => ({ jobId: "job-1", status: "running", pagesRead: 0, itemsSeen: 0, selected: 0, error: null, ...extra });

test("control: valid synthetic Moxy and preparation payloads parse", () => {
  assert.notEqual(parseMoxy(moxy(), "of-a"), null);
  assert.notEqual(parsePreparationState(preparation()), null);
  assert.notEqual(parsePreparationState(preparation({ vault: vault() })), null);
});

test("F9: an unknown key at the Moxy level does not pass through parseMoxy", () => {
  assert.equal(dropped(parseMoxy(moxy({ [LEAK]: "synthetic" }), "of-a")), true);
});

test("F9: an unknown key inside a Moxy decision does not pass through parseMoxy", () => {
  assert.equal(dropped(parseMoxy(moxy({}, decision({ [LEAK]: "synthetic" })), "of-a")), true);
});

test("F9: an unknown key on a configured preparation state does not pass through parsePreparationState", () => {
  assert.equal(dropped(parsePreparationState(preparation({ [LEAK]: "synthetic" }))), true);
});

test("F9: an unknown key inside the preparation vault does not pass through parsePreparationState", () => {
  assert.equal(dropped(parsePreparationState(preparation({ vault: vault({ [LEAK]: "synthetic" }) }))), true);
});
