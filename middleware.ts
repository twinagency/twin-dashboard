import { agencyCanManage, agencyManagementRequestAllowed } from "@/lib/agency-management-policy";
import { dashboardOrigin, trustedFormOrigin } from "@/lib/form-origin";
import { AGENCY_PORTAL_COOKIE, portalLoginPath } from "@/lib/agency-brand";
import { agencyIdentity } from "@/lib/agency-identity";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { isAgencyPath, agencyRequestAllowed, agencyDashboardPath, AGENCY_COOKIE } from "@/lib/agency-policy";

// Forwards the request pathname to server components via a header (layout.tsx
// needs it to know it's rendering /login specifically, since that route must
// never show the authed app shell — even under the dev bypass below).
function withPathname(req: NextRequest): NextResponse {
  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

// Canonical Twin administrator namespace. Partner cookies must never hijack it.
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

// ─── Routes that authenticate THEMSELVES, per request ────────────────────────
// These carry a bearer key, not a dashboard session cookie, so the session gate
// below must not touch them: it would redirect an API caller to /login and the
// caller would receive a 307 and an HTML page instead of its data.
//
// THIS IS NOT A HOLE. Every route under these prefixes calls its own gate
// (withAdmin for /api/admin, withModelKey for /api/v1) and refuses anything
// unauthenticated, in every environment, with no reference to NODE_ENV. Being
// exempt from the COOKIE check is not being exempt from auth.
//
// FOUND THE HARD WAY: all API testing ran against a dev server, where the block
// below returns early anyway, so this was invisible until someone asked whether
// the creator API really works from the open internet. It did not, in
// production, for either API. Trailing slashes are load-bearing — "/api/v1"
// alone would also match a future "/api/v1x".
const SELF_AUTHENTICATED_PREFIXES = ["/api/v1/", "/api/admin/"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/admin-auth") {
    if (req.method !== "POST" || req.headers.has("next-action")) return new NextResponse("Forbidden", {status:403});
    return withPathname(req);
  }
  // Public login is a native form endpoint, never a generic server-action entry.
  if (pathname === "/login" && !["GET","HEAD"].includes(req.method)) return new NextResponse("Forbidden",{status:403});

  // Agency routes have an independent identity. Never execute any Next server
  // action on this public entry point, even when its action ID is known.
  if (isAgencyPath(pathname)) {
    if (!agencyRequestAllowed(pathname, req.method, req.headers.has("next-action"))) {
      return new NextResponse("Read-only agency portal", { status: 403 });
    }
    const response = withPathname(req);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  // Checked BEFORE the dev bypass so the rule is identical in every
  // environment, which is the only way local testing says anything about
  // production behaviour.
  if (SELF_AUTHENTICATED_PREFIXES.some((p) => pathname.startsWith(p))) {
    return withPathname(req);
  }

  const adminToken = req.cookies.get(SESSION_COOKIE)?.value;
  const admin = await verifySessionToken(adminToken);
  const agencyToken = req.cookies.get(AGENCY_COOKIE)?.value;
  const portal = req.cookies.get(AGENCY_PORTAL_COOKIE)?.value;

  // /twin is the canonical master-admin namespace. It always checks the admin
  // session first and ignores remembered partner identity for routing purposes.
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

  // The bare hostname is only a router. It is never a blank page and never the
  // canonical admin URL.
  if (pathname === "/") {
    if (admin) return NextResponse.redirect(new URL(TWIN_ADMIN_PREFIX, dashboardOrigin(req)));
    if (agencyToken) {
      const identity = await agencyIdentity(agencyToken);
      if (identity) return NextResponse.redirect(new URL(portalLoginPath(portal), dashboardOrigin(req)));
    }
    if (portal) return NextResponse.redirect(new URL(portalLoginPath(portal), dashboardOrigin(req)));
    return NextResponse.redirect(new URL("/login", dashboardOrigin(req)));
  }

  // Once an admin is authenticated, keep browser navigation visibly inside the
  // /twin namespace. This prevents a stale partner cookie from ever taking over
  // a subsequent admin page click. APIs/auth endpoints are intentionally exempt.
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
    // The legacy compiler GET mutates data. Agencies use its POST counterpart.
    if (pathname === "/api/compile" && !isWrite) return new NextResponse("Use POST", {status:405});
    const embedded = pathname.match(/^\/clones\/([0-9a-f-]{36})/i)?.[1];
    const requested = embedded || req.nextUrl.searchParams.get("clone") || req.nextUrl.searchParams.get("cloneId");
    if (requested && !identity.cloneIds.includes(requested)) return new NextResponse("Creator access denied",{status:403});
    const response = withPathname(req);
    response.headers.set("Cache-Control","private, no-store");
    return response;
  }

  // ─── LOGIN DISABLED WHILE BUILDING ───────────────────────────────────────
  // Auth is bypassed in development (and whenever DASHBOARD_NO_AUTH is set) so we
  // + agents can view/screenshot the UI without the password. Production builds
  // (NODE_ENV=production) STILL enforce the login. Re-enable fully before deploy
  // by removing this block.
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
