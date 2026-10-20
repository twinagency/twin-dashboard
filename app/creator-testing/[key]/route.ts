import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { creatorDashboardIdentity } from "@/lib/creator-dashboard-identity";
import { CREATOR_SESSION_COOKIE, creatorCookieOptions, signCreatorSession } from "@/lib/creator-session";
import { CREATOR_PORTAL_COOKIE, creatorPortalCookieOptions } from "@/lib/creator-routing";
import { dashboardOrigin } from "@/lib/form-origin";
import { AGENCY_COOKIE } from "@/lib/agency-policy";
import { AGENCY_PORTAL_COOKIE } from "@/lib/agency-brand";
import { SESSION_COOKIE } from "@/lib/session";
import { CLONE_SCOPE_COOKIE } from "@/lib/clone-scope";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Owner-requested testing entry, bound to the existing isolated test creator.
// The raw key is delivered privately and never committed. Both link and session
// expire at this fixed deadline; this route cannot grant another account access.
const KEY_SHA256 = "080e18e213f11004d719d9c582a9f609427d799ca7d9eaf26e32fba66e06e0b9";
const EXPIRES_AT = 1792564200000;
const ACCOUNT_ID = "f80d1add-d10c-4039-90f3-99e6cfc04b91";
const USER_ID = "5d886965-4c7a-41fc-9d90-bebd1ba22c7b";

function privateResponse(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
const unavailable = () => privateResponse(new NextResponse("This testing link is unavailable or has expired.", { status: 404 }));

export async function GET(req: NextRequest, context: { params: Promise<{ key: string }> }) {
  const { key } = await context.params;
  if (req.headers.has("next-action") || Date.now() >= EXPIRES_AT || !/^[a-f0-9]{64}$/.test(key)) return unavailable();
  const digest = createHash("sha256").update(key).digest();
  if (!timingSafeEqual(digest, Buffer.from(KEY_SHA256, "hex"))) return unavailable();
  try {
    const token = await signCreatorSession(ACCOUNT_ID, USER_ID, EXPIRES_AT);
    const identity = await creatorDashboardIdentity(token);
    if (!identity || identity.accountId !== ACCOUNT_ID || identity.userId !== USER_ID || identity.readOnly) return unavailable();
    const response = privateResponse(NextResponse.redirect(new URL("/creator/platforms", dashboardOrigin(req)), 303));
    response.cookies.set(CREATOR_SESSION_COOKIE, token, { ...creatorCookieOptions(), maxAge: Math.max(0, Math.floor((EXPIRES_AT - Date.now()) / 1000)) });
    response.cookies.set(CREATOR_PORTAL_COOKIE, "twin", creatorPortalCookieOptions());
    response.cookies.delete(AGENCY_COOKIE);
    response.cookies.delete(AGENCY_PORTAL_COOKIE);
    response.cookies.delete(SESSION_COOKIE);
    response.cookies.delete(CLONE_SCOPE_COOKIE);
    return response;
  } catch { return unavailable(); }
}

// Preview crawlers receive no session.
export async function HEAD() { return unavailable(); }
