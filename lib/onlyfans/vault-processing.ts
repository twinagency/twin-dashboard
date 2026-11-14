/** Commercial vault processing status (import coverage + description analysis). Parsed tolerantly: unknown keys are dropped,
 * a missing required count makes that whole section "not reported" instead of being guessed, and free text is limited to safe codes (no URLs). */
import { CONTENT_SCHEMA } from "./content";
import { parseVaultCoverage, type VaultCoverage } from "./vault";

export type VaultAnalysisCounts = { eligible: number; queued: number; processing: number; completed: number; unresolved: number; skippedOperator: number; waitingRetry: number };
export type VaultAnalysis = VaultAnalysisCounts & { byKind: { photo: VaultAnalysisCounts | null; video: VaultAnalysisCounts | null }; unresolvedReasons: Record<string, number> };
export type VaultCredentialState = "ok" | "missing" | "invalid" | "budget" | "unknown";
export type VaultProcessingStatus = {
  account: string | null; paused: boolean; pauseReason: string | null;
  import: (VaultCoverage & { jobStatus: string | null }) | null;
  analysis: VaultAnalysis | null; credential: { state: VaultCredentialState } | null; updatedAt: string | null;
};
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 100_000_000;
const SAFE_CODE = /^[A-Za-z0-9_:.-]{1,120}$/;
const safeCode = (value: unknown): string | null => typeof value === "string" && SAFE_CODE.test(value) ? value : null;
function counts(value: unknown): VaultAnalysisCounts | null {
  if (!object(value) || !count(value.eligible) || !count(value.queued) || !count(value.processing) || !count(value.completed) || !count(value.unresolved)) return null;
  if (value.skippedOperator !== undefined && !count(value.skippedOperator)) return null;
  if (value.waitingRetry !== undefined && !count(value.waitingRetry)) return null;
  return { eligible: value.eligible, queued: value.queued, processing: value.processing, completed: value.completed, unresolved: value.unresolved,
    skippedOperator: (value.skippedOperator as number | undefined) ?? 0, waitingRetry: (value.waitingRetry as number | undefined) ?? 0 };
}
function parseAnalysis(value: unknown): VaultAnalysis | null {
  const total = counts(value); if (!total || !object(value)) return null;
  const kinds = object(value.byKind) ? value.byKind : {};
  const reasons: Record<string, number> = {};
  if (object(value.unresolvedReasons)) for (const [key, n] of Object.entries(value.unresolvedReasons).slice(0, 60)) {
    if (!count(n)) continue;
    const code = safeCode(key) ?? "other"; reasons[code] = (reasons[code] ?? 0) + n;
  }
  return { ...total, byKind: { photo: counts(kinds.photo), video: counts(kinds.video) }, unresolvedReasons: reasons };
}
export function parseVaultProcessingStatus(value: unknown): VaultProcessingStatus | null {
  if (!object(value) || typeof value.paused !== "boolean") return null;
  const coverage = object(value.import) ? parseVaultCoverage(value.import) : null;
  const credential = object(value.credential) ? { state: credentialState(value.credential.state) } : null;
  const updated = typeof value.updatedAt === "string" && Number.isFinite(Date.parse(value.updatedAt)) ? value.updatedAt : null;
  return {
    account: typeof value.account === "string" && value.account.length <= 200 ? value.account : null,
    paused: value.paused, pauseReason: value.pauseReason === null || value.pauseReason === undefined ? null : safeCode(value.pauseReason) ?? "unreadable_reason",
    import: coverage ? { ...coverage, jobStatus: object(value.import) ? safeCode(value.import.jobStatus ?? value.import.status) : null } : null,
    analysis: parseAnalysis(value.analysis), credential, updatedAt: updated,
  };
}
function credentialState(value: unknown): VaultCredentialState {
  return value === "ok" || value === "missing" || value === "invalid" || value === "budget" ? value : "unknown";
}
/** GET /vault/processing -> {ok, processing}. A response about another account is refused. */
export function parseVaultProcessingRead(value: unknown, accountId: string): VaultProcessingStatus | null {
  if (!object(value) || value.ok !== true || (value.accountId !== undefined && value.accountId !== accountId) ||
    (value.schemaVersion !== undefined && value.schemaVersion !== CONTENT_SCHEMA)) return null;
  const status = parseVaultProcessingStatus(value.processing);
  return status && (status.account === null || status.account === accountId) ? status : null;
}
/** POST ack. A confirmed ok with an unreadable status still counts as applied (status null): the caller re-reads. */
export function parseVaultProcessingAck(value: unknown, expected: { accountId: string; commandKey?: string }): { processing: VaultProcessingStatus | null } | null {
  if (!object(value) || value.ok !== true || value.applied === false || (value.accountId !== undefined && value.accountId !== expected.accountId) ||
    (value.commandKey !== undefined && expected.commandKey !== undefined && value.commandKey !== expected.commandKey) ||
    (value.schemaVersion !== undefined && value.schemaVersion !== CONTENT_SCHEMA)) return null;
  const processing = parseVaultProcessingStatus(value.processing);
  if (value.processing !== undefined && value.processing !== null && processing && processing.account !== null && processing.account !== expected.accountId) return null;
  return { processing };
}
