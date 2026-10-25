/** Read-only metadata. Operational counters never prove provider connection. */
export const OPERATION_REASONS = {
  runtime_not_registered: "Account processing has not been set up.",
  runtime_disabled: "Account processing is paused.",
  history_recovery_required: "History needs to finish synchronizing.",
  intake_count_mismatch: "The intake count needs investigation.",
  history_not_current: "History synchronization is incomplete or out of date.",
  history_sync_time_invalid: "The synchronization timestamp needs investigation.",
  history_quarantined: "Conflicting history needs review.",
  creator_facts_not_current: "Twin creator facts need synchronization. AI replies are held.",
  commerce_evidence_conflict: "Purchase evidence needs review or synchronization. Media sales are held.",
  delivery_unresolved: "An earlier delivery outcome needs evidence review.",
  delivery_in_progress: "A delivery attempt is in progress.",
  receipt_projection_pending: "A saved receipt is waiting to appear in history.",
  generation_unresolved: "Reply generation needs review before it can continue.",
  generation_held: "A reply draft was refused or became out of date.",
  model_cost_unresolved: "An earlier model call has uncertain cost. Its reservation remains in the allowance.",
  model_budget_exhausted: "The recorded model allowance is exhausted for at least one provider.",
  delivery_disabled: "Delivery is disabled.",
  cap_exhausted: "The recorded delivery allowance is exhausted.",
  waiting_queue_older_than_two_minutes: "Waiting work is more than two minutes old.",
} as const;

export type OperationsSnapshot = {
  schemaVersion: "of-operations.v3";
  accountId: string;
  asOf: string;
  providerConnectionVerified: boolean;
  reasons: (keyof typeof OPERATION_REASONS)[];
  intake: { pending: number; quarantined: number };
  planning: { generating: number; ready: number; unknown: number; refused: number; stale: number };
  work: { waiting: number; claimed: number; blocked: number; oldestWaitingAgeSeconds: number | null };
  delivery: { queued: number; dispatching: number; unknown: number; acceptedAwaitingProjection: number; retainedUnresolvedReceipts: number };
  runtime: { registered: boolean; enabled: boolean; recoveryRequired: boolean; lastCompleteSyncAt: string | null };
  policy: { revision: number; enabled: boolean; usedUnits: number; limitUnits: number; nextDispatchAt: string | null } | null;
  modelCosts: { day: string; unit: "usd_millicents"; spentMillicents: number; capPerProviderMillicents: number | null; calls: number; unresolvedCalls: number; providers: number };
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function stamp(value: unknown): value is string {
  return typeof value === "string" && /(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
}
function optionalStamp(value: unknown): value is string | null { return value === null || stamp(value); }
function day(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function formatModelUsd(millicents: number): string {
  if (!count(millicents)) throw new RangeError("Invalid model cost");
  const value = BigInt(millicents);
  return `USD ${value / BigInt(10000)}.${String(value % BigInt(10000)).padStart(4, "0")}`;
}
function keys(value: unknown, names: string[]): boolean {
  return record(value) && Object.keys(value).length === names.length && names.every((name) => Object.hasOwn(value, name));
}

export function parseOperations(value: unknown, accountId: string): OperationsSnapshot | null {
  if (!keys(value, ["schemaVersion", "accountId", "asOf", "providerConnectionVerified", "reasons", "intake", "planning", "work", "delivery", "runtime", "policy", "modelCosts"])) return null;
  if (!record(value) || value.schemaVersion !== "of-operations.v3" || value.accountId !== accountId
      || !stamp(value.asOf) || typeof value.providerConnectionVerified !== "boolean"
      || !Array.isArray(value.reasons) || value.reasons.length > Object.keys(OPERATION_REASONS).length
      || new Set(value.reasons).size !== value.reasons.length
      || !value.reasons.every((reason) => typeof reason === "string" && Object.hasOwn(OPERATION_REASONS, reason))) return null;
  if (!record(value.intake) || !count(value.intake.pending) || !count(value.intake.quarantined)
      || !record(value.planning) || ![value.planning.generating, value.planning.ready, value.planning.unknown, value.planning.refused, value.planning.stale].every(count)
      || !record(value.work) || ![value.work.waiting, value.work.claimed, value.work.blocked].every(count)
      || !(value.work.oldestWaitingAgeSeconds === null || count(value.work.oldestWaitingAgeSeconds))
      || !record(value.delivery) || ![value.delivery.queued, value.delivery.dispatching, value.delivery.unknown,
        value.delivery.acceptedAwaitingProjection, value.delivery.retainedUnresolvedReceipts].every(count)
      || !record(value.runtime) || ![value.runtime.registered, value.runtime.enabled, value.runtime.recoveryRequired].every((v) => typeof v === "boolean")
      || !optionalStamp(value.runtime.lastCompleteSyncAt)) return null;
  if (!record(value.modelCosts) || !keys(value.modelCosts, ["day", "unit", "spentMillicents", "capPerProviderMillicents", "calls", "unresolvedCalls", "providers"])
      || !day(value.modelCosts.day) || value.modelCosts.unit !== "usd_millicents"
      || ![value.modelCosts.spentMillicents, value.modelCosts.calls, value.modelCosts.unresolvedCalls, value.modelCosts.providers].every(count)
      || !(value.modelCosts.capPerProviderMillicents === null || count(value.modelCosts.capPerProviderMillicents))) return null;
  if (value.policy !== null && (!record(value.policy) || ![value.policy.revision, value.policy.usedUnits, value.policy.limitUnits].every(count)
      || typeof value.policy.enabled !== "boolean" || !optionalStamp(value.policy.nextDispatchAt))) return null;
  if (!keys(value.intake, ["pending", "quarantined"]) || !keys(value.planning, ["generating", "ready", "unknown", "refused", "stale"])
      || !keys(value.work, ["waiting", "claimed", "blocked", "oldestWaitingAgeSeconds"])
      || !keys(value.delivery, ["queued", "dispatching", "unknown", "acceptedAwaitingProjection", "retainedUnresolvedReceipts"])
      || !keys(value.runtime, ["registered", "enabled", "recoveryRequired", "lastCompleteSyncAt"])
      || (value.policy !== null && !keys(value.policy, ["revision", "enabled", "usedUnits", "limitUnits", "nextDispatchAt"]))) return null;
  return value as OperationsSnapshot;
}
