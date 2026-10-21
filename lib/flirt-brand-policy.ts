import { flirtOnboardingOptional } from "./flirt-onboarding";

// The FLIRT dashboard is inherited from Twin and still ships the sign-in pages
// of other brands (LYNQ, Link, Moxy, Tether, Ava, Jess and Kate). None of those
// agencies exist in the FLIRT project, so on the FLIRT host they only leak
// another company's name and offer sign-ups that cannot work. Active only in the
// FLIRT runtime; Twin and Moxy are unaffected.
const CREATOR_BRAND_PAGE = /^\/creator\/(?:link|tether|moxy)(?:\/(login|signup|forgot-password|reset-password|onboarding))?\/?$/;
const CREATOR_BRAND_ANY = /^\/creator\/(?:link|tether|moxy)(?:\/|$)/;
const BRAND_AUTH = /^\/creator-auth\/(?:link|tether)(?:\/|$)/;
const AGENCY_BRAND = /^\/(?:lynq|link|moxy|tether|jess-and-kate-ai|ava)(?:\/|$)/;

export type FlirtBrandDecision = { action: "redirect"; path: string } | { action: "notfound" } | null;

export function flirtForeignBrandDecision(pathname: string, method: string, env: Record<string, string | undefined> = process.env): FlirtBrandDecision {
  if (!flirtOnboardingOptional(env)) return null;
  const safe = method === "GET" || method === "HEAD";
  // Independent Flirt agencies use their own authenticated login form.
  if (CREATOR_BRAND_ANY.test(pathname)) {
    if (!safe) return { action: "notfound" };
    const page = CREATOR_BRAND_PAGE.exec(pathname)?.[1];
    return { action: "redirect", path: `/creator/${page ?? "login"}` };
  }
  if (BRAND_AUTH.test(pathname) || AGENCY_BRAND.test(pathname)) return { action: "notfound" };
  return null;
}
