import type { ConversationSummary } from "../onlyfans-preview/types";

export function threadNeedsRefresh(row: ConversationSummary, open: ConversationSummary): boolean {
  if (row.accountId !== open.accountId || row.conversationId !== open.conversationId) return false;
  if (row.revision > open.revision) return true;
  if (Date.parse(row.lastActivityAt) > Date.parse(open.lastActivityAt)) return true;
  return !!row.lastMessageId && !!open.lastMessageId && /^\d+$/.test(row.lastMessageId) &&
    /^\d+$/.test(open.lastMessageId) && BigInt(row.lastMessageId) > BigInt(open.lastMessageId);
}

/** Control revisions cannot replace a newer list preview with an older thread. */
export function mergeListControl(row: ConversationSummary, open: ConversationSummary | null): ConversationSummary {
  if (!open || row.accountId !== open.accountId || row.conversationId !== open.conversationId || open.revision < row.revision) return row;
  return { ...row, revision: open.revision, automationMode: open.automationMode, takeoverState: open.takeoverState };
}
