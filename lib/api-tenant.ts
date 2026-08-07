// ── Per-model API keys for the public API (app/api/v1/*) ─────────────────────
//
// SCOPE MODEL, decided 2026-08-08: ONE KEY SEES ONE CLONE. There is no agency
// concept and no tenant table (migration 103 explains why). Every scoped read
// takes its clone_id from the KEY, never from a request parameter — a
// `?clone=` on this API would be the whole vulnerability in one line.
//
// Keys are stored as sha256 hex and never in plaintext. The key is displayed
// once by scripts/issue-api-key.ts and is unrecoverable after that.

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

export type Tenant = {
  keyId: string;
  cloneId: string;
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
export const RATE_LIMIT_PER_MINUTE = 60;
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

// ── the lookup ───────────────────────────────────────────────────────────────
// Looks a key up by HASH. A revoked key is not found (the partial index is on
// `revoked_at is null`), so revocation takes effect on the next request with no
// cache to invalidate.
export async function resolveKey(presented: string | null): Promise<Tenant | null> {
  if (!presented) return null;
  const hash = hashKey(presented);

  const { data, error } = await supabaseAdmin
    .from("api_keys")
    .select("id,clone_id,label,key_hash,revoked_at")
    .eq("key_hash", hash)
    .is("revoked_at", null)
    .maybeSingle();
  if (error || !data) return null;

  // The .eq above already matched, so this is belt-and-braces against a future
  // refactor that widens the query (e.g. to prefix matching) and quietly turns
  // it into "any key with this prefix".
  if (!digestsEqual(String(data.key_hash), hash)) return null;
  if (data.revoked_at) return null;

  void supabaseAdmin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(
      () => undefined,
      () => undefined, // fire-and-forget: never fail a request over telemetry
    );

  return { keyId: String(data.id), cloneId: String(data.clone_id), label: String(data.label) };
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
