// Shared plumbing for every app/api/admin/v1/* route handler.
//
// The one rule: a route is authenticated by CALLING withAdmin, not by existing
// under a path. middleware.ts cannot be trusted for this (see lib/api-auth.ts),
// so the gate has to be something a new route can't silently inherit-and-skip.
// check-admin-api.ts asserts that every route file in app/api/admin/v1 imports
// withAdmin, which is what stops the next endpoint from being added unguarded.

import { NextResponse } from "next/server";
import { authenticateRequest, type AuthFailure } from "./api-auth";
import { supabaseAdmin } from "./supabase";
import { isQueryError, type QueryError } from "./api-read";

export const API_VERSION = "v1";

// Auth failures go to system_logs so a probe against this API is visible on the
// dashboard's own Logs page rather than only in container stdout. Successful
// reads are NOT logged: at one row per request they would bury the failures,
// and system_logs now has a 30-day pg_cron retention (migration 101) sized for
// bot traffic, not for an API poller.
function logDenied(f: AuthFailure, path: string, ip: string | null): void {
  void supabaseAdmin
    .from("system_logs")
    .insert({
      level: "warn",
      source: "admin-api",
      message: `admin API denied (${f.code}) on ${path}`,
      detail: { code: f.code, status: f.status, path, ip },
    })
    .then(
      () => undefined,
      () => undefined, // fire-and-forget: logging must never break the response
    );
}

export function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error }, { status });
}

export function fromQueryError(e: QueryError): NextResponse {
  return jsonError(e.error, e.status);
}

type Handler = (req: Request) => Promise<NextResponse> | NextResponse;

export function withAdmin(handler: Handler): Handler {
  return async (req: Request) => {
    const auth = authenticateRequest(req);
    if (!auth.ok) {
      const path = (() => {
        try {
          return new URL(req.url).pathname;
        } catch {
          return "?";
        }
      })();
      logDenied(auth, path, req.headers.get("x-forwarded-for"));
      // WWW-Authenticate on 401 so a CLI client knows what to send back.
      const headers = auth.status === 401 ? { "WWW-Authenticate": 'Bearer realm="twin-admin"' } : undefined;
      return NextResponse.json({ ok: false, error: auth.error, code: auth.code }, { status: auth.status, headers });
    }
    try {
      return await handler(req);
    } catch (e) {
      return jsonError(e instanceof Error ? e.message : "failed", 500);
    }
  };
}

// Wraps a payload with the envelope every endpoint shares, and refuses to ship
// a QueryError as if it were data.
export function ok(payload: Record<string, unknown>): NextResponse {
  return NextResponse.json({ ok: true, version: API_VERSION, ...payload });
}

export function okOrError(result: unknown): NextResponse {
  if (isQueryError(result)) return fromQueryError(result);
  return ok(result as Record<string, unknown>);
}
