import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { CREATOR_SESSION_COOKIE } from "@/lib/creator-session";
import { creatorRequestUrl } from "@/lib/creator-origin";
import { creatorDashboardIdentity } from "@/lib/creator-dashboard-identity";
import { TETHER_PORTAL } from "@/lib/partner-portals";
import { TETHER_CREATOR_LOGIN_PATH } from "@/lib/creator-routing";

async function clearCreatorSession() {
  (await cookies()).set(CREATOR_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

async function creatorLoginDestination() {
  const jar = await cookies();
  const identity = await creatorDashboardIdentity(jar.get(CREATOR_SESSION_COOKIE)?.value);
  return identity?.name === TETHER_PORTAL.name ? TETHER_CREATOR_LOGIN_PATH : "/creator/login";
}

// Allow a browser that lands on the logout URL to recover cleanly instead of
// being trapped on a 403. The creator dashboard still uses POST for sign-out.
export async function GET(req: Request) {
  const destination = await creatorLoginDestination();
  await clearCreatorSession();
  return NextResponse.redirect(creatorRequestUrl(req, destination), 303);
}

export async function POST(req: Request) {
  const destination = await creatorLoginDestination();
  await clearCreatorSession();
  return NextResponse.redirect(creatorRequestUrl(req, destination), 303);
}
