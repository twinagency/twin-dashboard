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

export async function middleware(req: NextRequest) {
  // ─── LOGIN DISABLED WHILE BUILDING ───────────────────────────────────────
  // Auth is bypassed in development (and whenever DASHBOARD_NO_AUTH is set) so we
  // + agents can view/screenshot the UI without the password. Production builds
  // (NODE_ENV=production) STILL enforce the login. Re-enable fully before deploy
  // by removing this block.
  if (process.env.NODE_ENV !== "production" || process.env.DASHBOARD_NO_AUTH === "true") {
    return withPathname(req);
  }

  const { pathname } = req.nextUrl;
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
