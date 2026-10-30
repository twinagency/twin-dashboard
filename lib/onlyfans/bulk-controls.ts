import { CONTROL_SCHEMA } from "./controls";

export const BULK_LIMIT = 50;
export type BulkAction = "resume_automation" | "pause_automation";
export type BulkItem = { conversationId: string; expectedRevision: number };
export type BulkRequest = { action: BulkAction; items: BulkItem[] };
export const BULK_REASONS: Record<string, string> = {
  human_control: "Handled by a person", human_review: "Needs individual review",
  contact_blocked: "Contact restricted or muted", revision_changed: "Changed during this update",
  delivery_unresolved: "Earlier delivery unresolved", state_changed: "Reply control changed",
  conversation_unavailable: "Conversation unavailable",
};
export type BulkResult = { conversationId: string } & (
  { outcome: "recorded"; recordedRevision: number } | { outcome: "skipped"; reason: string });
export type BulkAck = { schemaVersion: typeof CONTROL_SCHEMA; ok: true; accountId: string;
  action: BulkAction; commandKey: string; results: BulkResult[] };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export function validBulkRequest(v: unknown): v is BulkRequest {
  if (!object(v) || Object.keys(v).sort().join(",") !== "action,items" ||
      typeof v.action !== "string" || !["resume_automation", "pause_automation"].includes(v.action) || !Array.isArray(v.items) ||
      v.items.length < 1 || v.items.length > BULK_LIMIT) return false;
  const seen = new Set<string>();
  return v.items.every(item => {
    if (!object(item) || Object.keys(item).sort().join(",") !== "conversationId,expectedRevision" ||
        typeof item.conversationId !== "string" || !/^[A-Za-z0-9._:-]{1,64}$/.test(item.conversationId) ||
        !Number.isInteger(item.expectedRevision) || Number(item.expectedRevision) < 0 || Number(item.expectedRevision) >= 2 ** 31 - 1 ||
        seen.has(item.conversationId)) return false;
    seen.add(item.conversationId); return true;
  });
}
export function parseBulkAck(v: unknown, expected: BulkRequest & { accountId: string; commandKey?: string }): BulkAck | null {
  if (!object(v) || Object.keys(v).sort().join(",") !== "accountId,action,commandKey,ok,results,schemaVersion" ||
      v.schemaVersion !== CONTROL_SCHEMA || v.ok !== true || v.accountId !== expected.accountId || v.action !== expected.action ||
      typeof v.commandKey !== "string" || !/^[a-f0-9]{64}$/.test(v.commandKey) ||
      expected.commandKey !== undefined && v.commandKey !== expected.commandKey ||
      !Array.isArray(v.results) || v.results.length !== expected.items.length) return null;
  for (let i = 0; i < v.results.length; i++) {
    const item = v.results[i], original = expected.items[i];
    if (!object(item) || item.conversationId !== original.conversationId) return null;
    if (item.outcome === "recorded") {
      if (Object.keys(item).sort().join(",") !== "conversationId,outcome,recordedRevision" || item.recordedRevision !== original.expectedRevision + 1) return null;
    } else if (item.outcome === "skipped") {
      if (Object.keys(item).sort().join(",") !== "conversationId,outcome,reason" || typeof item.reason !== "string" || !Object.hasOwn(BULK_REASONS, item.reason)) return null;
    } else return null;
  }
  return v as BulkAck;
}
