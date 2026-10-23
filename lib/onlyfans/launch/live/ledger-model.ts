/** Ledger status, investigation signals and the durable retry (contract of-ledger.v1).
 * A retry only queues the existing scan: it is never shown as reconciled, and it never contacts the provider. */
import { rec, FAN_ID, ID, type Rec } from "./shared";

export const LEDGER_SCHEMA = "of-ledger.v1";
export const LEDGER_STATUS = ["not_started", "idle", "running", "held"] as const;
export const LEDGER_ERRORS = ["connection_unavailable", "connection_changed", "unsupported_ledger_response", "unsupported_ledger_pagination", "ledger_read_failed", "unknown_error"] as const;
export type Ledger = { status: typeof LEDGER_STATUS[number]; windowStart: string | null; windowEnd: string | null; pageOffset: number | null;
  lastCompleteAt: string | null; lastFullAt: string | null; nextPollAt: string | null; lastError: typeof LEDGER_ERRORS[number] | null;
  leaseActive: boolean; connectionCurrent: boolean; connectionRevision: number | null; conflictCount: number; unlinkedPaidCount: number;
  requiresInvestigation: boolean; commerceHeld: boolean; scanFingerprint: string | null };
const stamp = (v: unknown) => v === null || (typeof v === "string" && Number.isFinite(Date.parse(v)));
const count = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0;

export function parseLedger(v: unknown, accountId: string): Ledger | null {
  if (!rec(v) || v.schemaVersion !== LEDGER_SCHEMA || v.accountId !== accountId || !(LEDGER_STATUS as readonly unknown[]).includes(v.status) ||
    !["windowStart", "windowEnd", "lastCompleteAt", "lastFullAt", "nextPollAt"].every(k => stamp(v[k])) ||
    !(v.pageOffset === null || count(v.pageOffset)) || !(v.lastError === null || (LEDGER_ERRORS as readonly unknown[]).includes(v.lastError)) ||
    !["leaseActive", "connectionCurrent", "requiresInvestigation", "commerceHeld"].every(k => typeof v[k] === "boolean") ||
    !(v.connectionRevision === null || count(v.connectionRevision)) || !count(v.conflictCount) || !count(v.unlinkedPaidCount) ||
    !(v.scanFingerprint === null || (typeof v.scanFingerprint === "string" && /^[a-f0-9]{64}$/.test(v.scanFingerprint)))) return null;
  // not_started has no scan, so it cannot carry scan facts, and a fingerprint implies a scan.
  if ((v.status === "not_started") !== (v.scanFingerprint === null)) return null;
  return v as unknown as Ledger;
}

export const LEDGER_STATUS_TEXT: Record<Ledger["status"], string> = { not_started: "Not started", idle: "Between passes", running: "Scan running", held: "HELD, needs attention" };
export const LEDGER_ERROR_TEXT: Record<NonNullable<Ledger["lastError"]>, string> = {
  connection_unavailable: "The connection was unavailable", connection_changed: "The connection changed during the scan", unsupported_ledger_response: "The provider ledger answer was not accepted",
  unsupported_ledger_pagination: "The provider paging was not accepted", ledger_read_failed: "The ledger read failed (transient)", unknown_error: "Unknown error code" };
/** Retry is offered only for a held, idle scan on the current connection, and only to managers. */
export function retryAdvice(l: Ledger, canManage: boolean): { allowed: boolean; reason: string | null } {
  if (!canManage) return { allowed: false, reason: "Your team access is read-only." };
  if (l.status !== "held") return { allowed: false, reason: l.status === "running" ? "A scan is running." : "Only a held scan can be retried." };
  if (l.leaseActive) return { allowed: false, reason: "A scan is running." };
  if (!l.connectionCurrent) return { allowed: false, reason: "The connection changed. Wait for the worker to restart the scan." };
  if (l.scanFingerprint === null || l.connectionRevision === null) return { allowed: false, reason: "No scan state to retry." };
  return { allowed: true, reason: null };
}
