/** Follow-ups: Chat 4 contract is NOT delivered. Parser describes the contract requested in LAUNCH-SHARED-CHANGES.txt. Fixtures are FIXTURE-ONLY. */
import { bId } from "../b-common";

export const FOLLOW_UP_STATUS = ["scheduled", "sending", "sent", "cancelled", "blocked"] as const;
export type FollowUpStatus = typeof FOLLOW_UP_STATUS[number];
export type BFollowUp = { followUpId: string; conversationId: string; fanName: string; scheduledFor: string; kind: string; status: FollowUpStatus; cancellable: boolean; blockedReason: string | null };

const rec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export function parseFollowUps(value: unknown, accountId: string): BFollowUp[] | null {
  if (!rec(value) || value.accountId !== accountId || !Array.isArray(value.followUps) || value.followUps.length > 200) return null;
  const out: BFollowUp[] = [];
  for (const r of value.followUps) {
    if (!rec(r) || !bId(r.followUpId) || !bId(r.conversationId) || typeof r.fanName !== "string" || r.fanName.length > 160 ||
      typeof r.scheduledFor !== "string" || !Number.isFinite(Date.parse(r.scheduledFor)) || typeof r.kind !== "string" || r.kind.length > 64 ||
      !(FOLLOW_UP_STATUS as readonly unknown[]).includes(r.status) || typeof r.cancellable !== "boolean" ||
      !(r.blockedReason === null || (typeof r.blockedReason === "string" && r.blockedReason.length <= 200))) return null;
    out.push({ followUpId: r.followUpId, conversationId: r.conversationId, fanName: r.fanName, scheduledFor: r.scheduledFor, kind: r.kind,
      status: r.status as FollowUpStatus, cancellable: r.cancellable && r.status === "scheduled", blockedReason: r.blockedReason as string | null });
  }
  return new Set(out.map(f => f.followUpId)).size === out.length ? out : null;
}

/** FIXTURE-ONLY. Never shown unless the operator explicitly opens the fixture preview. */
export function fixtureFollowUps(accountId: string): BFollowUp[] {
  const at = (h: number) => new Date(Date.UTC(2026, 9, 24, h)).toISOString();
  return [
    { followUpId: `fx-${accountId}-1`, conversationId: `${accountId}:1`, fanName: "FIXTURE fan A", scheduledFor: at(2), kind: "check_in", status: "scheduled", cancellable: true, blockedReason: null },
    { followUpId: `fx-${accountId}-2`, conversationId: `${accountId}:2`, fanName: "FIXTURE fan B", scheduledFor: at(5), kind: "offer_reminder", status: "scheduled", cancellable: true, blockedReason: null },
    { followUpId: `fx-${accountId}-3`, conversationId: `${accountId}:3`, fanName: "FIXTURE fan C", scheduledFor: at(8), kind: "check_in", status: "blocked", cancellable: false, blockedReason: "Conversation is marked no-contact." },
    { followUpId: `fx-${accountId}-4`, conversationId: `${accountId}:4`, fanName: "FIXTURE fan D", scheduledFor: at(1), kind: "check_in", status: "sent", cancellable: false, blockedReason: null },
  ];
}
