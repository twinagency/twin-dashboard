export * from "./memory-model";
import { FACT_FIELDS, PROFILE_FIELDS, ALL_FIELDS, FIELD_LABEL, limitFor, Recovery, parseRecovery, MemoryProgress, parseMemoryProgress, Fact, FanMemory, parseFanMemory, Correction, validCorrection } from "./memory-model";
import { digest, fail, ok, rec, upstream, refusal, READ_ONLY, FAN_ID, type Ans, type Env, type Rec } from "./upstream";
export async function recoveryRead(env: Env): Promise<Ans> {
  const r = await upstream(env.fetch, "configuration", env.accountId, "/history-memory/progress");
  if (!r.ok) return refusal(r);
  const p = parseRecovery(r.body.progress, env.accountId, null);
  return p ? ok(env.accountId, { recovery: p }) : fail(503, "The recovery answer was not in the expected shape, so nothing is shown.", "unreadable");
}
export async function fanRead(env: Env, fanId: string): Promise<Ans> {
  if (!FAN_ID.test(fanId)) return fail(400, "That fan reference is invalid.", "invalid_request");
  const [progress, memory] = await Promise.all([
    upstream(env.fetch, "configuration", env.accountId, `/history-memory/fans/${fanId}/progress`),
    upstream(env.fetch, "configuration", env.accountId, `/history-memory/fans/${fanId}/memory`)]);
  if (!progress.ok) return refusal(progress);
  if (!memory.ok) return refusal(memory);
  const rp = rec(progress.body.recovery) ? parseRecovery(progress.body.recovery, env.accountId, fanId) : null;
  const mp = parseMemoryProgress(progress.body.memory), m = parseFanMemory(memory.body.memory);
  return rp && mp && m ? ok(env.accountId, { fanId, recovery: rp, progress: mp, memory: m }) : fail(503, "The memory answer was not in the expected shape, so nothing is shown.", "unreadable");
}

export async function fanCorrect(env: Env, fanId: string, input: unknown): Promise<Ans> {
  if (!env.canManage || !env.actor) return READ_ONLY;
  if (!FAN_ID.test(fanId) || !validCorrection(input)) return fail(400, "That correction is invalid.", "invalid_request");
  const reason = input.reason ?? "Operator correction from the dashboard";
  const commandKey = digest(["memory_correction", env.accountId, fanId, input.field, input.operation, input.value, input.expectedVersion, reason, env.actor]);
  const r = await upstream(env.fetch, "configuration", env.accountId, `/history-memory/fans/${fanId}/corrections`, { method: "POST",
    body: { field: input.field, operation: input.operation, value: input.value, expectedVersion: input.expectedVersion, commandKey, actor: env.actor, reason } });
  if (!r.ok) return refusal(r);
  const c = r.body.correction;
  if (r.body.commandKey !== commandKey || !rec(c) || !Number.isSafeInteger(c.revision) || (c.revision as number) < 1 || typeof c.replayed !== "boolean")
    return fail(502, "The outcome is not confirmed. Reload this fan before trying again.", "outcome_unconfirmed", { outcome: "unconfirmed" });
  return ok(env.accountId, { revision: c.revision, replayed: c.replayed }, { outcome: "recorded" });
}
/** Asks the worker to resume history recovery. "requested" is not "recovered": nothing has been read yet. */
export async function backfillRequest(env: Env, input: unknown): Promise<Ans> {
  if (!env.canManage || !env.actor) return READ_ONLY;
  if (!rec(input) || Object.keys(input).some(k => k !== "fanId") || (input.fanId !== undefined && !(typeof input.fanId === "string" && FAN_ID.test(input.fanId)))) return fail(400, "That request is invalid.", "invalid_request");
  const fan = input.fanId as string | undefined;
  const r = await upstream(env.fetch, "configuration", env.accountId, fan ? `/history-memory/fans/${fan}/backfill` : "/history-memory/backfill", { method: "POST", body: { actor: env.actor } });
  if (!r.ok) return refusal(r);
  return r.body.requested === (fan ? "fan" : "account") ? ok(env.accountId, { requested: r.body.requested }, { outcome: "requested" })
    : fail(502, "The outcome is not confirmed. Check recovery progress before trying again.", "outcome_unconfirmed", { outcome: "unconfirmed" });
}
export type { Rec };
