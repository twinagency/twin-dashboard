import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { CREATOR_SESSION_COOKIE } from "@/lib/creator-session";
import { creatorRequestUrl } from "@/lib/creator-origin";
import { isLynqHost } from "@/lib/form-origin";
import { isMoxy } from "@/lib/agency-brand";
import { creatorDashboardIdentity } from "@/lib/creator-dashboard-identity";
import { CREATOR_PORTAL_COOKIE, creatorLoginPath, safeCreatorNext } from "@/lib/creator-routing";

async function clearCreatorSession() {
  (await cookies()).set(CREATOR_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

async function creatorLoginDestination(req: Request) {
  const jar = await cookies();
  const identity = await creatorDashboardIdentity(jar.get(CREATOR_SESSION_COOKIE)?.value);
  const destination = creatorLoginPath(identity, jar.get(CREATOR_PORTAL_COOKIE)?.value);
  // Moxy uses the shared Twin auth portal, but its trusted host or verified
  // account identity must keep logout/password recovery on its branded login.
  return destination === "/creator/login" && (isLynqHost(req) || isMoxy(identity?.name))
    ? "/creator/moxy/login" : destination;
}

// Allow a browser that lands on the logout URL to recover cleanly instead of
// being trapped on a 403. The creator dashboard still uses POST for sign-out.
export async function GET(req: Request) {
  const destination = await creatorLoginDestination(req);
  await clearCreatorSession();
  const url = creatorRequestUrl(req, destination);
  const next = new URL(req.url).searchParams.get("next");
  if (next) url.searchParams.set("next", safeCreatorNext(next));
  return NextResponse.redirect(url, 303);
}

export async function POST(req: Request) {
  const destination = await creatorLoginDestination(req);
  await clearCreatorSession();
  const url = creatorRequestUrl(req, destination);
  const next = new URL(req.url).searchParams.get("next");
  if (next) url.searchParams.set("next", safeCreatorNext(next));
  return NextResponse.redirect(url, 303);
}
