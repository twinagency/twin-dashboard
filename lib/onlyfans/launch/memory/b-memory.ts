/** Section D. Browser-side shapes for the memory BFF (history recovery progress, fan memory, corrections). Every answer comes from a delivered backend route. */
import { rec } from "../live/shared";
import { FACT_FIELDS, PROFILE_FIELDS, limitFor, validCorrection, type Correction, type Fact, type FanMemory, type MemoryProgress, type Recovery } from "../live/memory-model";
export { FACT_FIELDS, PROFILE_FIELDS, limitFor, validCorrection, FIELD_LABEL } from "../live/memory-model";
export type { Fact, FanMemory, MemoryProgress, Recovery, Correction };

export const FACT_SOURCE_TEXT: Record<Fact["source"], string> = { canonical: "Saved on the fan record", operator: "Corrected by an operator", history: "Found in chat history (quoted below)" };
const int = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0;
const nstr = (v: unknown) => v === null || typeof v === "string";

export type FanReply = { fanId: string; recovery: Recovery; progress: MemoryProgress; memory: FanMemory };
/** The BFF already validated the backend answer; the browser re-checks the shape it relies on and the account/fan it belongs to. */
export function parseRecoveryReply(value: unknown, accountId: string): Recovery | null {
  const d = rec(value) && value.accountId === accountId && rec(value.data) ? value.data.recovery : null;
  return isRecovery(d, null) ? d : null;
}
function isRecovery(d: unknown, fanId: string | null): d is Recovery {
  return rec(d) && ["complete", "incomplete"].includes(d.status as string) && typeof d.discoveryComplete === "boolean" && typeof d.recentRecoveryNeeded === "boolean" &&
    ["conversationsDiscovered", "conversationsComplete", "conversationsRetrying", "conversationsDeferredForLiveInput", "pagesCommitted", "messagesObserved", "messagesAdded"].every(k => int(d[k])) && (d.fanId ?? null) === fanId;
}
export function parseFanReply(value: unknown, accountId: string, fanId: string): FanReply | null {
  const d = rec(value) && value.accountId === accountId && rec(value.data) ? value.data : null;
  if (!d || d.fanId !== fanId || !isRecovery(d.recovery, fanId) || !rec(d.progress) || !["storedMessages", "processedCurrentMessages", "pendingMessages", "revision"].every(k => int((d.progress as Record<string, unknown>)[k])) ||
    typeof (d.progress as Record<string, unknown>).storedMemoryComplete !== "boolean" || !rec(d.memory) || typeof d.memory.version !== "string" || !/^[a-f0-9]{64}$/.test(d.memory.version) ||
    !Array.isArray(d.memory.facts) || !rec(d.memory.summaries) || !Array.isArray(d.memory.interactions)) return null;
  return d as unknown as FanReply;
}
/** Fan id carried by a conversation id. A conversation of another account is never a fan of this one. */
export function fanOfConversation(accountId: string, conversationId: string): string | null {
  const prefix = `${accountId}:`;
  return conversationId.startsWith(prefix) && /^[1-9][0-9]{0,17}$/.test(conversationId.slice(prefix.length)) ? conversationId.slice(prefix.length) : null;
}
/** Human text for recovery. Counts are observed coverage; the provider reports no total, so there is no percentage. */
export function recoveryLines(r: Recovery): string[] {
  const out = [r.status === "complete" ? "All discovered conversations are recovered." : "Recovery is not complete.",
    `${r.conversationsComplete} of ${r.conversationsDiscovered} discovered conversations complete`,
    `${r.messagesObserved} messages read, ${r.messagesAdded} new, over ${r.pagesCommitted} pages`];
  if (!r.discoveryComplete) out.push("Conversation discovery is still running, so more conversations may exist.");
  if (r.conversationsRetrying) out.push(`${r.conversationsRetrying} retrying after an error`);
  if (r.conversationsDeferredForLiveInput) out.push(`${r.conversationsDeferredForLiveInput} waiting for live messages first`);
  if (r.recentRecoveryNeeded) out.push("Recent messages still need recovery.");
  return out;
}
export const nonEmpty = (v: string | null | undefined) => typeof v === "string" && v.length > 0;
export const stringOrNull = nstr;
export { FACT_FIELDS as MEMORY_FACT_FIELDS };
