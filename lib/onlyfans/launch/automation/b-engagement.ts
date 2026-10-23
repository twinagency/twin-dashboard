/** Section E. Browser-side shapes for scheduled proactive messages. */
import { rec } from "../live/shared";
import { ACTION_STATUS, ACTION_KIND, type ActionStatus, type EngagementAction, type EngagementSettings } from "../live/engagement-model";
export type { ActionStatus, EngagementAction, EngagementSettings };
export type EngagementView = { settings: EngagementSettings; actions: EngagementAction[] };

export const KIND_TEXT: Record<EngagementAction["kind"], string> = { offer: "Offer", follow_up: "Follow-up", reengage: "Re-engagement" };
export const STATUS_TEXT: Record<ActionStatus, string> = { scheduled: "Scheduled, not queued to send", queued: "Queued for delivery", dispatching: "Sending now", accepted: "Accepted by the platform",
  not_accepted: "Not accepted by the platform", unknown: "Outcome unknown (may or may not have sent)", cancelled: "Cancelled", expired: "Expired, not sent" };
/** Only a scheduled or queued message can be cancelled; later states may already be on the wire. */
export const canCancel = (s: ActionStatus) => s === "scheduled" || s === "queued";

export function parseEngagementReply(value: unknown, accountId: string): EngagementView | null {
  const d = rec(value) && value.accountId === accountId && rec(value.data) ? value.data : null;
  if (!d || !rec(d.settings) || !rec(d.settings.settings) || typeof d.settings.settings.enabled !== "boolean" || !Number.isSafeInteger(d.settings.revision) || typeof d.settings.bindingCurrent !== "boolean" ||
    !Array.isArray(d.actions) || d.actions.length > 50) return null;
  const ids = new Set<string>();
  for (const a of d.actions) {
    if (!rec(a) || typeof a.actionId !== "string" || !(ACTION_KIND as readonly unknown[]).includes(a.kind) || !(ACTION_STATUS as readonly unknown[]).includes(a.status) || typeof a.fanId !== "string" ||
      typeof a.dueAt !== "string" || typeof a.cancelRequested !== "boolean") return null;
    ids.add(a.actionId);
  }
  return ids.size === d.actions.length ? d as unknown as EngagementView : null;
}
