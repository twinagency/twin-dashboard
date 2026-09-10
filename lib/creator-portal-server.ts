import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { CREATOR_PORTAL_COOKIE, normalizeCreatorPortal, type CreatorPortal } from "./creator-portal";

export async function getCreatorPortal(requested?: unknown): Promise<CreatorPortal> {
  return normalizeCreatorPortal(requested) || normalizeCreatorPortal((await cookies()).get(CREATOR_PORTAL_COOKIE)?.value) || "twin";
}

// Keep branding on failed logins, successful logins and later sign-outs. The
// existing handler still independently authenticates the user and resolves the
// creator account. Do not derive any permission or demo access from this hint.
export function withCreatorPortal(handler: (req: Request) => Promise<NextResponse>) {
  return async (req: Request): Promise<NextResponse> => {
    const form = await req.clone().formData();
    const portal = await getCreatorPortal(form.get("portal"));
    const response = await handler(req);
    response.cookies.set(CREATOR_PORTAL_COOKIE, portal, {
      path: "/", httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 60 * 60 * 24 * 30,
    });
    const location = response.headers.get("location");
    if (location) {
      const url = new URL(location, req.url);
      if (["/creator/login", "/creator/signup"].includes(url.pathname)) {
        url.searchParams.set("portal", portal);
        response.headers.set("location", url.href);
      }
    }
    return response;
  };
}
