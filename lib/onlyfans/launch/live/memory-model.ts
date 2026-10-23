/** History recovery progress, per-fan memory and operator corrections against /history-memory (configuration purpose).
 * Counts are observed coverage only: the backend states it has no provider total, so no percentage is invented. */
import { rec, FAN_ID, ID, type Rec } from "./shared";

export const FACT_FIELDS = ["real_name", "his_age", "home_city", "home_country", "hobbies", "occupation", "fetishes"] as const;
export const PROFILE_FIELDS = { short_bio: 400, bullet_points: 600 } as const;
export const ALL_FIELDS = [...FACT_FIELDS, ...Object.keys(PROFILE_FIELDS)] as string[];
export const FIELD_LABEL: Record<string, string> = { real_name: "Name", his_age: "Age", home_city: "City", home_country: "Country", hobbies: "Hobbies",
  occupation: "Occupation", fetishes: "Interests", short_bio: "Short bio", bullet_points: "Key points" };
export const limitFor = (field: string) => field in PROFILE_FIELDS ? PROFILE_FIELDS[field as keyof typeof PROFILE_FIELDS] : field === "real_name" ? 40 : 80;

const int = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0;
const text = (v: unknown, max: number) => typeof v === "string" && v.length <= max;
const textOrNull = (v: unknown, max: number) => v === null || text(v, max);

export type Recovery = { status: "complete" | "incomplete"; discoveryComplete: boolean; discoveryLastError: string | null; conversationsDiscovered: number;
  conversationsComplete: number; conversationsRetrying: number; conversationsDeferredForLiveInput: number; pagesCommitted: number; messagesObserved: number;
  messagesAdded: number; recentRecoveryNeeded: boolean; fanId: string | null; oldestMessageAt: string | null };
export function parseRecovery(v: unknown, accountId: string, fanId: string | null): Recovery | null {
  if (!rec(v) || v.schemaVersion !== "of-history-recovery.v1" || v.accountId !== accountId || (v.fanId ?? null) !== fanId || !["complete", "incomplete"].includes(v.status as string) ||
    typeof v.discoveryComplete !== "boolean" || !textOrNull(v.discoveryLastError ?? null, 64) || typeof v.recentRecoveryNeeded !== "boolean" ||
    !["conversationsDiscovered", "conversationsComplete", "conversationsRetrying", "conversationsDeferredForLiveInput", "pagesCommitted", "messagesObserved", "messagesAdded"].every(k => int(v[k])) ||
    (v.conversationsComplete as number) > (v.conversationsDiscovered as number)) return null;
  return { status: v.status as Recovery["status"], discoveryComplete: v.discoveryComplete, discoveryLastError: (v.discoveryLastError as string | null) ?? null,
    conversationsDiscovered: v.conversationsDiscovered as number, conversationsComplete: v.conversationsComplete as number, conversationsRetrying: v.conversationsRetrying as number,
    conversationsDeferredForLiveInput: v.conversationsDeferredForLiveInput as number, pagesCommitted: v.pagesCommitted as number, messagesObserved: v.messagesObserved as number,
    messagesAdded: v.messagesAdded as number, recentRecoveryNeeded: v.recentRecoveryNeeded, fanId, oldestMessageAt: (v.oldestMessageAt as string | null | undefined) ?? null };
}
export type MemoryProgress = { storedMessages: number; processedCurrentMessages: number; pendingMessages: number; storedMemoryComplete: boolean; revision: number;
  oldestStoredAt: string | null; newestStoredAt: string | null; lastProcessedAt: string | null };
export function parseMemoryProgress(v: unknown): MemoryProgress | null {
  if (!rec(v) || v.schemaVersion !== "of-history-memory-progress.v1" || !["storedMessages", "processedCurrentMessages", "pendingMessages", "revision"].every(k => int(v[k])) ||
    typeof v.storedMemoryComplete !== "boolean" || !["oldestStoredAt", "newestStoredAt", "lastProcessedAt"].every(k => textOrNull(v[k], 40)) ||
    (v.processedCurrentMessages as number) + (v.pendingMessages as number) !== v.storedMessages) return null;
  return v as unknown as MemoryProgress;
}
export type Fact = { field: string; value: string; source: "canonical" | "operator" | "history"; quote: string | null; sourceAt: string | null };
export type FanMemory = { version: string; revision: number; facts: Fact[]; summaries: Record<string, string | null>; interactions: { sourceAt: string; direction: string; excerpt: string }[] };
export function parseFanMemory(v: unknown): FanMemory | null {
  if (!rec(v) || v.schemaVersion !== "of-history-memory.v1" || typeof v.version !== "string" || !/^[a-f0-9]{64}$/.test(v.version) || !int(v.revision) || !rec(v.facts) || !rec(v.summaries) || !Array.isArray(v.interactions) || v.interactions.length > 8) return null;
  const facts: Fact[] = [];
  for (const [field, f] of Object.entries(v.facts)) {
    if (!(FACT_FIELDS as readonly string[]).includes(field) || !rec(f) || !text(f.value, 200) || !["canonical", "operator", "history"].includes(f.source as string) || !textOrNull(f.quote ?? null, 400) || !textOrNull(f.sourceAt ?? null, 40)) return null;
    facts.push({ field, value: f.value as string, source: f.source as Fact["source"], quote: (f.quote as string | undefined) ?? null, sourceAt: (f.sourceAt as string | undefined) ?? null });
  }
  const summaries: Record<string, string | null> = {};
  for (const [k, s] of Object.entries(v.summaries)) { if (!(k in PROFILE_FIELDS) || !textOrNull(s, 700)) return null; summaries[k] = s as string | null; }
  const interactions = [];
  for (const i of v.interactions) { if (!rec(i) || !text(i.sourceAt, 40) || !["in", "out"].includes(i.direction as string) || !text(i.excerpt, 400)) return null; interactions.push({ sourceAt: i.sourceAt as string, direction: i.direction as string, excerpt: i.excerpt as string }); }
  return { version: v.version, revision: v.revision as number, facts, summaries, interactions };
}

const REASON = /^[^\u0000-\u0008\u000B\u000C\u000E-\u001F]{1,512}$/;
export type Correction = { field: string; operation: "set" | "clear"; value: string | null; expectedVersion: string; reason?: string };
export function validCorrection(v: unknown): v is Correction {
  if (!rec(v) || Object.keys(v).some(k => !["field", "operation", "value", "expectedVersion", "reason"].includes(k)) || typeof v.field !== "string" || !ALL_FIELDS.includes(v.field) ||
    typeof v.expectedVersion !== "string" || !/^[a-f0-9]{64}$/.test(v.expectedVersion) || (v.reason !== undefined && !(typeof v.reason === "string" && REASON.test(v.reason)))) return false;
  if (v.operation === "clear") return v.value === null;
  if (v.operation !== "set" || typeof v.value !== "string" || !v.value.trim() || v.value !== v.value.trim() || v.value.length > limitFor(v.field) || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(v.value)) return false;
  return v.field !== "his_age" || (/^[0-9]{1,3}$/.test(v.value) && +v.value >= 18 && +v.value <= 120);
}
