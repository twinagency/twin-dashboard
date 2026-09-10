export const TETHER_CREATOR_LOGIN_PATH = "/creator/tether/login";
export const TETHER_CREATOR_SIGNUP_PATH = "/creator/tether/signup";
export const CREATOR_PORTAL_COOKIE = "twin_creator_portal";

export type CreatorPublicPortal = "tether" | "twin";

export function isCreatorPublicPath(pathname: string | null | undefined): boolean {
  return [
    "/creator/login",
    "/creator/signup",
    "/creator/forgot-password",
    "/creator/reset-password",
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
  return pathname?.startsWith("/creator/tether/") ? "tether" : "twin";
}

export function creatorPortalCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
}

// This is a presentation preference only. The returned path never grants
// creator access; middleware and pages still require a verified creator
// identity before rendering any private workspace.
export function creatorLoginPath(
  identity: { name?: string | null } | null | undefined,
  portalCookie: string | null | undefined,
): string {
  const portal: CreatorPublicPortal = identity
    ? identity.name?.trim().toLowerCase() === "tether" ? "tether" : "twin"
    : portalCookie === "tether" ? "tether" : "twin";
  return portal === "tether" ? TETHER_CREATOR_LOGIN_PATH : "/creator/login";
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
