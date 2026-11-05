/** Activation status for one OnlyFans account: the four stages an administrator must see, each with an exact reason. */
export type StageName = "connection" | "model" | "runtime" | "replies";
export type StageState = "ok" | "warn" | "blocked" | "unknown";
export type Stage = { state: StageState; code: string | null; reason: string | null; action: string | null; revision?: number; modelId?: string | null; expiresAt?: string | null };
export type SkipCounts = {
  alreadyOn: number; noContact: number; humanTakeover: number; askedForPerson: number; pausedByStaff: number; muted: number;
  restricted: number; unresolvedDelivery: number; outsideScope: number; wouldEnable: number; total: number;
};
export type ActivationStatus = {
  accountId: string; observedAt: string; activated: boolean; ready: boolean; fingerprint: string;
  stages: Record<StageName, Stage>;
  allowance: { limitUnits: number; usedUnits: number; remainingUnits: number; throttleSeconds: number | null; mediaEnabled: boolean; state: "none" | "ok" | "exhausted" };
  budget: { dailyCostCapCents: number | null; spentTodayUnits: number; capUnits: number | null; state: string; flag: string | null; resetsAt: string | null;
    spendByPurpose?: { purpose: string; label: string; units: number; share: number }[] };
  provider?: { creditErrors24h: number; lastCreditErrorAt: string | null; creditErrorsRecent: boolean; rejectedKey24h: number; rateLimited24h: number };
  recentFailures?: { reason: string; count: number; lastAt: string | null }[];
  scope: { deploymentAllowed: boolean; allFansAllowed: boolean; selectionValid: boolean; selection: { mode: string; fans: number[] } | null; pilotFanOverride: string[] };
  conversations: { total: number; enabledNow: number; paused: number; notYetEnabled: number; pausedByStaff: number; noContact: number; humanControlled: number; takeoverRequested: number; needsPerson: number; unresolvedDelivery: number };
  escalations: { needsPerson: number; takeoverRequested: number; humanControlled: number; unresolvedDelivery: number; recent: { fanId: string; at: string | null }[] };
  futureConversations: { enabled: boolean; startsAt: string | null; default: false };
  warnings: { code: string; text: string }[];
  bulkEnable: { counts: SkipCounts; blockers: string[]; scopeMode: string };
};
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const text = (v: unknown, max = 600): v is string => typeof v === "string" && v.length <= max;
const nullText = (v: unknown, max = 600): v is string | null => v === null || text(v, max);
const STATES = ["ok", "warn", "blocked", "unknown"];
export const STAGE_NAMES: StageName[] = ["connection", "model", "runtime", "replies"];
export const STAGE_TITLES: Record<StageName, string> = {
  connection: "Connected to OnlyFans", model: "AI model usable", runtime: "Sender running", replies: "Conversations can receive replies",
};
const stage = (v: unknown): v is Stage => object(v) && STATES.includes(String(v.state)) && nullText(v.code, 80) && nullText(v.reason) && nullText(v.action, 40);
const countsOk = (v: unknown, keys: string[]) => object(v) && keys.every(k => count(v[k]));
const COUNT_KEYS = ["alreadyOn", "noContact", "humanTakeover", "askedForPerson", "pausedByStaff", "muted", "restricted", "unresolvedDelivery", "outsideScope", "wouldEnable", "total"];

