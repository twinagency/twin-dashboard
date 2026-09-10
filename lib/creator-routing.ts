export type CreatorPortal = "twin" | "tether" | "link";
export const CREATOR_PORTAL_COOKIE = "creator_portal";
export const TETHER_CREATOR_LOGIN_PATH = "/creator/tether/login";
export const TETHER_CREATOR_SIGNUP_PATH = "/creator/tether/signup";
export const LINK_CREATOR_LOGIN_PATH = "/creator/link/login";
export const LINK_CREATOR_SIGNUP_PATH = "/creator/link/signup";

// Presentation only. These values never select a creator, clone or permissions.
export function creatorPortal(value: unknown): CreatorPortal {
  return value === "link" || value === "lynq" ? "link" : value === "tether" ? "tether" : "twin";
}
export function creatorAuthPath(portal: CreatorPortal, page: "login" | "signup" | "forgot-password" | "reset-password"): string {
  return `${portal === "twin" ? "/creator" : `/creator/${portal}`}/${page}`;
}
export function creatorPortalCookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 30 };
}
export function isCreatorPublicPath(pathname: string | null | undefined): boolean {
  return pathname === "/creator/link" || (["twin", "tether", "link"] as const).some(portal =>
    (["login", "signup", "forgot-password", "reset-password"] as const).some(page => creatorAuthPath(portal, page) === pathname));
}
export function creatorPublicPortal(pathname: string | null | undefined): CreatorPortal {
  return pathname === "/creator/link" || pathname?.startsWith("/creator/link/") ? "link" : pathname?.startsWith("/creator/tether/") ? "tether" : "twin";
}
export function isCreatorAuthPath(pathname: string | null | undefined): boolean {
  return !!pathname && pathname.startsWith("/creator-auth/");
}
export function isCreatorPath(pathname: string | null | undefined): boolean {
  return pathname === "/creator" || !!pathname?.startsWith("/creator/");
}
export function safeCreatorNext(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/creator";
  try {
    const url = new URL(value, "https://creator.invalid");
    if (url.origin !== "https://creator.invalid" || !isCreatorPath(url.pathname) || isCreatorPublicPath(url.pathname)) return "/creator";
    return url.pathname + url.search;
  } catch { return "/creator"; }
}
