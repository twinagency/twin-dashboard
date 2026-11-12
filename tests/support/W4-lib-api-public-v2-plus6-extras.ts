/**
 * Extra wire behaviour for the W4 lib-api-public-v2-plus6 tests, layered on tests/support/admin-wire.ts (copied
 * verbatim from lane 3, a57e1b2d) without editing it. Everything here still fakes the WIRE (fetch), never a service.
 * Each helper names the real-system behaviour it models; anything modelled is an assumption the test header states.
 */
import { CLONE_ID, type Call, type Row } from "./admin-wire";

/** A PostgREST error response, as supabase-js reads it ({ code, message } body, non-2xx status). */
export function pgError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ code, message, details: null, hint: null }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Statement timeout, what Supavisor raises for a slow read (57014), answered as PostgREST's 500. */
export const statementTimeout = () => pgError(500, "57014", "canceling statement due to statement timeout");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Models a uuid-typed `id` column: Postgres refuses `id=eq.<not a uuid>` with 22P02 (PostgREST 400). The base fake has
 * no schema, so without this a slug compared to a uuid column would quietly match nothing instead of erroring.
 * Use from WireOpts.override.
 */
export function uuidIdColumn(tables: string[]) {
  return (call: Call): Response | undefined => {
    if (!call.table || !tables.includes(call.table) || call.method !== "GET") return undefined;
    const id = call.url.searchParams.get("id");
    if (id && id.startsWith("eq.") && !UUID.test(id.slice(3))) {
      return pgError(400, "22P02", `invalid input syntax for type uuid: "${id.slice(3)}"`);
    }
    return undefined;
  };
}

/**
 * Models PostgREST `db-max-rows` (Supabase's default project config is max_rows = 1000): a read never returns more
 * than `max` rows, whatever `limit` the client asked for, and nothing in the response says it was capped.
 * Use as WireOpts.override: it clamps the GET's `limit` param in place (no limit -> `max`) and lets the base fake
 * answer, so content-range stays consistent with the rows sent. Side effect: recorded calls show the CLAMPED limit.
 */
export function capMaxRows(max = 1000) {
  return (call: Call): Response | undefined => {
    if (!call.table || call.method !== "GET") return undefined;
    const asked = call.url.searchParams.get("limit");
    if (asked === null || Number(asked) > max) call.url.searchParams.set("limit", String(max));
    return undefined;
  };
}

/** Cut fixture for CLONE_ID. `platformPct`: the clone's own platform_cuts row (absent = none, i.e. 0%), with
 *  `usdPerStar` as its rate when given. `agencyId`: agency_creators links the clone to that agency.
 *  `agencyCreatorPct`: an agency_creator_cuts row for the clone. A bare number is `platformPct` (older call sites). */
export type CutOpts = { platformPct?: number; usdPerStar?: number; agencyCreatorPct?: number; agencyId?: string };

/** The three tables lib/platform-cut.ts reads for CLONE_ID's cut. No options = no cut at all. */
export function cutTables(opts: number | CutOpts = {}): Record<string, Row[]> {
  const o: CutOpts = typeof opts === "number" ? { platformPct: opts } : opts;
  return {
    platform_cuts: o.platformPct == null ? []
      : [{ clone_id: CLONE_ID, cut_pct: o.platformPct, ...(o.usdPerStar == null ? {} : { usd_per_star: o.usdPerStar }) }],
    agency_creator_cuts: o.agencyCreatorPct == null ? []
      : [{ ...(o.agencyId ? { agency_id: o.agencyId } : {}), clone_id: CLONE_ID, cut_pct: o.agencyCreatorPct }],
    agency_creators: o.agencyId ? [{ agency_id: o.agencyId, clone_id: CLONE_ID, usd_per_star: null }] : [],
  };
}

/** The non-cut tables getAnalytics reads for a one-clone window: CLONE_ID's clone row, the given sales, and empty
 *  users / chat_history / paywall_hits. Pair with cutTables and EMPTY_ROLLUP_RPCS. */
export function analyticsTables(stx: Row[]): Record<string, Row[]> {
  return {
    clones: [{ id: CLONE_ID, name: "Fake Clone", created_at: "2026-01-01T00:00:00.000Z", ai_mode: null, intake: null }],
    star_transactions: stx,
    users: [], chat_history: [], paywall_hits: [],
  };
}

/** Awaits `p` and reports how it settled, so a test can assert "rejected" with the resolved value in the message. */
export async function settle<T>(p: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  try { return { ok: true, value: await p }; } catch (e) { return { ok: false, error: e }; }
}
