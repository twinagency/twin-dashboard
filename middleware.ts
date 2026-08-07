import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// Forwards the request pathname to server components via a header (layout.tsx
// needs it to know it's rendering /login specifically, since that route must
// never show the authed app shell — even under the dev bypass below).
function withPathname(req: NextRequest): NextResponse {
  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
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

  // Checked BEFORE the dev bypass so the rule is identical in every
  // environment, which is the only way local testing says anything about
  // production behaviour.
  if (SELF_AUTHENTICATED_PREFIXES.some((p) => pathname.startsWith(p))) {
    return withPathname(req);
  }

  // ─── LOGIN DISABLED WHILE BUILDING ───────────────────────────────────────
  // Auth is bypassed in development (and whenever DASHBOARD_NO_AUTH is set) so we
  // + agents can view/screenshot the UI without the password. Production builds
  // (NODE_ENV=production) STILL enforce the login. Re-enable fully before deploy
  // by removing this block.
  if (process.env.NODE_ENV !== "production" || process.env.DASHBOARD_NO_AUTH === "true") {
    return withPathname(req);
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const authed = await verifySessionToken(token);

  if (pathname === "/login") {
    if (authed) return NextResponse.redirect(new URL("/", req.url));
    return withPathname(req);
  }

  if (!authed) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return withPathname(req);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png).*)"],
};
