// ── Net-at-the-source scaling for agency / creator reads ────────────────────
//
// lib/agency-fetch.ts (dashboardFetch) is the single chokepoint every
// non-admin supabaseAdmin read passes through. Earned-star fields are scaled
// there by the viewer's starMult (see getViewerTerms in lib/platform-cut.ts),
// so gross never leaves the server and every page that reads through the
// wrapper is net automatically, with no per-payload scaling to forget.
//
// Only EARNED stars are scaled: money the fans paid. Never prices (star_price,
// price_stars, credit_pack_price_stars, tip settings, spend_tier thresholds),
// never counts. Pure functions, no I/O, so scripts/check-agency-scale.ts can
// prove the map offline.

/** Table columns that hold earned stars. Anything not listed passes through untouched. */
export const EARNED_TABLE_FIELDS: Record<string, readonly string[]> = {
  star_transactions: ["amount_stars"],
  users: ["total_spent_stars"],
};

/**
 * Every rollup an agency may call, with its star-money outputs.
 * `scalar` = the function returns one bare number; `fields` = column names in
 * the returned rows (empty = the rollup returns only counts / cost / times).
 * A rollup in AGENCY_ROLLUPS with no entry here is refused (fail closed), so a
 * new rollup cannot leak gross by omission.
 */
export type RollupShape = { scalar: true } | { fields: readonly string[] };
export const RPC_STAR_FIELDS: Record<string, RollupShape> = {
  revenue_all_time_stars: { scalar: true },
  revenue_fan_spend_stats: { fields: ["repeat_buyer_stars", "lifetime_stars", "median_buyer_stars"] },
  revenue_fan_tiers: { fields: ["stars"] },
  // counts only
  revenue_clone_user_stats: { fields: [] },
  revenue_clone_user_stats_window: { fields: [] },
  revenue_messaged_fans: { fields: [] },
  revenue_conversation_funnel: { fields: [] },
  revenue_paywall_stats: { fields: [] },
  revenue_active_chat_buyers: { fields: [] },
  // our AI cost, not earnings; cost fields are redacted for non-admins elsewhere
  revenue_usage_rollup: { fields: [] },
};

export function isMappedRollup(fn: string): boolean {
  return Object.prototype.hasOwnProperty.call(RPC_STAR_FIELDS, fn);
}

function scaleNum(v: unknown, mult: number): unknown {
  if (v == null) return v;
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n * mult : v;
}

function scaleRow(row: unknown, fields: readonly string[], mult: number): unknown {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row;
  const out: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const f of fields) if (f in out) out[f] = scaleNum(out[f], mult);
  return out;
}

/** Scale a PostgREST table response body (array of rows, or one row). */
export function scaleTableBody(table: string, body: unknown, mult: number): unknown {
  const fields = EARNED_TABLE_FIELDS[table];
  if (!fields || mult === 1) return body;
  return Array.isArray(body) ? body.map((r) => scaleRow(r, fields, mult)) : scaleRow(body, fields, mult);
}

/** Scale an RPC response body. Throws on an unmapped rollup (caller turns that into a 403). */
export function scaleRpcBody(fn: string, body: unknown, mult: number): unknown {
  const shape = RPC_STAR_FIELDS[fn];
  if (!shape || !isMappedRollup(fn)) throw new Error(`No star-field map for rollup ${fn}`);
  if (mult === 1) return body;
  if ("scalar" in shape) return Array.isArray(body) ? body.map((v) => scaleNum(v, mult)) : scaleNum(body, mult);
  if (!shape.fields.length) return body;
  return Array.isArray(body) ? body.map((r) => scaleRow(r, shape.fields, mult)) : scaleRow(body, shape.fields, mult);
}
