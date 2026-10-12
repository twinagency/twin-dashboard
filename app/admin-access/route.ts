import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { verifyOwnerSession } from "@/lib/owner-auth";
import { dashboardOrigin, trustedFormOrigin } from "@/lib/form-origin";
import { SESSION_COOKIE } from "@/lib/session";
import { ownerShortcutPage } from "@/lib/owner-shortcut";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function privateResponse(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export async function GET(req: NextRequest) {
  if (req.headers.has("next-action")) return privateResponse(new NextResponse("Forbidden", { status: 403 }));
  // The credential is a URL fragment, never a query/path or server-rendered value.
  const nonce = randomBytes(24).toString("base64");
  const response = privateResponse(new NextResponse(ownerShortcutPage(nonce), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  }));
  response.headers.set("Content-Security-Policy",
    `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
  return response;
}

export async function HEAD() {
  return privateResponse(new NextResponse(null, { status: 204 }));
}

export async function POST(req: NextRequest) {
  if (req.headers.has("next-action") || !trustedFormOrigin(req))
    return privateResponse(new NextResponse("Forbidden", { status: 403 }));
  if (req.headers.get("content-type")?.split(";")[0].trim() !== "text/plain"
    || Number(req.headers.get("content-length") || "0") > 70)
    return privateResponse(new NextResponse("Invalid request", { status: 400 }));
  let token: string;
  try { token = await req.text(); } catch {
    return privateResponse(new NextResponse("Invalid request", { status: 400 }));
  }
  // Reuse the existing database-backed owner authentication. No signing, owner
  // creation, expiry extension, static key, or credential supplied through a URL.
  if (!/^owner_[a-f0-9]{64}$/.test(token) || !await verifyOwnerSession(token))
    return privateResponse(new NextResponse("This admin link has expired or was revoked. Please sign in.", { status: 401 }));
  const response = privateResponse(NextResponse.json({ destination: new URL("/revenue", dashboardOrigin(req)).href }));
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  // Match the existing login's role-cookie cleanup and also leave view-as mode.
  // These are presentation/alternate-identity cookies, never the owner session.
  for (const name of ["twin_creator_session", "twin_creator_portal", "twin_agency_access",
    "twin_agency_portal", "clone_scope", "twin_admin_view_as"]) response.cookies.delete(name);
  return response;
}

