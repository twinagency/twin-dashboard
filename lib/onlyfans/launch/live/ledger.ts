export * from "./ledger-model";
import { LEDGER_SCHEMA, LEDGER_STATUS, LEDGER_ERRORS, Ledger, parseLedger } from "./ledger-model";
import { digest, fail, ok, rec, upstream, refusal, READ_ONLY, type Ans, type Env } from "./upstream";
export const ledgerRead = async (env: Env): Promise<Ans> => {
  const r = await upstream(env.fetch, "read", env.accountId, "/ledger", { expectSchema: LEDGER_SCHEMA });
  if (!r.ok) return refusal(r);
  const l = parseLedger(r.body, env.accountId);
  return l ? ok(env.accountId, l) : fail(503, "The ledger answer was not in the expected shape, so nothing is shown.", "unreadable");
};

const KEY = /^[a-f0-9]{64}$/;
/** Server-derived actor and key from the exact state the operator saw; the same click replays the same command. */
export async function ledgerRetry(env: Env, input: unknown): Promise<Ans> {
  if (!env.canManage || !env.actor) return READ_ONLY;
  if (!rec(input) || Object.keys(input).sort().join() !== "expectedConnectionRevision,expectedScanFingerprint" ||
    !Number.isSafeInteger(input.expectedConnectionRevision) || (input.expectedConnectionRevision as number) < 0 || (input.expectedConnectionRevision as number) >= 2 ** 31 - 1 ||
    typeof input.expectedScanFingerprint !== "string" || !KEY.test(input.expectedScanFingerprint)) return fail(400, "That ledger retry is invalid.", "invalid_request");
  const body = { expectedConnectionRevision: input.expectedConnectionRevision, expectedScanFingerprint: input.expectedScanFingerprint };
  const commandKey = digest(["ledger_retry", env.accountId, body, env.actor]);
  const r = await upstream(env.fetch, "control", env.accountId, "/ledger/retry", { method: "POST", actor: env.actor, body: { commandKey, ...body } });
  if (!r.ok) return refusal(r);
  const b = r.body;
  if (b.ok !== true || b.accepted !== true || b.outcome !== "queued" || b.commandKey !== commandKey || b.accountId !== env.accountId || typeof b.queuedAt !== "string")
    return fail(502, "The outcome is not confirmed. Refresh the ledger status before trying again.", "outcome_unconfirmed", { outcome: "unconfirmed" });
  return ok(env.accountId, { outcome: "queued", queuedAt: b.queuedAt }, { outcome: "queued" });
}
