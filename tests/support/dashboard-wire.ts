// getDashboard (lib/dashboard-data.ts) on the in-memory PostgREST fake in ./postgrest-wire.ts.
// Added by W4 lane lib-dashboard-data-plus2. Routes found by running getDashboard against the fail-loud fake and reading the
// unmodelled list (clones, ledger probe + pages, four rollup RPCs, two conversion RPCs, users, photos, chat_history).
import { A, B } from "./ids";
import { oneStarRow, pgError, rowsReply, type Wire, type WireHandler, type WireReply } from "./postgrest-wire";

/** A clones row as getDashboard selects it (id,slug,name,created_at,intake). */
export function dashboardClone(id: string, slug: string, createdAt = "2026-01-01T00:00:00Z"): Record<string, unknown> {
  return { id, slug, name: slug.toUpperCase(), created_at: createdAt, intake: null };
}
export const CLONE_A = dashboardClone(A, "alpha");
export const CLONE_B = dashboardClone(B, "beta", "2026-02-01T00:00:00Z");
export const CLONES = [CLONE_A, CLONE_B];

/** One one-star "credits" sale for getDashboard's ledger (no media, so no offer/asset/signing reads). */
export function dashboardSale(n: number, paidAt: string, cloneId: string, stars = 1): Record<string, unknown> {
  return { ...oneStarRow(n, paidAt, cloneId), amount_stars: stars, media_id: null, media_type: null };
}

/** Postgres 57014 as PostgREST returns it. */
export const statementTimeout = (): WireReply => pgError(500, "57014", "canceling statement due to statement timeout");

/** The SQL function's signature: revenue_usage_rollup(p_start, p_end, p_clone) (lib/rollup.ts usageRollup). */
const USAGE_ROLLUP_ARGS = new Set(["p_start", "p_end", "p_clone"]);

/**
 * revenue_usage_rollup rows, scoped by `p_clone` as the SQL scopes them (null = every clone, unattributed rows included).
 * Any other argument (e.g. `p_clones`, which only the agency_* rewrite has, lib/agency-fetch.ts) answers PGRST202, as
 * PostgREST does for a function signature that does not exist.
 */
export function usageRollupReply(rows: readonly Record<string, unknown>[]): WireHandler {
  return (req) => {
    const args = (req.body ?? {}) as Record<string, unknown>;
    if (Object.keys(args).some((k) => !USAGE_ROLLUP_ARGS.has(k))) {
      return {
        status: 404,
        body: {
          code: "PGRST202", details: null, hint: null,
          message: `Could not find the function public.revenue_usage_rollup(${Object.keys(args).sort().join(", ")}) in the schema cache`,
        },
      };
    }
    return { body: rows.filter((r) => args.p_clone == null || r.clone_id === args.p_clone) };
  };
}

/** Everything getDashboard reads, with empty/zero answers except the given clones and ledger. Override with wire.on(). */
export function serveDashboardDefaults(wire: Wire, clones: readonly Record<string, unknown>[] = [], ledger: readonly Record<string, unknown>[] = []): void {
  wire.on("GET /rest/v1/clones", rowsReply(clones));
  wire.on("GET /rest/v1/star_transactions", rowsReply(ledger));
  wire.on("GET /rest/v1/users", rowsReply([]));
  wire.on("GET /rest/v1/photos", rowsReply([]));
  // `meta=cs.{...}` is not modelled by rowsReply; no offers is the honest default.
  wire.on("GET /rest/v1/chat_history", () => ({ body: [] }));
  wire.on("POST /rest/v1/rpc/revenue_usage_rollup", usageRollupReply([]));
  wire.on("POST /rest/v1/rpc/revenue_clone_user_stats_window", () => ({ body: [] }));
  wire.on("POST /rest/v1/rpc/revenue_clone_user_stats", () => ({ body: [] }));
  wire.on("POST /rest/v1/rpc/revenue_messaged_fans", () => ({ body: 0 }));
  wire.on("POST /rest/v1/rpc/revenue_active_chat_buyers", () => ({ body: 0 }));
}
