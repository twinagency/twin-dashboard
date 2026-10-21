import { AGENCY_REFRESH_COOKIE } from "@/lib/agency-session";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase-service";
import { creatorAccountStatusAllowsAccess, creatorDashboardIdentity } from "@/lib/creator-dashboard-identity";
import { CREATOR_SESSION_COOKIE, creatorCookieOptions, signCreatorSession } from "@/lib/creator-session";
import {
  CREATOR_PORTAL_COOKIE,
  creatorPortalCookieOptions,
  creatorPortalForIdentity,
  creatorPublicLoginPath,
  normalizeCreatorPublicPortal,
  safeCreatorNext,
  type CreatorPublicPortal,
} from "@/lib/creator-routing";
import { dashboardOrigin, isLynqHost } from "@/lib/form-origin";
import { AGENCY_COOKIE } from "@/lib/agency-policy";
import { AGENCY_PORTAL_COOKIE } from "@/lib/agency-brand";
import { SESSION_COOKIE } from "@/lib/session";
import { CLONE_SCOPE_COOKIE } from "@/lib/clone-scope";

function withCreatorPortal(response: NextResponse, portal: CreatorPublicPortal): NextResponse {
  // This cookie only remembers which public sign-in page to show. Verified
  // account and assignment rows remain the sole source of creator authority.
  response.cookies.set(CREATOR_PORTAL_COOKIE, portal, creatorPortalCookieOptions());
  return response;
}

function redirectWithError(req: Request, next: string, portal: CreatorPublicPortal) {
  // On the Moxy host an error returns to the Moxy-branded creator login.
  const loginPath = portal === "twin" && isLynqHost(req) ? "/creator/moxy/login" : creatorPublicLoginPath(portal);
  const url = new URL(loginPath, dashboardOrigin(req));
  url.searchParams.set("error", "1");
  url.searchParams.set("next", next);
  return withCreatorPortal(NextResponse.redirect(url, 303), portal);
}

export async function POST(req: Request) {
  const form = await req.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const next = safeCreatorNext(String(form.get("next") || ""));
  // Presentation hint only. It never grants an agency assignment or clone.
  const portal = normalizeCreatorPublicPortal(form.get("portal"));
  if (!email || !password) return redirectWithError(req, next, portal);

  const authClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });
  if (error || !data.user) return redirectWithError(req, next, portal);

  // Creator account lookup must not inherit a stale agency/operator scope from
  // another tab in the same browser.
  const { data: account, error: accountError } = await serviceClient()
    .from("creator_accounts")
    .select("id,account_status")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();
  if (accountError || !account || !creatorAccountStatusAllowsAccess(account.account_status)) {
    return redirectWithError(req, next, portal);
  }

  const token = await signCreatorSession(account.id, data.user.id);
  const identity = await creatorDashboardIdentity(token);
  if (!identity) return redirectWithError(req, next, portal);

  const verifiedPortal = creatorPortalForIdentity(identity, portal);
  const response = withCreatorPortal(NextResponse.redirect(new URL(next, dashboardOrigin(req)), 303), verifiedPortal);
  response.cookies.set(CREATOR_SESSION_COOKIE, token, creatorCookieOptions());
  response.cookies.delete(AGENCY_COOKIE);
  response.cookies.delete(AGENCY_REFRESH_COOKIE);
  response.cookies.delete(AGENCY_PORTAL_COOKIE);
  response.cookies.delete(SESSION_COOKIE);
  response.cookies.delete(CLONE_SCOPE_COOKIE);
  return response;
}
