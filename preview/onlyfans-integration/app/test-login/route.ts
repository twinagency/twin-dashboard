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
  const response = NextResponse.redirect(new URL("/onlyfans/inbox?creator=creator-acc-a&account=acc-a", url));
  response.cookies.set(SESSION_COOKIE, await signSession(), { httpOnly: true, sameSite: "strict", path: "/" });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
