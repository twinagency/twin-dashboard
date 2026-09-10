export const TETHER_CREATOR_LOGIN_PATH = "/creator/tether/login";
export const TETHER_CREATOR_SIGNUP_PATH = "/creator/tether/signup";

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
export function creatorPublicPortal(pathname: string | null | undefined): "tether" | "twin" {
  return pathname?.startsWith("/creator/tether/") ? "tether" : "twin";
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
