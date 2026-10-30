import type { ConversationDetail, ConversationSummary, OfAccount } from "../onlyfans-preview/types";
import type { Handover } from "./handover";


export type AttentionNotice = { key: string; title: string; detail: string; nextAction: string };

/** Explain saved reasons only. Message text is never used to guess why a chat is held. */
export function conversationAttention(conversation: ConversationSummary): AttentionNotice[] {
  const reasons = new Set(conversation.attentionReasons ?? []);
  if (conversation.historyHeld) reasons.add("history_repair");
  if (["unknown", "partial", "failed", "refused"].includes(conversation.delivery)) reasons.add("delivery_problem");
  const notices: AttentionNotice[] = [];
  if (reasons.has("human_review")) notices.push({
    key: "human_review", title: "Human review needed",
    detail: "This conversation is flagged for a person to review. The saved status does not include a more specific explanation.",
    nextAction: "Review the conversation, then use Take over to reply if a human response is needed.",
  });
  if (reasons.has("delivery_problem")) notices.push({
    key: "delivery_problem", title: "Check message delivery",
    detail: "A message failed, was refused, or has an unresolved delivery outcome.",
    nextAction: "Open reply controls and review the delivery evidence before retrying a message.",
  });
  if (reasons.has("history_repair")) notices.push({
    key: "history_repair", title: "Conversation history needs repair",
    detail: "This conversation has a saved history hold.",
    nextAction: "Open history and sync details. An account operator needs to repair the history before sending can resume.",
  });
  if (reasons.has("needs_reply")) notices.push({
    key: "needs_reply", title: "Unread fan messages",
    detail: "This fan has unread messages. This alone does not mean AI replies are paused.",
    nextAction: "Read the latest messages. To answer manually, use Take over to reply.",
  });
  const unknownReason = [...reasons].some(reason => !["human_review", "delivery_problem", "history_repair", "needs_reply", "intentionally_paused"].includes(reason));
  if (unknownReason || (conversation.requiresAttention && notices.length === 0)) notices.push({
    key: "unavailable", title: "Review required",
    detail: "The service flagged this conversation but did not provide a recognised reason.",
    nextAction: "Refresh the conversation. If the reason is still missing, ask an account operator to inspect it.",
  });
  return notices;
}

/** Assignment comes from the saved conversation control, never message text. */
export function isAiChatting(conversation: Pick<ConversationSummary, "automationMode" | "takeoverState">): boolean {
  return conversation.automationMode === "automated" && conversation.takeoverState === "none";
}

export function effectiveAiStatus(conversation: ConversationSummary, account: OfAccount | null): string {
  if (!isAiChatting(conversation)) return conversation.takeoverState === "requested" ? "Takeover pending" :
    conversation.automationMode === "human_controlled" ? "Human replies" : "Intentionally paused";
  if (!account?.runtime) return "AI enabled for this fan. Runtime status unavailable";
  if (!account.runtime.enabled) return "AI enabled for this fan. Account paused";
  if (account.health !== "connected") return "AI enabled for this fan. Connection unavailable";
  if (!account.runtime.deliveryEnabled) return "AI enabled for this fan. Sender disabled";
  if (conversation.historyHeld) return "AI enabled for this fan. History requires repair";
  if (["unknown", "partial"].includes(conversation.delivery)) return "AI enabled for this fan. Delivery unresolved";
  const attention = conversationAttention(conversation);
  if (attention.length) return attention.map(item => item.title).join(" · ");
  if (account.runtime.sender.state !== "running") return "AI enabled for this fan. Sender unavailable";
  const observed = account.runtime.sender.observedAt ? Date.parse(account.runtime.sender.observedAt) : NaN;
  if (!Number.isFinite(observed) || Date.now() - observed > 180_000 || observed > Date.now() + 5000) return "AI enabled for this fan. Sender status unavailable";
  if (conversation.delivery === "dispatching") return "AI sending";
  if (conversation.delivery === "accepted_pending") return "AI reply accepted. CRM update pending";
  if (conversation.delivery === "queued") return "AI reply queued";
  if (conversation.delivery === "generating") return "AI preparing reply";
  return "AI enabled for this fan. Ready for new input";
}

export type ReplyOwnership = { label: string; tone: "green" | "blue" | "gold" | "pink" | "slate" };

/**
 * Plain reply-ownership label from saved control state only. The row data cannot say
 * which person holds a takeover, so only the selected conversation's handover (already
 * redacted to you/team/operator at the BFF) can name "you" or "another operator";
 * otherwise a person is described without guessing who.
 */
export function replyOwnership(conversation: ConversationSummary, account: OfAccount | null, handover?: Handover | null): ReplyOwnership {
  if (conversation.automationMode === "no_contact") return { label: "No further contact", tone: "slate" };
  if (conversation.takeoverState === "requested") return { label: "Takeover pending", tone: "gold" };
  if (conversation.takeoverState === "effective" || conversation.automationMode === "human_controlled") {
    const owner = handover && handover.accountId === conversation.accountId && handover.conversationId === conversation.conversationId &&
      handover.takeoverState === conversation.takeoverState ? handover.owner : null;
    return owner === "you" ? { label: "You are handling", tone: "blue" } :
      owner === "team" || owner === "operator" ? { label: "Another operator is handling", tone: "blue" } : { label: "A person is handling", tone: "blue" };
  }
  if (conversation.automationMode === "paused" || account?.runtime?.enabled === false) return { label: "AI paused", tone: "gold" };
  const attention = conversationAttention(conversation);
  return attention.length ? { label: attention[0].title, tone: attention.every(item => item.key === "needs_reply") ? "gold" : "pink" } : { label: "AI handling", tone: "green" };
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
