import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { CREATOR_SESSION_COOKIE } from "@/lib/creator-session";
import { creatorRequestUrl } from "@/lib/creator-origin";
import { creatorDashboardIdentity } from "@/lib/creator-dashboard-identity";
import { TETHER_PORTAL } from "@/lib/partner-portals";
import { isLynq } from "@/lib/agency-brand";
import { CREATOR_PORTAL_COOKIE, creatorPortal, creatorAuthPath, creatorPortalCookieOptions } from "@/lib/creator-routing";
async function signOut(req: Request) {
  const jar = await cookies();
  const identity = await creatorDashboardIdentity(jar.get(CREATOR_SESSION_COOKIE)?.value);
  const portal = isLynq(identity?.name) ? "link" : identity?.name === TETHER_PORTAL.name ? "tether" : creatorPortal(jar.get(CREATOR_PORTAL_COOKIE)?.value);
  jar.set(CREATOR_SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  jar.set(CREATOR_PORTAL_COOKIE, portal, creatorPortalCookieOptions());
  return NextResponse.redirect(creatorRequestUrl(req, creatorAuthPath(portal, "login")), 303);
}
// Preserve direct-browser recovery without returning the creator to Twin.
export const GET = signOut;
export const POST = signOut;
