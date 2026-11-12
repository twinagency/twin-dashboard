/** Browser transport for the validated, current-binding native memory BFF. */
import { B_CONTRACT_SCHEMA, bFetch, bId, type BReply } from "../b-common";
import { decimalId, hash, memoryField, object, parseCorrectionAck, parseMemoryFanPage, parseMemoryProgress, parseNativeMemory, parseRecoveryProgress,
  type MemoryFanPage, type MemoryField, type MemoryProgress, type NativeMemory, type RecoveryProgress } from "../native";

const enc = encodeURIComponent;
const accountBase = (accountId: string) => `/api/onlyfans-launch/memory/accounts/${enc(accountId)}`;
const fanBase = (accountId: string, fanId: string) => `${accountBase(accountId)}/fans/${enc(fanId)}`;
export type MemoryCoveragePage = MemoryFanPage & { progress: RecoveryProgress };
export type FanMemoryView = { fanId: string; memory: NativeMemory; progress: MemoryProgress; recovery: RecoveryProgress };
export type MemoryCorrection = { field: MemoryField; operation: "set" | "clear"; value: string | null; expectedVersion: string; reason: string };
export type CorrectionAck = { revision: number; replayed: boolean };
/** Mirrors native history-memory extraction.validate_value, rather than a generic text limit. */
export const MEMORY_FIELD_LIMITS: Record<MemoryField, number> = { real_name: 40, his_age: 80, home_city: 80, home_country: 80, hobbies: 80, occupation: 80, fetishes: 80, short_bio: 400, bullet_points: 600 };
export function memoryValueError(field: MemoryField, value: string): string | null {
  if (!value.trim()) return "Enter a value, or clear the field.";
  if (value !== value.trim()) return "Remove leading and trailing spaces.";
  if ([...value].length > MEMORY_FIELD_LIMITS[field]) return `Keep this value within ${MEMORY_FIELD_LIMITS[field]} characters.`;
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) return "Remove control characters.";
  if (field === "his_age" && (!/^[0-9]+$/.test(value) || Number(value) < 18 || Number(value) > 120)) return "Age must be a number from 18 to 120.";
  return null;
}

function shaped<T>(reply: BReply<unknown>, parse: (v: unknown) => T | null): BReply<T> {
  if (reply.kind !== "ok") return reply as BReply<T>;
  const parsed = parse(reply.data);
  return parsed ? { kind: "ok", data: parsed } : { kind: "unavailable", error: "The memory response could not be verified. Refresh before using it." };
}
export function parseMemoryPageEnvelope(v: unknown, accountId: string): MemoryCoveragePage | null {
  if (!object(v) || v.schemaVersion !== B_CONTRACT_SCHEMA || v.ok !== true || v.accountId !== accountId) return null;
  const page = parseMemoryFanPage(v), progress = parseRecoveryProgress(v.progress, accountId, null, true);
  return page && progress && new Set(page.fans.map(f => f.fanId)).size === page.fans.length ? { ...page, progress } : null;
}
export function parseMemoryEnvelope(v: unknown, accountId: string, fanId: string): FanMemoryView | null {
  if (!object(v) || v.schemaVersion !== B_CONTRACT_SCHEMA || v.ok !== true || v.accountId !== accountId || v.fanId !== fanId) return null;
  const memory = parseNativeMemory(v.memory), progress = parseMemoryProgress(v.progress), recovery = parseRecoveryProgress(v.recovery, accountId, fanId, true);
  return memory && progress && recovery ? { fanId, memory, progress, recovery } : null;
}
export async function readCoverage(accountId: string, signal?: AbortSignal, cursor?: string): Promise<BReply<MemoryCoveragePage>> {
  const q = new URLSearchParams({ limit: "50" });
  if (cursor !== undefined) q.set("cursor", cursor);
  return shaped(await bFetch(`${accountBase(accountId)}/fans?${q}`, { signal }), v => parseMemoryPageEnvelope(v, accountId));
}
export async function readFanMemory(accountId: string, fanId: string, signal?: AbortSignal, query = ""): Promise<BReply<FanMemoryView>> {
  const q = query ? `?${new URLSearchParams({ query })}` : "";
  return shaped(await bFetch(`${fanBase(accountId, fanId)}${q}`, { signal }), v => parseMemoryEnvelope(v, accountId, fanId));
}
/** An identical payload derives the same server command identity, including after a lost acknowledgement. */
export async function correctFact(accountId: string, fanId: string, correction: MemoryCorrection, signal?: AbortSignal): Promise<BReply<CorrectionAck>> {
  if (!bId(accountId) || !decimalId(fanId) || !memoryField(correction.field) || !hash(correction.expectedVersion) ||
    !correction.reason.trim() || correction.reason.length > 512 || !["set", "clear"].includes(correction.operation) ||
    (correction.operation === "clear" ? correction.value !== null : typeof correction.value !== "string" || memoryValueError(correction.field, correction.value) !== null))
    return { kind: "refused", status: 400, error: "Choose a supported field, a value or clear operation, and a reason." };
  const r = await bFetch(fanBase(accountId, fanId), { method: "PATCH", body: correction, signal });
  if (r.kind !== "ok") return r as BReply<CorrectionAck>;
  const v = r.data;
  const ack = object(v) && v.schemaVersion === B_CONTRACT_SCHEMA && v.ok === true && v.accountId === accountId && v.fanId === fanId ? parseCorrectionAck(v.correction) : null;
  return ack ? { kind: "ok", data: ack } :
    { kind: "unconfirmed", error: "The correction acknowledgement did not match. Read current memory or retry the identical correction." };
}
/** This acknowledges scheduling only. Progress must be read separately. */
export async function resumeHistory(accountId: string, fanId?: string, signal?: AbortSignal): Promise<BReply<{ requested: "account" | "fan" }>> {
  const expected = fanId === undefined ? "account" : "fan";
  const r = await bFetch(`${fanId === undefined ? accountBase(accountId) : fanBase(accountId, fanId)}/backfill`, { method: "POST", body: {}, signal });
  if (r.kind !== "ok") return r as BReply<{ requested: "account" | "fan" }>;
  const v = r.data;
  return object(v) && v.schemaVersion === B_CONTRACT_SCHEMA && v.ok === true && v.accountId === accountId && v.requested === expected ? { kind: "ok", data: { requested: expected } } :
    { kind: "unconfirmed", error: "The recovery scheduling acknowledgement did not match. Read current progress." };
}
