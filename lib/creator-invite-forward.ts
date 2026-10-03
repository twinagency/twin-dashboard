import { LYNQ_DASHBOARD_ORIGIN, canonicalDashboardOrigin, dashboardOrigin } from "./form-origin";

/** The agency slug whose creators sign up on the Moxy host. */
const MOXY_SLUG = "moxy";

/**
 * Where a creator signup with an invite code belongs. Moxy invites live on
 * dashboard.lynqai.co, everything else (generic Twin, other agencies) on the
 * canonical host. Returns null when the request is already on the right host
 * or the code is not a valid invite (the page then renders as before).
 * Presentation only: the signup route still validates and claims the code.
 */
export function creatorSignupForward(
  req: { url: string; headers: Headers },
  inviteAgencySlug: string | null | undefined,
  code: string | undefined,
  production = process.env.NODE_ENV === "production",
): URL | null {
  if (!production || !inviteAgencySlug || !code) return null;
  const here = dashboardOrigin(req);
  const wanted = inviteAgencySlug === MOXY_SLUG ? LYNQ_DASHBOARD_ORIGIN : canonicalDashboardOrigin(req);
  if (here === wanted) return null;
  // Only the two known hosts: an extra allowlisted origin is left alone.
  if (here !== LYNQ_DASHBOARD_ORIGIN && here !== canonicalDashboardOrigin(req)) return null;
  const url = new URL("/creator/signup", wanted);
  url.searchParams.set("code", code);
  return url;
}
