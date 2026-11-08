/** Request-side authentication; absent access is never proof of an operator. */
import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/session";
import { agencyCanManage } from "@/lib/agency-management-policy";
import { agencyGrant, agencyScopedFetch } from "./agency-scope";
import { configuredBackendPurpose } from "./backend-transport";
import type { AgencyIdentity } from "@/lib/agency-identity";
import { isAuthed } from "@/lib/auth";
import { planCOwnerActor } from "./plan-c-owner";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { getViewAsBannerInfo } from "@/lib/view-as-banner";
import { configuredOnlyFansBackend, type OnlyFansBackend } from "./backend";
import { authorizeRead, denialBody, type ReadAuth, type ReadDenial, type ReadResult } from "./reads";

/** Private, never cached: conversation data is per-operator and per-account. */
export const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "X-Data-Mode": "live" } as const;

export type ReadContext = { auth: ReadAuth; backend: OnlyFansBackend | null; fetch: typeof fetch; actor: string | null; pilotActor?: string | null; canManage: boolean; canChat: boolean };

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
export async function requireOnlyFansRead(options: { agency?: boolean; write?: boolean; capability?: "chat" | "manage"; pilotIdentity?: boolean } = {}): Promise<ReadContext | NextResponse> {
  let agency: (AgencyIdentity & { kind?: string }) | null = null;
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

  const grant = options.agency && agency && agency.kind !== "creator" && !viewAs && agency.name !== "Twin Technologies"
    ? agencyGrant(agency, agencyCanManage(agency)) : null;
  const auth: ReadAuth = {
    // The positive half: this must be a verified session on THIS request.
    operatorSession: await isAuthed(),
    agency: !!agency,
    viewAs: !!viewAs,
    ...(grant ? { agencyGrant: grant } : {}),
  };

  const denial = authorizeRead(auth);
  if (denial) return denialResponse(denial);

  const canManage = grant ? grant.canManage : true;
  const canChat = canManage || grant?.canChat === true;
  if (options.write && !(options.capability === "chat" ? canChat : canManage)) return denialResponse({ ok: false, status: 403, state: "denied", code: "agency_read_only", error: "Your team access is read-only." });
  const purpose = configuredBackendPurpose("API");
  const scopedFetch = grant && purpose ? agencyScopedFetch(grant, purpose) : fetch;
  // An unavailable read credential must never yield an unscoped write transport.
  if (grant && !purpose) return denialResponse({ ok: false, status: 503, state: "unavailable", code: "agency_unavailable", error: "Scoped agency access is not configured." });
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const actor = grant?.actor ?? (token ? `op-session:${createHash("sha256").update(token).digest("hex")}` : null);
  const pilotActor = options.pilotIdentity && auth.operatorSession && !auth.agency && !auth.viewAs
    ? await planCOwnerActor(token) : null;
  return { auth, backend: configuredOnlyFansBackend(scopedFetch), fetch: scopedFetch, actor, pilotActor, canManage, canChat };
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
