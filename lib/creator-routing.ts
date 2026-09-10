import { LYNQ_PORTAL, TETHER_PORTAL } from "./partner-portals";

export const LINK_CREATOR_LOGIN_PATH = "/creator/link/login";
export const LINK_CREATOR_SIGNUP_PATH = "/creator/link/signup";
export const LINK_CREATOR_FORGOT_PASSWORD_PATH = "/creator/link/forgot-password";
export const LINK_CREATOR_RESET_PASSWORD_PATH = "/creator/link/reset-password";
export const TETHER_CREATOR_LOGIN_PATH = "/creator/tether/login";
export const TETHER_CREATOR_SIGNUP_PATH = "/creator/tether/signup";
export const CREATOR_PORTAL_COOKIE = "twin_creator_portal";

export type CreatorPublicPortal = "link" | "tether" | "twin";

export function normalizeCreatorPublicPortal(value: unknown): CreatorPublicPortal {
  return value === "link" || value === "tether" ? value : "twin";
}

export function creatorPublicLoginPath(portal: CreatorPublicPortal): string {
  if (portal === "link") return LINK_CREATOR_LOGIN_PATH;
  if (portal === "tether") return TETHER_CREATOR_LOGIN_PATH;
  return "/creator/login";
}

export function isCreatorPublicPath(pathname: string | null | undefined): boolean {
  return [
    "/creator/login",
    "/creator/signup",
    "/creator/forgot-password",
    "/creator/reset-password",
    LINK_CREATOR_LOGIN_PATH,
    LINK_CREATOR_SIGNUP_PATH,
    LINK_CREATOR_FORGOT_PASSWORD_PATH,
    LINK_CREATOR_RESET_PASSWORD_PATH,
    TETHER_CREATOR_LOGIN_PATH,
    TETHER_CREATOR_SIGNUP_PATH,
    "/creator/tether/forgot-password",
    "/creator/tether/reset-password",
  ].includes(pathname || "");
}

// Brand selection only controls public presentation and redirect destinations.
// Creator authority still comes exclusively from the signed session plus the
// server-owned account, agency-assignment and clone-link rows.
export function creatorPublicPortal(pathname: string | null | undefined): CreatorPublicPortal {
  if (pathname?.startsWith("/creator/link/")) return "link";
  return pathname?.startsWith("/creator/tether/") ? "tether" : "twin";
}

export function creatorPortalCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    // Keep white-label affinity after the shorter creator session expires.
    // This cookie is presentation-only and never authorizes access.
    maxAge: 60 * 60 * 24 * 365,
  };
}

// This is a presentation preference only. The returned path never grants
// creator access; middleware and pages still require a verified creator
// identity before rendering any private workspace.
type CreatorPortalIdentity = { name?: string | null; agencyId?: string | null };

export function creatorPortalForIdentity(
  identity: CreatorPortalIdentity | null | undefined,
  portalCookie: string | null | undefined,
): CreatorPublicPortal {
  if (!identity) return normalizeCreatorPublicPortal(portalCookie);
  if (identity.agencyId === LYNQ_PORTAL.id || identity.name?.trim().toLowerCase() === "lynq") return "link";
  if (identity.agencyId === TETHER_PORTAL.id || identity.name?.trim().toLowerCase() === "tether") return "tether";
  return "twin";
}

export function creatorLoginPath(
  identity: CreatorPortalIdentity | null | undefined,
  portalCookie: string | null | undefined,
): string {
  return creatorPublicLoginPath(creatorPortalForIdentity(identity, portalCookie));
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
