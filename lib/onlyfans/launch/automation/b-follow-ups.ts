/** Native durable engagement actions. Accepted transport is separate from purchase evidence. */
import { object, parseEngagementPage, ACTION_STATUSES, type EngagementAction } from "../native";
export const FOLLOW_UP_STATUS = ACTION_STATUSES;
export type FollowUpStatus = typeof ACTION_STATUSES[number];
export type BFollowUp = EngagementAction;
export function parseFollowUps(value: unknown, accountId: string): EngagementAction[] | null {
  return object(value) && value.accountId === accountId ? parseEngagementPage(value)?.actions ?? null : null;
}
