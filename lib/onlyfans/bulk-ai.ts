import { availableActions, createCommandRequest } from "../onlyfans-preview/actions";
import type { OnlyFansDataSource } from "../onlyfans-preview/data-source";
import type { OfAccount, PreviewViewer, ConversationSummary } from "../onlyfans-preview/types";

export type BulkProgress = { checked: number; enabled: number; alreadyOn: number; protected: number };

/** Uses existing revision-checked commands. Never guesses that an uncertain write failed. `stopHold` (stop-hold.ts stopHoldReason) is read
 *  before every chat: an unconfirmed STOP on the account stops the rollout there, and nothing more is resumed. */
export async function enableExistingFanChats(options: {
  account: OfAccount; viewer: PreviewViewer; source: OnlyFansDataSource;
  cancelled: () => boolean; progress: (value: BulkProgress) => void; stopHold: () => string | null;
}): Promise<BulkProgress> {
  const { account, viewer, source, cancelled, progress, stopHold } = options;
  if (!viewer.canManage || source.kind !== "live") throw Error("This session cannot enable chats.");
  const result: BulkProgress = { checked: 0, enabled: 0, alreadyOn: 0, protected: 0 };
  const seen = new Set<string>(), cursors = new Set<string>();
  const candidates: ConversationSummary[] = [];
  let cursor: string | null = null;
  // Finish discovering the stored chats before writing; a failed page is not a complete rollout.
  do {
    if (cancelled()) throw Error("Stopped. Changes already recorded remain in place.");
    const page = await source.listConversations(account.accountId, cursor, false);
    if (page.status === "empty") break;
    if (page.status !== "ready" && page.status !== "stale") throw Error("Could not read all chats. Refresh and try again.");
    for (const summary of page.data.items) {
      if (summary.accountId !== account.accountId) throw Error("The chat list changed account. Refresh before continuing.");
      if (!seen.has(summary.conversationId)) { seen.add(summary.conversationId); candidates.push(summary); }
    }
    cursor = page.data.nextCursor;
    if (cursor && (cursors.has(cursor) || cursors.size >= 1000)) throw Error("Chat pagination could not finish. Refresh before continuing.");
    if (cursor) cursors.add(cursor);
  } while (cursor);
  for (const summary of candidates) {
    if (cancelled()) throw Error("Stopped. Changes already recorded remain in place.");
    const held = stopHold();
    if (held) throw Error(held);
    result.checked++;
    if (summary.automationMode === "automated" && summary.takeoverState === "none") result.alreadyOn++;
    else if (summary.revision !== 0 || summary.automationMode !== "paused" || summary.takeoverState !== "none") result.protected++;
    else {
      const read = await source.getConversation(account.accountId, summary.conversationId);
      if (read.status !== "ready" && read.status !== "stale") throw Error("A chat could not be checked. Refresh before continuing.");
      const detail = read.data, current = detail.summary;
      if (detail.accountId !== account.accountId || detail.conversationId !== summary.conversationId ||
          current.accountId !== account.accountId || current.conversationId !== summary.conversationId) throw Error("A chat changed account. Refresh before continuing.");
      const actions = availableActions({ account, summary: current, viewer, deliveryIncident: detail.deliveryIncident, goHold: stopHold() });
      if (current.revision !== 0 || !actions.available.some(a => a.action === "resume_automation")) result.protected++;
      else {
        if (cancelled()) throw Error("Stopped. Changes already recorded remain in place.");
        const response = await source.submitCommand(createCommandRequest({ command: "resume_automation", accountId: account.accountId,
          conversationId: current.conversationId, expectedRevision: current.revision, payload: { kind: "none" } }));
        if (response.simulated || !response.applied || response.outcome !== "recorded")
          throw Error("A chat change was not confirmed. Stopped here. Refresh the inbox before trying again.");
        result.enabled++;
      }
    }
    progress({ ...result });
  }
  return result;
}
