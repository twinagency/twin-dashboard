import { parseFanFinancials } from "./fan-financials";
import type { ConversationDetail } from "../onlyfans-preview/types";

/** Fan-specific content history built only from evidence already on the conversation detail. */
export type ContentHistoryLabel = "Purchased" | "Previously sent" | "Shared free" | "No recorded delivery" | "History incomplete";
export type FanContentHistory = { purchased: Set<string>; sent: Set<string>; free: Set<string>; complete: boolean; gaps: string[] };
type HistoryDetail = Pick<ConversationDetail, "ownedMedia" | "messages"> & Partial<Pick<ConversationDetail, "financials" | "previousCursor">>;

export function fanContentHistory(detail: HistoryDetail | null | undefined): FanContentHistory {
  const history: FanContentHistory = { purchased: new Set(), sent: new Set(), free: new Set(), complete: false, gaps: [] };
  if (!detail) { history.gaps.push("The conversation has not loaded."); return history; }
  for (const item of detail.ownedMedia) history.purchased.add(item.mediaId);
  for (const message of detail.messages) {
    if (message.direction !== "outbound" || !message.attachments) continue;
    // A price of zero is the only message-level evidence that media went out as a free share.
    const free = message.attachments.price.minorUnits === 0;
    for (const media of message.attachments.media) { history.sent.add(media.mediaId); if (free) history.free.add(media.mediaId); }
  }
  const financials = parseFanFinancials(detail.financials);
  if (!financials) history.gaps.push("Purchase coverage is unavailable.");
  else if (!financials.coverageComplete) history.gaps.push("Purchase history is only partly covered.");
  if (detail.previousCursor) history.gaps.push("Older messages are not loaded.");
  history.complete = history.gaps.length === 0;
  return history;
}

/** Positive evidence always shows. Absence is only reported as "No recorded delivery" when the history is complete. */
export function contentHistoryLabels(history: FanContentHistory, mediaId: string): ContentHistoryLabel[] {
  const labels: ContentHistoryLabel[] = [];
  if (history.purchased.has(mediaId)) labels.push("Purchased");
  if (history.sent.has(mediaId)) labels.push("Previously sent");
  if (history.free.has(mediaId)) labels.push("Shared free");
  if (!labels.length) labels.push(history.complete ? "No recorded delivery" : "History incomplete");
  return labels;
}
