// ── The route-side half of the OnlyFans read boundary ────────────────────
//
// Every /api/onlyfans/* route calls `requireOnlyFansRead()` before it does
// anything else. That is the one rule, and it mirrors lib/api-route.ts's
// "authenticated by CALLING, not by existing under a path": middleware.ts
// returns early with no auth at all when NODE_ENV !== "production", and its
// matcher covers /api/*, so a route that trusted middleware would be wide open
// on every dev server.
//
// The positive check is the internal operator session. `getDashboardAccess()`
// returning null is NOT authentication — it means "independently gated", and
// the dashboard's own reader treats it as such. So the session cookie is
// verified here on every request, and an agency or a view-as session is refused
// on top of that.
//
// Nothing in this file, or in the read service it hands off to, consults
// NODE_ENV or DASHBOARD_NO_AUTH. check-onlyfans-read.ts asserts that.

import { NextResponse, type NextRequest } from "next/server";
import { isAuthed } from "@/lib/auth";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { getViewAsBannerInfo } from "@/lib/view-as-banner";
import { configuredOnlyFansBackend, type OnlyFansBackend } from "./backend";
import { authorizeRead, denialBody, type ReadAuth, type ReadDenial, type ReadResult } from "./reads";

/** Private, never cached: conversation data is per-operator and per-account. */
export const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "X-Data-Mode": "live" } as const;

export type ReadContext = { auth: ReadAuth; backend: OnlyFansBackend | null };

export function denialResponse(denial: ReadDenial): NextResponse {
  return NextResponse.json(denialBody(denial), { status: denial.status, headers: PRIVATE_HEADERS });
}

/**
 * Establish who is asking, positively, before any backend work.
 *
 * Returns a `NextResponse` when the caller may not read at all, so a route is
 * three lines and cannot forget a gate:
 *
 *     const ctx = await requireOnlyFansRead();
 *     if (ctx instanceof NextResponse) return ctx;
 */
export async function requireOnlyFansRead(): Promise<ReadContext | NextResponse> {
  let agency: unknown = null;
  let viewAs: unknown = null;
  try {
    [agency, viewAs] = await Promise.all([getDashboardAccess(), getViewAsBannerInfo()]);
  } catch {
    // An expired agency session must not become "no identity, therefore the
    // internal operator". Refuse instead.
    return denialResponse({
      ok: false,
      status: 401,
      state: "denied",
      code: "session_unavailable",
      error: "Your dashboard session could not be verified. Sign in again.",
    });
  }

  const auth: ReadAuth = {
    // The positive half: this must be a verified session on THIS request.
    operatorSession: await isAuthed(),
    agency: !!agency,
    viewAs: !!viewAs,
  };

  const denial = authorizeRead(auth);
  if (denial) return denialResponse(denial);

  return { auth, backend: configuredOnlyFansBackend() };
}

export function readResponse<T>(result: ReadResult<T>): NextResponse {
  if (!result.ok) return denialResponse(result);
  return NextResponse.json(result.body, { status: 200, headers: PRIVATE_HEADERS });
}

/** A bounded, safe id, or null. The same shape rule the browser scope uses. */
export function requestId(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return /^[A-Za-z0-9._:-]{1,64}$/.test(trimmed) ? trimmed : null;
}

export function badRequest(error: string): NextResponse {
  return NextResponse.json(
    { ok: false, state: "error", code: "invalid_request", error },
    { status: 400, headers: PRIVATE_HEADERS },
  );
}

/** Kept so a route never reaches for the raw request object by habit. */
export type OnlyFansRouteRequest = NextRequest;
