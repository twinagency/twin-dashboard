// Shared constants + pure helpers for the feedback queue. Kept OUT of actions.ts
// because a "use server" module may only export async functions.

export type FeedbackType = "bug" | "suggestion";
export type FeedbackStatus = "new" | "reviewing" | "building" | "done";

export const STATUSES: FeedbackStatus[] = ["new", "reviewing", "building", "done"];
export const SEVERITIES = ["low", "medium", "high", "critical"] as const;

// A "table doesn't exist yet" Postgres error (migration 026 not applied). We surface
// this as a friendly hint on the pages instead of crashing.
export function isMissingTableError(err: unknown): boolean {
  const msg = (err as { message?: string })?.message ?? "";
  const code = (err as { code?: string })?.code ?? "";
  return code === "42P01" || (/feedback_items/.test(msg) && /(does not exist|schema cache)/.test(msg));
}
