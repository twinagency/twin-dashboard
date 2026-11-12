// KNOWN RED (W1 lane 3 finding F17; REVIEW.md inv 6 "Secrets" applies only if upstream prose carries session data, inferred).
// parsePreparationState accepts any-length free text in vault.error (preparation.ts:49) and up to 240 chars of free text in
// failure/lastAttempt.operatorAction (:38), and Preparation.tsx:18,21 renders both as-is.
// Basis (the code's own contract, not a REVIEW line): the attempt/failure types are documented "Sanitized,
// fixed-vocabulary result" (preparation.ts:11-13), yet only `cause` is held to a token (/^[a-z][a-z0-9_]{0,63}$/), not
// operatorAction; vault.error is rendered token-style (`replaceAll("_"," ")`, Preparation.tsx:21), i.e. the UI expects a
// snake_case token, not prose. Related house convention, other families only: docs/onlyfans/API_CONTRACTS.md:58,109
// ("Plain language, never/no raw provider error" for healthReason and incident detail; preparation is not listed there).
// Fixed looks like: both fields are fixed-vocabulary tokens (or mapped to dashboard copy); prose is refused or dropped.
// Team's Claude owns the fix. Not wired into npm scripts; init.sh does not list it yet (lane 10/orchestrator wires it).
import assert from "node:assert/strict";
import test from "node:test";
import { parsePreparationState } from "../../lib/onlyfans/preparation";
import { preparationState as preparation } from "../helpers/w1-commerce-preparation-stub";

const PROSE = "provider said: 401 for acct_synthetic at https://x.invalid/path";
const TOKEN = "reconnect_account";
const vault = (error: string | null) => ({ jobId: "job-1", status: "failed", pagesRead: 0, itemsSeen: 0, selected: 0, error });
const failure = (operatorAction: string) => ({ outcome: "identity_failed", cause: "provider_unauthorized", retryNotBefore: null, exhausted: false, operatorAction });
const lastAttempt = (operatorAction: string) => ({ at: null, outcome: "identity_failed", cause: "provider_unauthorized", retryNotBefore: null, attempts: 1, exhausted: false, operatorAction });
const withheld = (result: unknown) => result === null || !JSON.stringify(result).includes(PROSE);

test("control: fixed-vocabulary vault.error, failure and lastAttempt (token operatorAction, token cause) parse", () => {
  assert.notEqual(parsePreparationState(preparation({ vault: vault("rate_limited") })), null, "token vault.error");
  assert.notEqual(parsePreparationState(preparation({ failure: failure(TOKEN) })), null, "failure with token operatorAction");
  assert.notEqual(parsePreparationState(preparation({ lastAttempt: lastAttempt(TOKEN) })), null, "lastAttempt with token operatorAction");
});

test("F17: free-text vault.error is refused or withheld", () => {
  assert.equal(withheld(parsePreparationState(preparation({ vault: vault(PROSE) }))), true, "raw provider text reached the parsed state");
});

test("F17: free-text operatorAction is refused or withheld", () => {
  assert.deepEqual({ failure: withheld(parsePreparationState(preparation({ failure: failure(PROSE) }))),
    lastAttempt: withheld(parsePreparationState(preparation({ lastAttempt: lastAttempt(PROSE) }))) }, { failure: true, lastAttempt: true },
    "raw provider text with a URL reached the parsed state");
});
