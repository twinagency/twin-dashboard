/** Scheduled proactive messages (engagement), and the account-wide stop controls.
 * Success is reported only when the backend returns a recorded action that matches the request. */
import { rec, FAN_ID, ID, type Rec } from "./shared";

export const ACTION_STATUS = ["scheduled", "queued", "dispatching", "accepted", "not_accepted", "unknown", "cancelled", "expired"] as const;
export const ACTION_KIND = ["offer", "follow_up", "reengage"] as const;
export type ActionStatus = typeof ACTION_STATUS[number];
export type EngagementAction = { actionId: string; kind: typeof ACTION_KIND[number]; status: ActionStatus; reason: string | null; fanId: string; dueAt: string; expiresAt: string; cancelRequested: boolean };
const stamp = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));
export const UUID = /^[a-f0-9-]{36}$/;

export function parseAction(v: unknown): EngagementAction | null {
  if (!rec(v) || typeof v.actionId !== "string" || !UUID.test(v.actionId) || !(ACTION_KIND as readonly unknown[]).includes(v.kind) || !(ACTION_STATUS as readonly unknown[]).includes(v.status) ||
    !(v.reason === null || (typeof v.reason === "string" && v.reason.length <= 64)) || typeof v.fanId !== "string" || !FAN_ID.test(v.fanId) || !stamp(v.dueAt) || !stamp(v.expiresAt) || typeof v.cancelRequested !== "boolean") return null;
  return { actionId: v.actionId, kind: v.kind as EngagementAction["kind"], status: v.status as ActionStatus, reason: v.reason as string | null, fanId: v.fanId, dueAt: v.dueAt, expiresAt: v.expiresAt, cancelRequested: v.cancelRequested };
}
export const POLICY_BOOLS = ["enabled", "offers", "follow_ups", "reengagement"] as const;
export const POLICY_INTS = ["offer_delay_hours", "follow_up_delay_hours", "reengage_delay_hours", "expiry_hours", "fan_daily_limit", "fan_weekly_limit", "account_hourly_limit", "account_daily_limit", "unpaid_cooldown_hours", "repeat_item_days"] as const;
export type Policy = Record<typeof POLICY_BOOLS[number], boolean> & Record<typeof POLICY_INTS[number], number> & { follow_up_text: string; reengage_text: string };
export type EngagementSettings = { revision: number; bindingCurrent: boolean; settings: Policy };
export function parseSettings(v: unknown): EngagementSettings | null {
  if (!rec(v) || v.engagementVersion !== "of-engagement.v1" || !Number.isSafeInteger(v.revision) || (v.revision as number) < 0 || typeof v.bindingCurrent !== "boolean" || !rec(v.settings)) return null;
  const s = v.settings, keys = [...POLICY_BOOLS, ...POLICY_INTS, "follow_up_text", "reengage_text"];
  if (Object.keys(s).sort().join() !== [...keys].sort().join() || !POLICY_BOOLS.every(k => typeof s[k] === "boolean") || !POLICY_INTS.every(k => Number.isSafeInteger(s[k])) ||
    typeof s.follow_up_text !== "string" || typeof s.reengage_text !== "string") return null;
  return { revision: v.revision as number, bindingCurrent: v.bindingCurrent, settings: s as unknown as Policy };
}

