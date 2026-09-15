import "server-only";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

/**
 * The hybrid CRM foundation stays dark until its additive database migration
 * has been reviewed and applied. Keeping this server-only prevents a browser
 * query parameter or local-storage value from exposing unfinished routes.
 */
export function hybridCrmFoundationEnabled(): boolean {
  return TRUE_VALUES.has((process.env.HYBRID_CRM_FOUNDATION_ENABLED ?? "").trim().toLowerCase());
}
