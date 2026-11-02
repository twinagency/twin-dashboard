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

function logDenied(status: number, error: string, path: string): void {
  void supabaseAdmin
    .from("system_logs")
    .insert({
      level: "warn",
      source: "public-api",
      message: `public API denied (${status}) on ${path}`,
      detail: { status, error, path },
    })
    .then(
      () => undefined,
      () => undefined,
    );
}

export function publicError(error: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error }, { status });
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
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status, headers });
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
      return publicError(e instanceof Error ? e.message : "failed", 500);
    }
  };
}

export function publicOk(payload: Record<string, unknown>): NextResponse {
  return NextResponse.json(
    { ok: true, version: PUBLIC_API_VERSION, generatedAt: new Date().toISOString(), ...payload },
    // no-store: this is live money. A shared cache between the caller and us
    // must never serve one key's numbers to another, or an old number as new.
    { headers: { "X-RateLimit-Limit": String(RATE_LIMIT_PER_MINUTE), "Cache-Control": "private, no-store" } },
  );
}
