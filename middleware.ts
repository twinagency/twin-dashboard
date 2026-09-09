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

function withPathname(req: NextRequest): NextResponse {
  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

const SELF_AUTHENTICATED_PREFIXES = ["/api/v1/", "/api/admin/"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isMarketingPath(pathname)) {
    if (!["GET", "HEAD"].includes(req.method) || req.headers.has("next-action")) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    const response = withPathname(req);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }

  // Creator auth is fully separate from admin and agency identity. Form posts
  // are same-origin only; creator pages never inherit the admin dev bypass.
  if (isCreatorAuthPath(pathname)) {
    if (req.method !== "POST" || req.headers.has("next-action") || !trustedFormOrigin(req)) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    return withPathname(req);
  }

  if (isCreatorPublicPath(pathname)) {
    if (!["GET", "HEAD"].includes(req.method) || req.headers.has("next-action")) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    const creator = await verifyCreatorSession(req.cookies.get(CREATOR_SESSION_COOKIE)?.value);
    if (creator) {
      const response = NextResponse.redirect(new URL(safeCreatorNext(req.nextUrl.searchParams.get("next")), dashboardOrigin(req)));
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
    const response = withPathname(req);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  if (isCreatorPath(pathname)) {
    if (!["GET", "HEAD"].includes(req.method) || req.headers.has("next-action")) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    const creator = await verifyCreatorSession(req.cookies.get(CREATOR_SESSION_COOKIE)?.value);
    if (!creator) {
      const url = new URL("/creator/login", dashboardOrigin(req));
      url.searchParams.set("next", safeCreatorNext(pathname + req.nextUrl.search));
      return NextResponse.redirect(url);
    }
    const response = withPathname(req);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  if (pathname === "/admin-auth") {
    if (req.method !== "POST" || req.headers.has("next-action")) return new NextResponse("Forbidden", {status:403});
    return withPathname(req);
  }

  if (isTwinLoginPath(pathname)) {
    if (!["GET", "HEAD"].includes(req.method) || req.headers.has("next-action")) return new NextResponse("Forbidden", {status:403});
    if (pathname === "/login" && !req.cookies.has(AGENCY_COOKIE) && await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) {
      const response = NextResponse.redirect(new URL(safeAdminNext(req.nextUrl.searchParams.get("next")), dashboardOrigin(req)));
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
    const response = withPathname(req);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  if (pathname.startsWith("/brand/") && /\.(?:png|jpg|webp|svg)$/.test(pathname)) {
    if (!["GET", "HEAD"].includes(req.method) || req.headers.has("next-action")) return new NextResponse("Forbidden", {status:403});
    return withPathname(req);
  }

  if (isAgencyPath(pathname)) {
    if (!agencyRequestAllowed(pathname, req.method, req.headers.has("next-action"))) {
      return new NextResponse("Read-only agency portal", { status: 403 });
    }
    const response = withPathname(req);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  if (SELF_AUTHENTICATED_PREFIXES.some((p) => pathname.startsWith(p))) {
    return withPathname(req);
  }

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
    const response = withPathname(req);
    response.headers.set("Cache-Control","private, no-store");
    return response;
  }

  if (process.env.NODE_ENV !== "production") {
    return withPathname(req);
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const authed = await verifySessionToken(token);

  if (!authed) {
    if (req.cookies.get(AGENCY_PORTAL_COOKIE)?.value === "moxy") return NextResponse.redirect(new URL("/moxy", dashboardOrigin(req)));
    const url = new URL("/twin", dashboardOrigin(req));
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return withPathname(req);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png).*)"],
};
