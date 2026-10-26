import type { ConversationDetail, ConversationSummary } from "../onlyfans-preview/types";
import type { Handover } from "./handover";

/** Assignment comes from the saved conversation control, never message text. */
export function isAiChatting(conversation: Pick<ConversationSummary, "automationMode" | "takeoverState">): boolean {
  return conversation.automationMode === "automated" && conversation.takeoverState === "none";
}

type ControlEvent = Handover["events"][number];
export type ConversationTimelineEntry =
  | { kind: "message"; at: string; message: ConversationDetail["messages"][number] }
  | { kind: "control"; at: string; event: ControlEvent; label: string };

function controlLabel(event: ControlEvent): string | null {
  if (["resume_automation", "release_takeover"].includes(event.action)) return "AI took over";
  if (event.action === "pause_automation") return "AI chatting paused";
  if (event.action === "request_takeover") return "Manual takeover. AI paused";
  if (event.action === "complete_takeover") return "Manual control started";
  if (event.action === "mark_no_contact") return "Further contact stopped";
  if (event.action === "change_mode") return event.mode === "automated" ? "AI took over" :
    event.mode === "human_controlled" ? "Manual control started" :
    event.mode === "no_contact" ? "Further contact stopped" : "AI chatting paused";
  return null;
}

/** Reuse the durable control ledger. An imported message is never guessed to be AI. */
export function conversationTimeline(detail: ConversationDetail, handover?: Handover | null): ConversationTimelineEntry[] {
  const entries: ConversationTimelineEntry[] = detail.messages.map(message => ({ kind: "message", at: message.occurredAt, message }));
  if (handover?.accountId === detail.accountId && handover.conversationId === detail.conversationId &&
      handover.revision <= detail.summary.revision) {
    const seen = new Set<number>();
    for (const event of handover.events) {
      const label = controlLabel(event);
      if (!label || seen.has(event.revision) || event.revision > detail.summary.revision || !Number.isFinite(Date.parse(event.at))) continue;
      seen.add(event.revision);
      entries.push({ kind: "control", at: event.at, event, label });
    }
  }
  return entries.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) ||
    (a.kind === b.kind ? a.kind === "control" && b.kind === "control" ? a.event.revision - b.event.revision : 0 : a.kind === "control" ? -1 : 1));
}
