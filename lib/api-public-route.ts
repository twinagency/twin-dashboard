// Shared wrapper for app/api/v1/* — the model-facing public API.
//
// DIFFERENT FROM withAdmin ON PURPOSE. The admin API has a network gate
// (Tailscale/loopback) because nobody outside the house should reach it. This
// one is meant to be reachable from a model's browser, so there is no network
// gate and the key is the only thing standing there. That is why it also
// carries rate limiting and why the handler is handed a cloneId it cannot
// override.

import { NextResponse } from "next/server";
import { authenticateModel, type Tenant, RATE_LIMIT_PER_MINUTE } from "./api-tenant";
import { supabaseAdmin } from "./supabase";

export const PUBLIC_API_VERSION = "v1";

// One system_logs row per (status, path) per minute, not per refused request: a
// wrong-key loop wrote one row per request. The row opening a window carries
// how many denials the previous window suppressed. Paths come from the fixed
// /api/v1/* routes, so the map stays tiny; the cap is a backstop.
const DENIED_WINDOW_MS = 60_000;
const DENIED_MAX_KEYS = 100;
const denied = new Map<string, { until: number; suppressed: number }>();

function logDenied(status: number, error: string, path: string, now = Date.now()): void {
  const key = `${status} ${path}`;
  const cur = denied.get(key);
  if (cur && now < cur.until) {
    cur.suppressed += 1;
    return;
  }
  if (!cur && denied.size >= DENIED_MAX_KEYS) denied.clear();
  denied.set(key, { until: now + DENIED_WINDOW_MS, suppressed: 0 });
  void supabaseAdmin
    .from("system_logs")
    .insert({
      level: "warn",
      source: "public-api",
      message: `public API denied (${status}) on ${path}`,
      detail: { status, error, path, suppressed: cur?.suppressed ?? 0 },
    })
    .then(
      () => undefined,
      () => undefined,
    );
}

// Every reply, error or not, is stamped and uncacheable: a shared cache must
// not replay a 401/429 for another caller, any more than a 200. A payload's
// own generatedAt (the /stats snapshot time) wins over the stamp.
function stamped(body: Record<string, unknown>, status: number, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json(
    { generatedAt: new Date().toISOString(), ...body },
    { status, headers: { ...headers, "Cache-Control": "private, no-store" } },
  );
}

export function publicError(error: string, status: number, headers?: Record<string, string>): NextResponse {
  return stamped({ ok: false, error }, status, headers);
}

// The handler receives the tenant and NEVER the raw request's clone parameter.
// A `?clone=` on this API would be the entire vulnerability in one line, so the
// signature is shaped to make reaching for one awkward.
type PublicHandler = (ctx: { req: Request; tenant: Tenant; params: URLSearchParams }) => Promise<NextResponse>;

export function withModelKey(handler: PublicHandler): (req: Request) => Promise<NextResponse> {
  return async (req: Request) => {
    const path = (() => {
      try {
        return new URL(req.url).pathname;
      } catch {
        return "?";
      }
    })();

    const auth = await authenticateModel(req);
    if (!auth.ok) {
      logDenied(auth.status, auth.error, path);
      const headers: Record<string, string> = {};
      if (auth.status === 401) headers["WWW-Authenticate"] = 'Bearer realm="twin"';
      if (auth.status === 429) headers["Retry-After"] = "60";
      if (auth.status === 503) headers["Retry-After"] = "10";
      return publicError(auth.error, auth.status, headers);
    }

    const params = (() => {
      try {
        return new URL(req.url).searchParams;
      } catch {
        return new URLSearchParams();
      }
    })();

    // A caller who passes ?clone= is either confused or probing. Say no loudly
    // rather than ignoring it, so nobody builds against a parameter that looks
    // accepted and silently does nothing.
    //
    // REJECTED FOR FLEET KEYS TOO, which is worth stating because the obvious
    // reading is that a key already allowed to see every clone loses nothing by
    // being allowed to name one. True today. The reason it stays rejected is
    // that accepting it would put a clone id on this API's surface at all, and
    // the next narrowing of a key's scope would then have to remember to take
    // it back off. A fleet key does not need the parameter: every clone is
    // already in the response.
    if (params.has("clone") || params.has("clone_id") || params.has("cloneId")) {
      return publicError(
        auth.tenant.scope === "fleet"
          ? "a clone parameter is not accepted; a fleet key already returns every model in one response"
          : "this API is scoped to the model your key belongs to; a clone parameter is not accepted",
        400,
      );
    }

    try {
      return await handler({ req, tenant: auth.tenant, params });
    } catch (e) {
      // The message can name RPCs and PG codes: log it here, never send it.
      console.error(`public API ${path} failed:`, e);
      return publicError("internal error", 500);
    }
  };
}

export function publicOk(payload: Record<string, unknown>): NextResponse {
  // no-store: this is live money. A shared cache between the caller and us
  // must never serve one key's numbers to another, or an old number as new.
  return stamped({ ok: true, version: PUBLIC_API_VERSION, ...payload }, 200, {
    "X-RateLimit-Limit": String(RATE_LIMIT_PER_MINUTE),
  });
}
