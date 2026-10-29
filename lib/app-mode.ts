// OnlyFans-only mode.
//
// The same build can run as the full Twin dashboard (default) or as an
// OnlyFans-only front end. The switch is a SERVER-SIDE environment variable read
// at request time, never NEXT_PUBLIC (that is baked in at build time and would
// force a second image):
//
//     TWIN_APP_MODE=onlyfans
//
// Unset, or any other value, means the dashboard behaves exactly as before.
//
// This module is pure (no next/headers, no database) so middleware can import it.
// It is the ONLY place that reads the variable. Client components must not call
// `isOnlyFansOnly()`: the root layout reads it once and passes the answer down
// through `DashboardAccessProvider` (`onlyFansOnly`), because a runtime server
// env var does not exist in the browser.
//
// Nothing here starts a worker, cron, poller or sender. It only narrows which
// routes this process answers and what navigation it draws; every OnlyFans
// request still goes to the same OnlyFans backend through the same routes.

export const ONLYFANS_ONLY_HOME = "/onlyfans/overview";
export const ONLYFANS_ONLY_CREATOR_HOME = "/creator/platforms";

export function isOnlyFansOnly(env: Record<string, string | undefined> = process.env): boolean {
  return env.TWIN_APP_MODE?.trim().toLowerCase() === "onlyfans";
}

export type OnlyFansOnlyVerdict =
  | { kind: "allow" }
  | { kind: "redirect"; to: string }
  | { kind: "notfound" };

const ALLOW_EXACT = new Set([
  // Sign-in and session endpoints (each keeps its own existing method/origin rules).
  "/twin", "/login", "/admin-auth",
  "/agency/login", "/agency/auth", "/agency/logout", "/agency/clone-scope",
  "/agency/team",
  // Creator sign-in and the two OnlyFans creator pages.
  "/creator/login", "/creator/signup", "/creator/forgot-password", "/creator/reset-password",
  "/creator/link/login", "/creator/link/signup", "/creator/link/forgot-password", "/creator/link/reset-password",
  "/creator/tether/login", "/creator/tether/signup", "/creator/tether/forgot-password", "/creator/tether/reset-password",
  "/creator/moxy/login", "/creator/moxy/signup",
  "/creator/platforms", "/creator/onlyfans/inbox",
  "/creator-auth/login", "/creator-auth/logout", "/creator-auth/signup", "/creator-auth/identity",
  "/creator-auth/link/signup", "/creator-auth/tether/signup", "/creator-auth/platforms",
  // Read-only helpers the OnlyFans shell calls (currency rates, health).
  "/api/fx", "/api/health", "/api/channel-roster",
]);

const ALLOW_PREFIX = [
  "/onlyfans",
  "/agency/join",
  "/creator-auth/platforms/onlyfans",
  "/creator-auth/onlyfans",
  // Permission testing: an operator can view as an agency or creator (read-only).
  "/admin/view-as",
];

const ALLOW_PATTERN = [
  /^\/api\/onlyfans(?:-[a-z]+)?(?:\/|$)/,
  // Public static files (logos and icons from /public); never an API or page path.
  /^\/(?:brand|moxy|lynq|tether|dashboard)\/(?:[^/]+\/)*[^/]+\.(?:png|jpe?g|webp|svg|ico)$/,
  /^\/(?:allie-logo\.png|icon\.png|agency\/icon\.svg)$/,
];

function underPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + "/");
}

/**
 * What an OnlyFans-only process does with a request path. Default deny: a route
 * that is not listed above (every Telegram page, fleet, clones, MTProto,
 * Telegram revenue, Telegram-only API) is redirected home, or 404s for APIs
 * and non-page requests.
 *
 * `page` is true for a browser navigation (GET/HEAD, not a server action).
 */
export function onlyFansOnlyVerdict(pathname: string, page: boolean): OnlyFansOnlyVerdict {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (path === "/") return page ? { kind: "redirect", to: ONLYFANS_ONLY_HOME } : { kind: "notfound" };
  if (ALLOW_EXACT.has(path) || ALLOW_PREFIX.some(prefix => underPrefix(path, prefix)) || ALLOW_PATTERN.some(re => re.test(path))) return { kind: "allow" };
  if (!page || path.startsWith("/api/")) return { kind: "notfound" };
  // Creators sign in to their own portal: send them to its OnlyFans page.
  if (underPrefix(path, "/creator")) return { kind: "redirect", to: ONLYFANS_ONLY_CREATOR_HOME };
  return { kind: "redirect", to: ONLYFANS_ONLY_HOME };
}
