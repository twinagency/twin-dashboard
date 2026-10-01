// T-Social: the Telegram Mini App feed (twin-reels/site). The public feed and event
// API live on AWS Lambda (twin-reels/server), not on this dashboard. Only the admin
// page helpers remain here. No Next imports so checks run offline.

export const TSOCIAL_ORIGIN = "https://dsygeknm080dt.cloudfront.net";

/** True when a PostgREST error means the T-Social tables are not there yet. */
export function tablesMissing(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return !!e && (e.code === "42P01" || e.code === "PGRST205" || /tsocial_.*(does not exist|schema cache)/.test(e.message ?? ""));
}
