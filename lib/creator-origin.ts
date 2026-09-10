import { CREATOR_PORTAL_COOKIE, creatorPortal, creatorAuthPath } from "./creator-routing";
export function creatorRequestUrl(req: Request, path: string): URL {
  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || req.headers.get("host") || "dashboard.tgaiclone.xyz";
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto || (host.includes("localhost") || host.startsWith("127.") ? "http" : "https");
  // An expired onboarding/upload session must return to the remembered creator
  // login. Explicit login/signup form destinations remain unchanged. The cookie
  // selects only one of three fixed public paths, never an origin or authority.
  if (path === "/creator/login" && ["/creator-auth/onboarding", "/creator-auth/upload"].includes(new URL(req.url).pathname)) {
    const entry = (req.headers.get("cookie") || "").split(";").map(value => value.trim()).find(value => value.startsWith(`${CREATOR_PORTAL_COOKIE}=`));
    path = creatorAuthPath(creatorPortal(entry?.slice(CREATOR_PORTAL_COOKIE.length + 1)), "login");
  }
  return new URL(path, `${proto}://${host}`);
}
