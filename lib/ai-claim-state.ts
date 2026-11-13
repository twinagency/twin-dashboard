// What /approve has done with one stored proposal, kept per proposal id in ai_messages.meta.claims
// (app/api/ai-assistant/db.ts), and the ONE mapping from that to what a card shows.
// No imports on purpose: the approve route, both chat clients (app/ai/AiChat.tsx, components/TwinPanel.tsx)
// and the G18 tests share it, and a client must not reach a server module.
//   claimed: a write is in flight.  applied: it ran and reported ok.  unknown: it threw, it may have landed.
// A proposal with no entry is still pending. Only an ok:false result (refused before writing) removes an entry.
export type ClaimState = "claimed" | "applied" | "unknown";

export const OUTCOME_UNKNOWN = "This change is in progress or its outcome is unknown. Check the setting before retrying.";

export type Proposal = { id: string; tool: string; args: Record<string, unknown>; summary: string; heavy: boolean };
// unknown: claimed and the outcome is not known (or it is in flight). Not approvable. approved: hidden, its Applied line shows.
export type ProposalCard = Proposal & { state: "pending" | "approving" | "approved" | "dismissed" | "unknown"; error?: string };

/** How a claim renders, on a reload (stored meta.claims) and after a live /approve 409 (its raw `state`) alike. */
export function cardState(claim: ClaimState | null | undefined): "pending" | "approved" | "unknown" {
  return claim === "applied" ? "approved" : claim ? "unknown" : "pending";
}

/**
 * What a card becomes once /approve answers. `applied` is the Applied line to show: the write's own summary, or, for
 * a card applied elsewhere (409), the card's summary, so it never vanishes without a trace.
 */
export function approveOutcome(
  httpOk: boolean,
  body: unknown,
  cardSummary: string,
): { state: "pending" | "approved" | "unknown"; error?: string; applied?: string } {
  const j = (body ?? {}) as { ok?: boolean; summary?: string; error?: string; state?: ClaimState };
  if (httpOk && j.ok) return { state: "approved", applied: j.summary ?? cardSummary };
  const state = cardState(j.state);
  if (state === "approved") return { state, applied: `Already applied: ${cardSummary}` };
  if (state === "unknown") return { state, error: j.error ?? OUTCOME_UNKNOWN };
  return { state, error: j.error ?? "the change did not go through" };
}
