// What /approve has done with one stored proposal, kept per proposal id in ai_messages.meta.claims (db.ts).
// No imports on purpose: the approve route, both chat clients (app/ai/AiChat.tsx, components/TwinPanel.tsx)
// and the G18 tests share it, and a client must not reach a server module.
//   claimed: a write is in flight.  applied: it ran and reported ok.  unknown: it threw, it may have landed.
// A proposal with no entry is still pending. Only an ok:false result (refused before writing) removes an entry.
export type ClaimState = "claimed" | "applied" | "unknown";

export const OUTCOME_UNKNOWN = "This change is in progress or its outcome is unknown. Check the setting before retrying.";

/** How a stored card renders on (re)load: applied → approved (its Applied line shows), claimed/unknown → not approvable. */
export function storedCardState(claims: Record<string, ClaimState> | null | undefined, id: string): "pending" | "approved" | "unknown" {
  const c = claims?.[id];
  return c === "applied" ? "approved" : c ? "unknown" : "pending";
}
