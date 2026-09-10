import { isMarketingPath } from "@/lib/marketing-routing";
import { isTwinLoginPath, safeAdminNext } from "@/lib/login-routing";
import { agencyCanManage, agencyManagementRequestAllowed } from "@/lib/agency-management-policy";
import { dashboardOrigin, trustedFormOrigin } from "@/lib/form-origin";
import { AGENCY_PORTAL_COOKIE, portalLoginPath } from "@/lib/agency-brand";
import { agencyIdentity } from "@/lib/agency-identity";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { CREATOR_SESSION_COOKIE, verifyCreatorSession } from "@/lib/creator-session";
import { isCreatorAuthPath, isCreatorPath, isCreatorPublicPath, safeCreatorNext } from "@/lib/creator-routing";
import { isAgencyPath, agencyRequestAllowed, agencyDashboardPath, AGENCY_COOKIE } from "@/lib/agency-policy";
import { creatorDashboardIdentity } from "@/lib/creator-dashboard-identity";
import { CREATOR_AUDIENCE_HEADER, isCreatorDashboardPath, creatorApiAllowed, assertCreatorQuery, creatorDashboardAlias } from "@/lib/creator-dashboard-policy";

function withPathname(req: NextRequest, creator = false): NextResponse {
  const headers = new Headers(req.headers);
  headers.delete(CREATOR_AUDIENCE_HEADER);
  headers.set("x-pathname", req.nextUrl.pathname);
  if (creator) headers.set(CREATOR_AUDIENCE_HEADER, "creator");
  return NextResponse.next({ request: { headers } });
}
function privateResponse(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
function creatorReferrer(req: NextRequest): boolean {
  try {
    const referrer = new URL(req.headers.get("referer") || "");
    return referrer.origin === dashboardOrigin(req) && isCreatorPath(referrer.pathname);
  } catch { return false; }
}
const SELF_AUTHENTICATED_PREFIXES = ["/api/v1/", "/api/admin/"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isMarketingPath(pathname)) {
    if (!["GET", "HEAD"].includes(req.method) || req.headers.has("next-action")) return new NextResponse("Forbidden", { status: 403 });
    const response = privateResponse(withPathname(req));
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }
  // Keep the concurrent main-branch logout recovery fix: external browsers
  // landing here must be able to clear a stale creator cookie using GET.
  if (pathname === "/creator-auth/logout" && ["GET", "HEAD"].includes(req.method) && !req.headers.has("next-action")) return privateResponse(withPathname(req));
  // Auth handlers independently verify their credentials/creator session.
  if (isCreatorAuthPath(pathname)) {
    if (req.method !== "POST" || req.headers.has("next-action") || !trustedFormOrigin(req)) return new NextResponse("Forbidden", { status: 403 });
    return privateResponse(withPathname(req));
  }
  if (isCreatorPublicPath(pathname)) {
    if (!["GET", "HEAD"].includes(req.method) || req.headers.has("next-action")) return new NextResponse("Forbidden", { status: 403 });
    let creator = null;
    try { creator = await verifyCreatorSession(req.cookies.get(CREATOR_SESSION_COOKIE)?.value); } catch { /* malformed cookies cannot authenticate */ }
    if (creator && ["/creator/login", "/creator/signup"].includes(pathname)) return privateResponse(NextResponse.redirect(new URL(safeCreatorNext(req.nextUrl.searchParams.get("next")), dashboardOrigin(req))));
    return privateResponse(withPathname(req));
  }
  if (isCreatorPath(pathname)) {
    if (!["GET", "HEAD"].includes(req.method) || req.headers.has("next-action")) return new NextResponse("Forbidden", { status: 403 });
    if (!isCreatorDashboardPath(pathname) && pathname !== "/creator/onboarding") return new NextResponse("Creator page not found", { status: 404 });
    const creator = await creatorDashboardIdentity(req.cookies.get(CREATOR_SESSION_COOKIE)?.value);
    if (!creator) {
      const url = new URL("/creator/login", dashboardOrigin(req));
      url.searchParams.set("next", safeCreatorNext(pathname + req.nextUrl.search));
      const response = privateResponse(NextResponse.redirect(url));
      response.cookies.delete(CREATOR_SESSION_COOKIE);
      return response;
    }
    try { assertCreatorQuery(req.nextUrl.searchParams, creator.cloneIds); } catch { return new NextResponse("Creator access denied", { status: 403 }); }
    if (isCreatorDashboardPath(pathname) && !creator.onboarded) return privateResponse(NextResponse.redirect(new URL("/creator/onboarding", dashboardOrigin(req))));
    return privateResponse(withPathname(req, isCreatorDashboardPath(pathname)));
  }
  if (pathname === "/admin-auth") {
    if (req.method !== "POST" || req.headers.has("next-action")) return new NextResponse("Forbidden", {status:403});
    return withPathname(req);
  }
  if (isTwinLoginPath(pathname)) {
    if (!["GET", "HEAD"].includes(req.method) || req.headers.has("next-action")) return new NextResponse("Forbidden", {status:403});
    if (pathname === "/login" && !req.cookies.has(AGENCY_COOKIE) && await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) return privateResponse(NextResponse.redirect(new URL(safeAdminNext(req.nextUrl.searchParams.get("next")), dashboardOrigin(req))));
    return privateResponse(withPathname(req));
  }
  if (pathname.startsWith("/brand/") && /\.(?:png|jpg|webp|svg)$/.test(pathname)) {
    if (!["GET", "HEAD"].includes(req.method) || req.headers.has("next-action")) return new NextResponse("Forbidden", {status:403});
    return withPathname(req);
  }
  if (isAgencyPath(pathname)) {
    if (!agencyRequestAllowed(pathname, req.method, req.headers.has("next-action"))) return new NextResponse("Read-only agency portal", { status: 403 });
    return privateResponse(withPathname(req));
  }
  // Shared earnings/media widgets use existing live APIs. Page context selects
  // the audience only; a verified current creator account is always required.
  const creatorToken = req.cookies.get(CREATOR_SESSION_COOKIE)?.value;
  const useCreator = creatorReferrer(req) || (!!creatorToken && !req.cookies.has(AGENCY_COOKIE) && !req.cookies.has(SESSION_COOKIE));
  if (useCreator) {
    const creator = await creatorDashboardIdentity(creatorToken);
    if (!creator || !creator.onboarded) return privateResponse(NextResponse.json({ error: "Creator access unavailable. Please sign in again." }, { status: 403 }));
    try { assertCreatorQuery(req.nextUrl.searchParams, creator.cloneIds); } catch { return new NextResponse("Creator access denied", { status: 403 }); }
    if (creatorApiAllowed(pathname, req.method, req.headers.has("next-action"))) return privateResponse(withPathname(req, true));
    if (["GET", "HEAD"].includes(req.method) && !req.headers.has("next-action")) {
      const alias = creatorDashboardAlias(pathname, req.nextUrl.searchParams, creator.cloneIds);
      if (alias) return privateResponse(NextResponse.redirect(new URL(alias + req.nextUrl.search, dashboardOrigin(req))));
    }
    return new NextResponse("This page or setting is not available to creators", { status: 403 });
  }
  if (SELF_AUTHENTICATED_PREFIXES.some((p) => pathname.startsWith(p))) return withPathname(req);
  const agencyToken = req.cookies.get(AGENCY_COOKIE)?.value;
  if (agencyToken) {
    const identity = await agencyIdentity(agencyToken);
    if (!identity) return NextResponse.redirect(new URL(portalLoginPath(req.cookies.get(AGENCY_PORTAL_COOKIE)?.value),dashboardOrigin(req)));
    const canManage = agencyCanManage(identity);
    const serverAction = req.headers.has("next-action");
    const isWrite = serverAction || !["GET", "HEAD"].includes(req.method);
    if (isWrite && (!canManage || !agencyManagementRequestAllowed(pathname,req.method,serverAction))) return new NextResponse("Administrator access required", {status:403});
    if (isWrite && !trustedFormOrigin(req)) return new NextResponse("Untrusted request origin", {status:403});
    if (!agencyDashboardPath(pathname, identity.name, canManage)) return new NextResponse("Administrator access required", {status:403});
    if (pathname === "/api/compile" && !isWrite) return new NextResponse("Use POST", {status:405});
    const embedded = pathname.match(/^\/clones\/([0-9a-f-]{36})/i)?.[1];
    const requested = embedded || req.nextUrl.searchParams.get("clone") || req.nextUrl.searchParams.get("cloneId");
    if (requested && !identity.cloneIds.includes(requested)) return new NextResponse("Creator access denied",{status:403});
    return privateResponse(withPathname(req));
  }
  if (process.env.NODE_ENV !== "production") return withPathname(req);
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const authed = await verifySessionToken(token);
  if (!authed) {
    if (req.cookies.get(AGENCY_PORTAL_COOKIE)?.value === "moxy") return NextResponse.redirect(new URL("/moxy", dashboardOrigin(req)));
    const url = new URL("/twin", dashboardOrigin(req)); url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return withPathname(req);
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png).*)"] };
