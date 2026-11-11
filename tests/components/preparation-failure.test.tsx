/** Preparation status: a failed worker attempt is visible with cause, retry time and required action. Offline. */
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parsePreparationState, type PreparationState } from "../../lib/onlyfans/preparation";
import { PreparationStatus } from "../../components/onlyfans-preview/Preparation";

Object.assign(globalThis, { React });
const base = {
  configured: true, revision: 1, status: "configured", fingerprint: "a".repeat(64),
  config: { contract_version: "preparation.v1", provider_account: "acct_x", creator_id: "101",
    qualification: { mode: "fixture", reference: "ref" }, limits: { provider_requests: 10, provider_credit_budget: 20, provider_credits_per_request: 2 } },
  providerRequestsUsed: 1, providerCreditsReserved: 2, automaticRepliesEnabled: false, salesEnabled: false,
  historyCoverage: "pending", ownershipCoverage: "pending", connected: false, vault: null,
};
const attempt = (over: Record<string, unknown>) => ({ at: "2026-11-11T05:30:20Z", outcome: "identity_failed", cause: "provider_auth_rejected",
  retryNotBefore: null, attempts: 1, exhausted: false, operatorAction: "Check the account credential and connection in FansAPI, then resume preparation.", ...over });
const failure = (a: Record<string, unknown>) => ({ outcome: a.outcome, cause: a.cause, retryNotBefore: a.retryNotBefore, exhausted: a.exhausted, operatorAction: a.operatorAction });
const state = (a: Record<string, unknown> | null) => {
  const parsed = parsePreparationState({ ...base, lastAttempt: a, failure: a && !["complete", "partial"].includes(String(a.outcome)) ? failure(a) : null });
  assert.ok(parsed && parsed.configured);
  return parsed as Extract<PreparationState, { configured: true }>;
};
const html = (s: Extract<PreparationState, { configured: true }>) => renderToStaticMarkup(<PreparationStatus state={s} />);

test("a failed identity attempt is never described as awaiting verification", () => {
  const out = html(state(attempt({})));
  assert.match(out, /Provider identity not verified: provider auth rejected/);
  assert.match(out, /Not retried automatically/);
  assert.match(out, /Required action: Check the account credential/);
  assert.doesNotMatch(out, /awaiting verification/i);
});

test("transient failures show the next retry and exhaustion is explicit", () => {
  const waiting = html(state(attempt({ outcome: "transient", cause: "provider_rate_limited", retryNotBefore: "2026-11-11T05:32:20Z", attempts: 2 })));
  assert.match(waiting, /provider rate limited/);
  assert.match(waiting, /Next retry after 2026-11-11 05:32 UTC/);
  const spent = html(state(attempt({ outcome: "transient", cause: "vault_retry_exhausted", exhausted: true, attempts: 5, operatorAction: "Retries are exhausted. Check provider status, then resume preparation or request a new vault sync." })));
  assert.match(spent, /Retries exhausted\. The worker has stopped trying\./);
  assert.doesNotMatch(spent, /Next retry after/);
});

test("credential, budget and schema outcomes are labelled distinctly", () => {
  assert.match(html(state(attempt({ outcome: "credential_missing", cause: "credential_unavailable" }))), /Credential missing/);
  assert.match(html(state(attempt({ outcome: "budget_exhausted", cause: "provider_budget_exhausted" }))), /Read ceiling spent/);
  assert.match(html(state(attempt({ outcome: "schema", cause: "provider_response_invalid" }))), /Provider response not understood/);
});

test("no attempt, progress and success do not invent a failure", () => {
  assert.match(html(state(null)), /No worker attempt recorded yet/);
  const progress = html(state(attempt({ outcome: "partial", cause: "page_imported" })));
  assert.doesNotMatch(progress, /data-preparation-failure/);
  assert.match(progress, /Provider identity not yet verified/);
});

test("parser keeps older backends valid and rejects malformed or unbounded attempt records", () => {
  assert.ok(parsePreparationState(base));
  assert.equal(parsePreparationState({ ...base, lastAttempt: attempt({ cause: "Bearer secret token text" }) }), null);
  assert.equal(parsePreparationState({ ...base, lastAttempt: attempt({ outcome: "nonsense" }) }), null);
  assert.equal(parsePreparationState({ ...base, lastAttempt: attempt({ retryNotBefore: "tomorrow" }) }), null);
  assert.equal(parsePreparationState({ ...base, lastAttempt: attempt({ extra: "x" }) }), null);
  assert.equal(parsePreparationState({ ...base, failure: failure(attempt({ outcome: "complete" })) }), null);
  assert.ok(parsePreparationState({ ...base, vault: { jobId: "j", status: "pending", pagesRead: 1, itemsSeen: 24, error: "vault_read_failed", selected: 0, retryAttempts: 2, retryNotBefore: "2026-11-11T05:32:20Z" } }));
});
