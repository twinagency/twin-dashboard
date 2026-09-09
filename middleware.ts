import { agencyCanManage, agencyManagementRequestAllowed } from "@/lib/agency-management-policy";
import { dashboardOrigin, trustedFormOrigin } from "@/lib/form-origin";
import { AGENCY_PORTAL_COOKIE, portalLoginPath } from "@/lib/agency-brand";
import { agencyIdentity } from "@/lib/agency-identity";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { isAgencyPath, agencyRequestAllowed, agencyDashboardPath, AGENCY_COOKIE } from "@/lib/agency-policy";

function withPathname(req: NextRequest): NextResponse {
  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

const TWIN_ADMIN_PREFIX = "/twin";

function isTwinAdminPath(pathname: string): boolean {
  return pathname === TWIN_ADMIN_PREFIX || pathname.startsWith(`${TWIN_ADMIN_PREFIX}/`);
}

function stripTwinPrefix(pathname: string): string {
  if (pathname === TWIN_ADMIN_PREFIX) return "/";
  const stripped = pathname.slice(TWIN_ADMIN_PREFIX.length);
  return stripped.startsWith("/") ? stripped : `/${stripped}`;
}

function twinAdminPath(pathname: string): string {
  if (pathname === "/") return TWIN_ADMIN_PREFIX;
  return `${TWIN_ADMIN_PREFIX}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

const SELF_AUTHENTICATED_PREFIXES = ["/api/v1/", "/api/admin/"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/admin-auth") {
    if (req.method !== "POST" || req.headers.has("next-action")) return new NextResponse("Forbidden", {status:403});
    return withPathname(req);
  }

  if (pathname === "/login" && !["GET","HEAD"].includes(req.method)) {
    return new NextResponse("Forbidden", {status:403});
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

  const adminToken = req.cookies.get(SESSION_COOKIE)?.value;
  const admin = await verifySessionToken(adminToken);
  const agencyToken = req.cookies.get(AGENCY_COOKIE)?.value;
  const portal = req.cookies.get(AGENCY_PORTAL_COOKIE)?.value;

  // Canonical Twin admin entry. Stale Moxy/Link cookies never override it.
  if (isTwinAdminPath(pathname)) {
    if (!admin) {
      const url = new URL("/login", dashboardOrigin(req));
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }

    const internalPath = stripTwinPrefix(pathname);
    const rewritten = req.nextUrl.clone();
    rewritten.pathname = internalPath;
    const headers = new Headers(req.headers);
    headers.set("x-pathname", internalPath);
    headers.set("x-admin-prefix", TWIN_ADMIN_PREFIX);
    const response = NextResponse.rewrite(rewritten, { request: { headers } });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  // Bare hostname is always the neutral Twin entry. It no longer remembers or
  // redirects to the last partner portal used in this browser.
  if (pathname === "/") {
    if (admin) return NextResponse.redirect(new URL(TWIN_ADMIN_PREFIX, dashboardOrigin(req)));
    return NextResponse.redirect(new URL("/login?next=/twin", dashboardOrigin(req)));
  }

  // Keep authenticated admin browser navigation visibly under /twin.
  if (
    admin &&
    ["GET", "HEAD"].includes(req.method) &&
    pathname !== "/login" &&
    !pathname.startsWith("/api/") &&
    !pathname.startsWith("/_next/")
  ) {
    return NextResponse.redirect(new URL(twinAdminPath(pathname), dashboardOrigin(req)));
  }

  // Partner identity applies only when there is no active administrator session.
  if (agencyToken && !admin && pathname !== "/login") {
    const identity = await agencyIdentity(agencyToken);
    if (!identity) return NextResponse.redirect(new URL(portalLoginPath(portal),dashboardOrigin(req)));
    const canManage = agencyCanManage(identity);
    const serverAction = req.headers.has("next-action");
    const isWrite = serverAction || !["GET", "HEAD"].includes(req.method);
    if (isWrite && (!canManage || !agencyManagementRequestAllowed(pathname,req.method,serverAction))) return new NextResponse("Administrator access required", {status:403});
    if (isWrite && !trustedFormOrigin(req)) return new NextResponse("Untrusted request origin",{status:403});
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

  if (pathname === "/login") {
    if (authed) {
      const next = req.nextUrl.searchParams.get("next") || TWIN_ADMIN_PREFIX;
      const safe = next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : TWIN_ADMIN_PREFIX;
      return NextResponse.redirect(new URL(safe, dashboardOrigin(req)));
    }
    return withPathname(req);
  }

  if (!authed) {
    if (portal) return NextResponse.redirect(new URL(portalLoginPath(portal), dashboardOrigin(req)));
    const url = new URL("/login", dashboardOrigin(req));
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return withPathname(req);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png).*)"],
};
