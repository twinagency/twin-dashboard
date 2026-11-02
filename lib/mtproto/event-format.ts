// lib/mtproto/event-format.ts
//
// One readable line for the events that need more than raw JSON: spike
// auto-halts (account_halt with detail.stats/threshold) and the control_action
// that resumes one. Everything else returns null and the caller falls back to
// the raw detail. Pure, no imports beyond halt.ts.

import { describeAutoHaltEvent } from "./halt";

export type EventForFormat = { eventType: string; detail: Record<string, unknown> };

export function describeEvent(e: EventForFormat): { text: string; danger: boolean } | null {
  if (e.eventType === "account_halt") {
    const auto = describeAutoHaltEvent(e.detail);
    if (auto) return { text: auto, danger: true };
    const code = typeof e.detail?.errorCode === "string" ? e.detail.errorCode : null;
    return { text: `ACCOUNT HALT${code ? `: ${code}` : ""}`, danger: true };
  }
  if (e.eventType === "control_action" && e.detail?.action === "resume_connection") {
    const before = e.detail.before as Record<string, unknown> | undefined;
    const was = typeof before?.pausedReason === "string" ? before.pausedReason : null;
    return { text: `Connection resumed${was ? ` (was ${was})` : ""}${e.detail.confirmed ? ", typed confirmation given" : ""}`, danger: false };
  }
  return null;
}
