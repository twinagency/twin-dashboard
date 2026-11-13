import type { ConversationDetail, ConversationSummary, OfAccount } from "../onlyfans-preview/types";
import type { Handover } from "./handover";

/** Assignment comes from the saved conversation control, never message text. */
export function isAiChatting(conversation: Pick<ConversationSummary, "automationMode" | "takeoverState">): boolean {
  return conversation.automationMode === "automated" && conversation.takeoverState === "none";
}

/** Account-level reason AI replies cannot go out, checked before any per-conversation state. null: none. */
export function accountBlocker(account: OfAccount | null): "runtime" | "paused" | "connection" | "sender_disabled" | null {
  if (!account?.runtime) return "runtime";
  if (!account.runtime.enabled) return "paused";
  if (account.health !== "connected") return "connection";
  return account.runtime.deliveryEnabled ? null : "sender_disabled";
}

/** Sender-level reason: not running, or its status is missing, stale (>180s) or from the future. null: running and fresh. */
export function senderBlocker(runtime: NonNullable<OfAccount["runtime"]>, now = Date.now()): "sender" | "sender_status" | null {
  if (runtime.sender.state !== "running") return "sender";
  const observed = runtime.sender.observedAt ? Date.parse(runtime.sender.observedAt) : NaN;
  return !Number.isFinite(observed) || now - observed > 180_000 || observed > now + 5000 ? "sender_status" : null;
}

const BLOCKED = { runtime: "Runtime status unavailable", paused: "Account paused", connection: "Connection unavailable", sender_disabled: "Sender disabled",
  sender: "Sender unavailable", sender_status: "Sender status unavailable" } as const;

export function effectiveAiStatus(conversation: ConversationSummary, account: OfAccount | null): string {
  if (!isAiChatting(conversation)) return conversation.takeoverState === "requested" ? "Takeover pending" :
    conversation.automationMode === "human_controlled" ? "Human replies" : "Intentionally paused";
  const blocked = accountBlocker(account);
  if (blocked) return `AI enabled for this fan. ${BLOCKED[blocked]}`;
  if (conversation.historyHeld) return "AI enabled for this fan. History requires repair";
  if (["unknown", "partial"].includes(conversation.delivery)) return "AI enabled for this fan. Delivery unresolved";
  const sender = senderBlocker(account!.runtime!);
  if (sender) return `AI enabled for this fan. ${BLOCKED[sender]}`;
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
  return conversation.requiresAttention ? { label: "Action required", tone: "pink" } : { label: "AI handling", tone: "green" };
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
