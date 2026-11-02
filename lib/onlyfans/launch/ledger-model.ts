/** Canonical flat ledger status of-ledger.v1. Evidence is a separate read resource. */
export const LEDGER_SCHEMA = "of-ledger.v1";
export const LEDGER_STATUS = ["not_started", "idle", "running", "held"] as const;
export const LEDGER_ERRORS = ["connection_unavailable", "connection_changed", "unsupported_ledger_response", "unsupported_ledger_pagination", "ledger_read_failed", "provider_read_deferred", "provider_read_stale", "provider_rate_limited", "unknown_error"] as const;
export type Ledger = { schemaVersion: typeof LEDGER_SCHEMA; accountId: string; status: typeof LEDGER_STATUS[number]; windowStart: string | null; windowEnd: string | null; pageOffset: number | null;
  lastCompleteAt: string | null; lastFullAt: string | null; nextPollAt: string | null; lastError: typeof LEDGER_ERRORS[number] | null;
  leaseActive: boolean; connectionCurrent: boolean; connectionRevision: number | null; conflictCount: number; unlinkedPaidCount: number;
  requiresInvestigation: boolean; commerceHeld: boolean; scanFingerprint: string | null };
const rec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const stamp = (v: unknown): v is string | null => v === null || typeof v === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(v) && Number.isFinite(Date.parse(v));
const key = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const KEYS = ["schemaVersion", "accountId", "status", "windowStart", "windowEnd", "pageOffset", "lastCompleteAt", "lastFullAt", "nextPollAt", "lastError", "leaseActive", "connectionCurrent", "connectionRevision", "conflictCount", "unlinkedPaidCount", "requiresInvestigation", "commerceHeld", "scanFingerprint"].sort().join(",");
export function parseLedger(v: unknown, accountId: string): Ledger | null {
  if (!rec(v) || Object.keys(v).sort().join(",") !== KEYS || v.schemaVersion !== LEDGER_SCHEMA || v.accountId !== accountId || !(LEDGER_STATUS as readonly unknown[]).includes(v.status) ||
    !["windowStart", "windowEnd", "lastCompleteAt", "lastFullAt", "nextPollAt"].every(k => stamp(v[k])) || !(v.pageOffset === null || count(v.pageOffset)) ||
    !(v.lastError === null || (LEDGER_ERRORS as readonly unknown[]).includes(v.lastError)) || !["leaseActive", "connectionCurrent", "requiresInvestigation", "commerceHeld"].every(k => typeof v[k] === "boolean") ||
    !(v.connectionRevision === null || count(v.connectionRevision)) || !count(v.conflictCount) || !count(v.unlinkedPaidCount) || !(v.scanFingerprint === null || key(v.scanFingerprint))) return null;
  if ((v.status === "not_started") !== (v.scanFingerprint === null)) return null;
  if (v.status === "not_started" && (["windowStart", "windowEnd", "pageOffset", "lastCompleteAt", "lastFullAt", "nextPollAt", "lastError"].some(k => v[k] !== null) || v.leaseActive || v.connectionCurrent)) return null;
  return v as Ledger;
}
export const parsePurchases = parseLedger;
export const LEDGER_STATUS_TEXT: Record<Ledger["status"], string> = { not_started: "Not started", idle: "Between passes", running: "Scan in progress (includes waiting between pages)", held: "Held, needs attention" };
export const LEDGER_ERROR_TEXT: Record<NonNullable<Ledger["lastError"]>, string> = { connection_unavailable: "The connection was unavailable", connection_changed: "The connection changed during the scan", unsupported_ledger_response: "The provider ledger response was not accepted", unsupported_ledger_pagination: "Provider pagination was not accepted", ledger_read_failed: "The ledger read failed", provider_read_deferred: "Provider reads are deferred by the shared account budget", provider_read_stale: "The provider read was fenced after account state changed", provider_rate_limited: "Provider reads are rate limited; the shared backoff applies", unknown_error: "Unknown error category" };
/** A UI eligibility hint only. The backend revalidates the lease, binding and exact state atomically. */
export function retryAdvice(ledger: Ledger, canManage: boolean): { allowed: boolean; reason: string | null } {
  if (!canManage) return { allowed: false, reason: "Your team access is read-only." };
  if (ledger.leaseActive) return { allowed: false, reason: "A worker holds the scan lease. Refresh after it finishes." };
  if (ledger.status === "running") return { allowed: false, reason: "The scan is waiting for its next page, provider backoff, or worker recovery. Next poll: " + (ledger.nextPollAt ?? "not recorded") + ". Refresh status; a retry does not bypass the worker schedule." };
  if (ledger.status !== "held") return { allowed: false, reason: ledger.status === "not_started" ? "No held scan exists. Refresh status and inspect available evidence." : "This scan is not held. Refresh status or inspect available evidence." };
  if (!ledger.connectionCurrent) return { allowed: false, reason: "The scan does not match the current usable connection. Review the connection first." };
  if (ledger.scanFingerprint === null || ledger.connectionRevision === null || ledger.connectionRevision >= 2 ** 31 - 1) return { allowed: false, reason: "Current scan and connection revision evidence is unavailable." };
  return { allowed: true, reason: null };
}
