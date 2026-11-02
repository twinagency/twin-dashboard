// ── API keys for the public API (app/api/v1/*) ───────────────────────────────
//
// SCOPE MODEL. There are exactly TWO kinds of key and a key's kind is a
// property of its database row, never of the request:
//
//   scope "clone" — sees exactly the clone in clone_id. The original shape,
//                   decided 2026-08-08 (migration 103), for a model's own
//                   dashboard.
//   scope "fleet" — sees every clone, clone_id is null. Added 2026-08-24
//                   (migration 127) for an external builder drawing all ten
//                   girls' earnings on one page.
//
// EITHER WAY THE SCOPE COMES FROM THE KEY, NEVER FROM A REQUEST PARAMETER. A
// `?clone=` on this API would be the whole vulnerability in one line, so it is
// rejected for both kinds — see api-public-route.ts. A fleet key does not need
// one (it already gets every clone in the response) and a clone key must not
// have one.
//
// The two columns are pinned to each other by a check constraint in migration
// 127, and resolveKey() below re-checks the same invariant in code before it
// hands out a tenant. Belt and braces on purpose: the failure being guarded is
// a clone key silently widening into a fleet key, which is the one direction
// that is not survivable.
//
// Keys are stored as sha256 hex and never in plaintext. The key is displayed
// once, by the /api-access page, and is unrecoverable after that.

import { createHash, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "./supabase";

export const KEY_BYTES = 32;
export const KEY_PREFIX_LEN = 8;

export function hashKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export function keyPrefix(key: string): string {
  return key.slice(0, KEY_PREFIX_LEN);
}

export type KeyScope = "clone" | "fleet";

// cloneId is null EXACTLY when scope is "fleet". The two are not independent —
// every consumer should switch on `scope` and treat cloneId as the payload of
// the "clone" case, rather than testing cloneId for null and inferring.
export type Tenant = {
  keyId: string;
  cloneId: string | null;
  scope: KeyScope;
  label: string;
};

export type TenantFailure = { ok: false; status: 401 | 429; error: string };
export type TenantResult = { ok: true; tenant: Tenant } | TenantFailure;

// Same header shapes as the admin API. No query-string key: it would land in
// Apache's access log and in the browser history of whoever opened the URL.
export function presentedKey(headers: Headers): string | null {
  const auth = headers.get("authorization");
  if (auth) {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (m) return m[1].trim();
  }
  const direct = headers.get("x-twin-key");
  return direct ? direct.trim() : null;
}

// Compares two hex digests without leaking timing. Both are fixed-length
// sha256 hex here, so a length mismatch means a malformed row, not a near-miss.
export function digestsEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// ── rate limiting ────────────────────────────────────────────────────────────
// A fixed-window counter per key, in memory. Deliberately simple and
// deliberately in-process: there is ONE dashboard container, so a shared store
// would be complexity with no correctness gain today.
//
// WHY IT IS HERE AT ALL, since a read-only API is not obviously dangerous: this
// API runs in the SAME Next process that serves the operator dashboard, on a
// micro Supabase compute. An agency dashboard with a refresh loop is not an
// attack and would still take the operator UI down with it. That is the risk
// being managed, not abuse.
//
// LIMIT: a caller polling a chart every few seconds stays well under this; a
// render loop does not.
export const RATE_LIMIT_PER_MINUTE = 120;
const WINDOW_MS = 60_000;
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  keyId: string,
  now: number,
  limit = RATE_LIMIT_PER_MINUTE,
): { allowed: boolean; remaining: number; resetAt: number } {
  const cur = hits.get(keyId);
  if (!cur || now >= cur.resetAt) {
    const next = { count: 1, resetAt: now + WINDOW_MS };
    hits.set(keyId, next);
    // Opportunistic sweep so a long-lived process doesn't accumulate a row per
    // key that ever called. Cheap: the map is bounded by issued key count.
    if (hits.size > 1000) {
      for (const [k, v] of hits) if (now >= v.resetAt) hits.delete(k);
    }
    return { allowed: true, remaining: limit - 1, resetAt: next.resetAt };
  }
  cur.count += 1;
  return { allowed: cur.count <= limit, remaining: Math.max(0, limit - cur.count), resetAt: cur.resetAt };
}

// Test seam: the checks drive rateLimit() directly with an explicit clock, and
// need to reset between cases.
export function _resetRateLimits(): void {
  hits.clear();
}

// ── the scope invariant ──────────────────────────────────────────────────────
// Migration 127's CHECK constraint already makes "clone with an id" and "fleet
// with no id" the only two legal rows. This repeats the rule in code, and it is
// a separate exported function so it can be tested against a hand-built row
// without a database — the widening cases below are precisely the ones that
// must never be discovered in production.
//
// A ROW THAT SATISFIES NEITHER SHAPE IS REFUSED, not guessed at. An unreadable
// credential fails closed; an assumed one fails open.
//
// Note the direction of every test. "fleet" must PROVE clone_id is null, and
// anything that is not exactly the string "fleet" is read as a clone key, so a
// corrupted, missing or unknown scope can only ever narrow what a key sees.
export function tenantFromRow(row: {
  id: unknown;
  clone_id: unknown;
  scope?: unknown;
  label: unknown;
}): Tenant | null {
  const keyId = String(row.id);
  const label = String(row.label);
  const cloneId = row.clone_id == null ? null : String(row.clone_id);
  const scope = row.scope == null ? "clone" : String(row.scope);

  if (scope === "fleet") {
    // A fleet row that still names a clone is a half-migrated or tampered row.
    // Refuse it rather than picking whichever field looks more trustworthy.
    if (cloneId !== null) return null;
    return { keyId, cloneId: null, scope: "fleet", label };
  }
  if (scope !== "clone") return null;
  if (cloneId === null) return null;
  return { keyId, cloneId, scope: "clone", label };
}

// ── the lookup ───────────────────────────────────────────────────────────────
// Looks a key up by HASH. A revoked key is not found (the partial index is on
// `revoked_at is null`), so revocation takes effect on the next request with no
// cache to invalidate.
export async function resolveKey(presented: string | null): Promise<Tenant | null> {
  if (!presented) return null;
  const hash = hashKey(presented);

  const { data, error } = await supabaseAdmin
    .from("api_keys")
    .select("id,clone_id,scope,label,key_hash,revoked_at")
    .eq("key_hash", hash)
    .is("revoked_at", null)
    .maybeSingle();
  if (error || !data) return null;

  // The .eq above already matched, so this is belt-and-braces against a future
  // refactor that widens the query (e.g. to prefix matching) and quietly turns
  // it into "any key with this prefix".
  if (!digestsEqual(String(data.key_hash), hash)) return null;
  if (data.revoked_at) return null;

  const tenant = tenantFromRow(data);
  if (!tenant) return null;

  // Below the validation, not above it: a key that failed the scope invariant
  // must not leave a last_used_at behind saying it worked.
  void supabaseAdmin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(
      () => undefined,
      () => undefined, // fire-and-forget: never fail a request over telemetry
    );

  return tenant;
}

export async function authenticateModel(req: Request, now = Date.now()): Promise<TenantResult> {
  const tenant = await resolveKey(presentedKey(req.headers));
  if (!tenant) return { ok: false, status: 401, error: "invalid or revoked API key" };

  const rl = rateLimit(tenant.keyId, now);
  if (!rl.allowed) {
    return {
      ok: false,
      status: 429,
      error: `rate limit exceeded (${RATE_LIMIT_PER_MINUTE} requests/minute)`,
    };
  }
  return { ok: true, tenant };
}
