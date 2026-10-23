/** Browser reads/writes for section E. Every call takes an AbortSignal so a superseded request is dropped as "stale". */
import { bFetch, type BReply } from "../b-common";
import { parseControlAck, type ControlAction } from "@/lib/onlyfans/controls";
import { parseAccounts, parseConversations, parseRuntime, type BAccount, type BConversation, type BRuntime } from "./b-automation";
import { parseEngagementReply, type EngagementView } from "./b-engagement";

const enc = encodeURIComponent;
function shaped<T>(reply: BReply<unknown>, parse: (v: unknown) => T | null): BReply<T> {
  if (reply.kind !== "ok") return reply as BReply<T>;
  const parsed = parse(reply.data);
  return parsed ? { kind: "ok", data: parsed } : { kind: "unavailable", error: "The response was not in the expected shape, so nothing is shown." };
}
export const readAccounts = async (signal?: AbortSignal): Promise<BReply<BAccount[]>> =>
  shaped(await bFetch("/api/onlyfans/accounts", { signal }), parseAccounts);
export const readConversations = async (accountId: string, cursor: string | null = null, signal?: AbortSignal): Promise<BReply<{ items: BConversation[]; more: boolean; cursor: string | null }>> =>
  shaped(await bFetch(`/api/onlyfans/accounts/${enc(accountId)}/conversations${cursor ? `?cursor=${enc(cursor)}` : ""}`, { signal }), v => parseConversations(v, accountId));
export const readRuntime = async (accountId: string, signal?: AbortSignal): Promise<BReply<BRuntime>> =>
  shaped(await bFetch(`/api/onlyfans/accounts/${enc(accountId)}/workspace/settings`, { signal }), v => parseRuntime(v, accountId));
export const readEngagement = async (accountId: string, signal?: AbortSignal): Promise<BReply<EngagementView>> =>
  shaped(await bFetch(`/api/onlyfans-launch/automation/accounts/${enc(accountId)}/follow-ups`, { signal }), v => parseEngagementReply(v, accountId));

/** The ack proves a recorded event, not current state; callers must re-read the conversation. */
export async function sendControl(accountId: string, conversationId: string, action: Exclude<ControlAction, "manual_message">, expectedRevision: number, signal?: AbortSignal): Promise<BReply<{ recordedRevision: number }>> {
  const reply = await bFetch(`/api/onlyfans-controls/accounts/${enc(accountId)}/conversations/${enc(conversationId)}`, { method: "POST", body: { action, expectedRevision }, signal });
  if (reply.kind !== "ok") return reply as BReply<{ recordedRevision: number }>;
  const ack = parseControlAck(reply.data, { accountId, conversationId, action, expectedRevision });
  return ack ? { kind: "ok", data: { recordedRevision: ack.recordedRevision } } : { kind: "unconfirmed", error: "The acknowledgement did not match the request. Refresh before trying again." };
}
/** Success means the backend returned the recorded action. Whether it is really cancelled is in data.outcome. */
export const cancelAction = async (accountId: string, actionId: string, signal?: AbortSignal) =>
  bFetch(`/api/onlyfans-launch/automation/accounts/${enc(accountId)}/follow-ups`, { method: "POST", body: { actionId }, signal });
/** scope "engagement" stops proactive messages; "account" pauses the connection (operator only). Success only when data.outcome is "recorded". */
export const stopAutomation = async (accountId: string, scope: "engagement" | "account", signal?: AbortSignal) =>
  bFetch(`/api/onlyfans-launch/automation/accounts/${enc(accountId)}/emergency-stop`, { method: "POST", body: { scope }, signal });
