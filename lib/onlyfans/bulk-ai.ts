import type { OnlyFansDataSource } from "../onlyfans-preview/data-source";
import type { OfAccount, PreviewViewer, ConversationSummary } from "../onlyfans-preview/types";
import { BULK_LIMIT, parseBulkAck, type BulkRequest } from "./bulk-controls";

export type BulkProgress = { phase: "discovering" | "updating"; discovered: number; checked: number;
  enabled: number; disabled: number; alreadyOn: number; alreadyOff: number; protected: number;
  reasons: Record<string, number> };
export type BulkOptions = {
  account: OfAccount; viewer: PreviewViewer; source: OnlyFansDataSource;
  cancelled: () => boolean; progress: (value: BulkProgress) => void;
  submitBatch: (request: BulkRequest) => Promise<unknown>;
};

/** Freeze the discovered list, then use bounded, revision-checked server batches. */
export async function changeExistingFanChats(options: BulkOptions, enabled: boolean): Promise<BulkProgress> {
  const { account, viewer, source, cancelled, progress, submitBatch } = options;
  if (!viewer.canManage || source.kind !== "live") throw Error("This session cannot change AI replies.");
  const result: BulkProgress = { phase: "discovering", discovered: 0, checked: 0, enabled: 0, disabled: 0,
    alreadyOn: 0, alreadyOff: 0, protected: 0, reasons: {} };
  const report = () => progress({ ...result, reasons: { ...result.reasons } });
  const stopped = () => { if (cancelled()) throw Error("Stopped. Confirmed changes remain saved. Refresh to check the current state."); };
  const seen = new Set<string>(), cursors = new Set<string>(), candidates: ConversationSummary[] = [];
  let cursor: string | null = null;
  report();
  do {
    stopped();
    const page = await source.listConversations(account.accountId, cursor, !enabled);
    if (page.status === "empty") break;
    if (page.status !== "ready" && page.status !== "stale") throw Error("Could not read all chats. No batch was started. Refresh and try again.");
    for (const summary of page.data.items) {
      if (summary.accountId !== account.accountId) throw Error("The chat list changed account. Refresh before continuing.");
      if (!seen.has(summary.conversationId)) { seen.add(summary.conversationId); candidates.push(summary); }
    }
    result.discovered = candidates.length; report();
    cursor = page.data.nextCursor;
    if (cursor && (cursors.has(cursor) || cursors.size >= 1000)) throw Error("Chat pagination could not finish. No batch was started.");
    if (cursor) cursors.add(cursor);
  } while (cursor);
  const action = enabled ? "resume_automation" : "pause_automation";
  const targets: ConversationSummary[] = [];
  for (const row of candidates) {
    if (row.takeoverState === "none" && row.automationMode === (enabled ? "automated" : "paused")) {
      if (enabled) result.alreadyOn++; else result.alreadyOff++;
      result.checked++;
    } else if (row.takeoverState !== "none" || row.automationMode !== (enabled ? "paused" : "automated")) {
      result.protected++; result.checked++;
      const reason = row.automationMode === "no_contact" ? "contact_blocked" : "human_control";
      result.reasons[reason] = (result.reasons[reason] ?? 0) + 1;
    } else targets.push(row);
  }
  result.phase = "updating"; report();
  for (let offset = 0; offset < targets.length; offset += BULK_LIMIT) {
    stopped();
    const items = targets.slice(offset, offset + BULK_LIMIT).map(row => ({
      conversationId: row.conversationId, expectedRevision: row.revision,
    }));
    const request: BulkRequest = { action, items };
    const ack = parseBulkAck(await submitBatch(request), { ...request, accountId: account.accountId });
    if (!ack) throw Error("This batch was not fully confirmed. Some changes may be saved. Refresh before continuing.");
    for (const item of ack.results) {
      result.checked++;
      if (item.outcome === "recorded") { if (enabled) result.enabled++; else result.disabled++; }
      else { result.protected++; result.reasons[item.reason] = (result.reasons[item.reason] ?? 0) + 1; }
    }
    report();
  }
  return result;
}
export const enableExistingFanChats = (options: BulkOptions) => changeExistingFanChats(options, true);
export const disableExistingFanChats = (options: BulkOptions) => changeExistingFanChats(options, false);