export function parseActivationStatus(value: unknown, accountId: string): ActivationStatus | null {
  if (!object(value) || value.accountId !== accountId || value.statusVersion !== "of-activation-status.v1") return null;
  const { stages, allowance, budget, scope, conversations, escalations, futureConversations, warnings, bulkEnable } = value as Record<string, any>;
  if (!object(stages) || !STAGE_NAMES.every(name => stage(stages[name]))) return null;
  if (!countsOk(allowance, ["limitUnits", "usedUnits", "remainingUnits"]) || !["none", "ok", "exhausted"].includes(allowance.state)) return null;
  if (!object(budget) || !count(budget.spentTodayUnits) || !text(budget.state, 40) || !nullText(budget.flag)) return null;
  if (budget.spendByPurpose !== undefined && !(Array.isArray(budget.spendByPurpose) && budget.spendByPurpose.every((r: unknown) => object(r) && text(r.label, 80) && count(r.units) && typeof r.share === "number"))) return null;
  if (value.provider !== undefined && !(object(value.provider) && count(value.provider.creditErrors24h) && typeof value.provider.creditErrorsRecent === "boolean")) return null;
  if (value.recentFailures !== undefined && !(Array.isArray(value.recentFailures) && value.recentFailures.every((r: unknown) => object(r) && text(r.reason, 120) && count(r.count)))) return null;
  if (!object(scope) || typeof scope.selectionValid !== "boolean" || !Array.isArray(scope.pilotFanOverride)) return null;
  if (!countsOk(conversations, ["total", "enabledNow", "paused", "notYetEnabled", "pausedByStaff", "noContact", "humanControlled", "takeoverRequested", "needsPerson", "unresolvedDelivery"])) return null;
  if (!countsOk(escalations, ["needsPerson", "takeoverRequested", "humanControlled", "unresolvedDelivery"]) || !Array.isArray(escalations.recent)) return null;
  if (!object(futureConversations) || typeof futureConversations.enabled !== "boolean" || futureConversations.default !== false) return null;
  if (!Array.isArray(warnings) || !warnings.every(w => object(w) && text(w.code, 60) && text(w.text))) return null;
  if (!object(bulkEnable) || !countsOk(bulkEnable.counts, COUNT_KEYS) || !Array.isArray(bulkEnable.blockers)) return null;
  if (typeof value.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(value.fingerprint) || typeof value.activated !== "boolean" || typeof value.ready !== "boolean") return null;
  return value as unknown as ActivationStatus;
}

/** Fixed wording for the codes the backend returns; the status reason text is the fallback. */
export const BLOCKER_TEXT: Record<string, string> = {
  account_not_activated: "The account has not been activated yet.",
  not_connected: "No OnlyFans session is saved.", connection_unverified: "The session has not been verified.",
  connection_expired: "The session lease expired. Sign in again.", connection_check_failing: "The last session check failed.",
  connection_paused: "Outgoing was paused for this connection.", connection_scope: "The saved session belongs to another binding.",
  model_credential_missing: "This account has no model API key saved.", model_credential_invalid: "The saved model key could not be read.",
  model_credential_model_mismatch: "The saved key is for a different model than the one selected.", model_credential_expired: "The model key expired with the connection.",
  model_not_selected: "No reply model is selected in settings.", budget_unset: "No daily model budget is set.",
  provider_no_credit: "The model provider refused requests for lack of credit.", delivery_disabled: "Outgoing messages are switched off.", scope_invalid: "The saved fan scope needs review.",
};
export const blockerText = (code: string) => BLOCKER_TEXT[code] ?? code.replace(/_/g, " ");

export const SKIP_TEXT: Record<string, string> = {
  alreadyOn: "already on", noContact: "no-contact (kept)", humanTakeover: "human takeover (kept)", askedForPerson: "asked for a person (kept)",
  pausedByStaff: "paused by staff (kept)", muted: "muted fans", restricted: "restricted by a stronger stop", unresolvedDelivery: "unresolved delivery",
  outsideScope: "outside the selected fan scope",
};
export const RESULT_SKIP_TEXT: Record<string, string> = {
  no_contact: "no-contact", human_takeover: "human takeover", paused_by_staff: "paused by staff", asked_for_person: "asked for a person",
  muted: "muted", restricted: "stronger stop", unresolved_delivery: "unresolved delivery", outside_scope: "outside fan scope",
  changed_meanwhile: "changed while running", refused_other: "refused",
};
