// Isolated local demo only. This directory is not mounted by the real app.
import { NextResponse } from "next/server";
import { constantTimeEqual, signSession, SESSION_COOKIE } from "@/lib/session";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const expected = process.env.SYNTHETIC_DEMO_LOGIN_TOKEN;
  const supplied = url.searchParams.get("token") ?? "";
  if (!expected || !["localhost", "127.0.0.1"].includes(url.hostname) || !constantTimeEqual(supplied, expected)) {
    return NextResponse.json({ error: "Unavailable" }, { status: 404 });
  }
  // Next may normalise request.url to localhost despite a 127.0.0.1 Host.
  // Set the cookie and browser navigation on the configured test origin so the
  // existing exact-origin write protection and the session agree.
  const origin = new URL(process.env.DASHBOARD_PUBLIC_ORIGIN || url.origin);
  if (origin.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(origin.hostname) ||
      origin.username || origin.password || origin.port !== url.port) {
    return NextResponse.json({ error: "Unavailable" }, { status: 404 });
  }
  if (request.headers.get("host") !== origin.host) {
    const login = new URL("/test-login", origin);
    login.searchParams.set("token", supplied);
    const redirect = NextResponse.redirect(login);
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  }
  const response = NextResponse.redirect(new URL("/onlyfans/inbox?creator=creator-acc-a&account=acc-a", origin));
  response.cookies.set(SESSION_COOKIE, await signSession(), { httpOnly: true, sameSite: "strict", path: "/" });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
