// ── The single place that turns "a view-as cookie" into "a target identity" ──
//
// This is the choke point the build spec asks for: middleware.ts and every
// page/server-action identity resolver call activeViewAs() (or the two
// resolve* wrappers below) rather than re-deriving the rule themselves.
//
// THE RULE, stated once: a view-as cookie is live ONLY when the caller ALSO
// holds a currently-valid master-admin session cookie, re-verified on THIS
// request. A view-as cookie with no admin session, an expired admin session,
// or an expired view-as cookie is exactly the same as no cookie at all.
import { SESSION_COOKIE, verifySessionToken } from "./session";
import { VIEW_AS_COOKIE, verifyViewAs, type ViewAsPayload } from "./view-as-session";
import { agencyIdentityById, type AgencyIdentity } from "./agency-identity";
import { creatorDashboardIdentityById, type CreatorDashboardIdentity } from "./creator-dashboard-identity";

// Duck-typed so it accepts both NextRequest.cookies (middleware, sync) and the
// next/headers cookies() store (server components/actions, also sync once
// awaited by the caller) without importing either.
export type CookieReader = { get(name: string): { value: string } | undefined };

export async function activeViewAs(jar: CookieReader): Promise<ViewAsPayload | null> {
  const viewAsToken = jar.get(VIEW_AS_COOKIE)?.value;
  if (!viewAsToken) return null; // cheap exit before touching the admin session at all
  const authed = await verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!authed) return null; // a view-as cookie without a valid admin session must do nothing
  return verifyViewAs(viewAsToken);
}

export async function resolveViewAsAgency(jar: CookieReader): Promise<AgencyIdentity | null> {
  const viewAs = await activeViewAs(jar);
  if (!viewAs || viewAs.targetType !== "agency") return null;
  return agencyIdentityById(viewAs.targetId);
}

export async function resolveViewAsCreator(jar: CookieReader): Promise<CreatorDashboardIdentity | null> {
  const viewAs = await activeViewAs(jar);
  if (!viewAs || viewAs.targetType !== "creator") return null;
  return creatorDashboardIdentityById(viewAs.targetId);
}

// Exempted from the global read-only-while-viewing-as block in middleware.ts.
// A plain (non-server-action) POST so it never collides with a Next.js server
// action posted to the current pathname.
export const VIEW_AS_EXIT_PATH = "/admin/view-as/exit";
