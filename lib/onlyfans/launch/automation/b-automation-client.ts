/** Browser reads/writes for section E. Every call takes an AbortSignal so a superseded request is dropped as "stale". */
import { bFetch, type BReply } from "../b-common";
import { parseControlAck, type ControlAction } from "@/lib/onlyfans/controls";
import { parseAccounts, parseConversations, parseRuntime, type BAccount, type BConversation, type BRuntime } from "./b-automation";
import { parseFollowUps, type BFollowUp } from "./b-follow-ups";
import { hash, object, parseEngagementAction, parseNativeReadiness } from "../native";

const enc = encodeURIComponent;
function shaped<T>(reply: BReply<unknown>, parse: (v: unknown) => T | null): BReply<T> {
  if (reply.kind !== "ok") return reply as BReply<T>;
  const parsed = parse(reply.data);
  return parsed ? { kind: "ok", data: parsed } : { kind: "unavailable", error: "The response was not in the expected shape, so nothing is shown." };
}
export const readAccounts = async (signal?: AbortSignal): Promise<BReply<BAccount[]>> =>
  shaped(await bFetch("/api/onlyfans/accounts", { signal }), parseAccounts);
export const readConversations = async (accountId: string, signal?: AbortSignal): Promise<BReply<{ items: BConversation[]; more: boolean }>> =>
  shaped(await bFetch(`/api/onlyfans/accounts/${enc(accountId)}/conversations`, { signal }), v => parseConversations(v, accountId));
export const readRuntime = async (accountId: string, signal?: AbortSignal): Promise<BReply<BRuntime>> =>
  shaped(await bFetch(`/api/onlyfans/accounts/${enc(accountId)}/workspace/settings`, { signal }), v => parseRuntime(v, accountId));
export const readFollowUps = async (accountId: string, signal?: AbortSignal): Promise<BReply<BFollowUp[]>> =>
  shaped(await bFetch(`/api/onlyfans-launch/automation/accounts/${enc(accountId)}/follow-ups`, { signal, readRecovery: true }), v => parseFollowUps(v, accountId));

/** The ack proves a recorded event, not current state; callers must re-read the conversation. */
export async function sendControl(accountId: string, conversationId: string, action: Exclude<ControlAction, "manual_message">, expectedRevision: number, signal?: AbortSignal): Promise<BReply<{ recordedRevision: number }>> {
  const reply = await bFetch(`/api/onlyfans-controls/accounts/${enc(accountId)}/conversations/${enc(conversationId)}`, { method: "POST", body: { action, expectedRevision }, signal });
  if (reply.kind !== "ok") return reply as BReply<{ recordedRevision: number }>;
  const ack = parseControlAck(reply.data, { accountId, conversationId, action, expectedRevision });
  return ack ? { kind: "ok", data: { recordedRevision: ack.recordedRevision } } : { kind: "unconfirmed", error: "The acknowledgement did not match the request. Refresh before trying again." };
}
export const cancelFollowUp = async (accountId: string, followUpId: string, signal?: AbortSignal) =>
  bFetch(`/api/onlyfans-launch/automation/accounts/${enc(accountId)}/follow-ups`, { method: "POST", body: { action: "cancel", actionId: followUpId }, signal });
/** Account commands require the authoritative state fingerprint and a reason. */
export const emergencyStop = async (accountId: string, expectedFingerprint: string, reason: string, signal?: AbortSignal) => {
  if (!hash(expectedFingerprint) || !reason.trim() || reason.length > 512) return { kind: "refused" as const, status: 400, error: "Refresh account state and provide a reason." };
  return bFetch(`/api/onlyfans-launch/automation/accounts/${enc(accountId)}/emergency-stop`, { method: "POST", body: { action: "emergency_stop", expectedFingerprint, reason }, signal });
};
