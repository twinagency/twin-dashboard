import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { CREATOR_SESSION_COOKIE } from "@/lib/creator-session";
import { creatorRequestUrl } from "@/lib/creator-origin";

async function clearCreatorSession() {
  (await cookies()).set(CREATOR_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

// Allow a browser that lands on the logout URL to recover cleanly instead of
// being trapped on a 403. The creator dashboard still uses POST for sign-out.
export async function GET(req: Request) {
  await clearCreatorSession();
  return NextResponse.redirect(creatorRequestUrl(req, "/creator/login"), 303);
}

export async function POST(req: Request) {
  await clearCreatorSession();
  return NextResponse.redirect(creatorRequestUrl(req, "/creator/login"), 303);
}
