import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase-service";
import { CREATOR_SESSION_COOKIE, creatorCookieOptions, signCreatorSession } from "@/lib/creator-session";
import { AGENCY_COOKIE } from "@/lib/agency-policy";
import { AGENCY_PORTAL_COOKIE } from "@/lib/agency-brand";
import { SESSION_COOKIE } from "@/lib/session";
import { CLONE_SCOPE_COOKIE } from "@/lib/clone-scope";
import { dashboardOrigin } from "@/lib/form-origin";
import { exactCaseInsensitiveEmailPattern } from "@/lib/creator-email";
import {
  CREATOR_PORTAL_COOKIE,
  creatorPortalCookieOptions,
  LINK_CREATOR_LOGIN_PATH,
  LINK_CREATOR_SIGNUP_PATH,
} from "@/lib/creator-routing";
import {
  linkCreatorAccountRow,
  linkCreatorAssignmentRow,
  linkCreatorPublishableKey,
  LINK_CREATOR_SIGNUP_STATUS,
  parseLinkCreatorSignup,
} from "@/lib/link-creator-signup";

function creatorUrl(req: Request, path: string): URL {
  return new URL(path, dashboardOrigin(req));
}

function linkResponse(response: NextResponse): NextResponse {
  // Presentation only. Creator access still requires a signed creator session
  // backed by the current account, assignment and clone-link rows.
  response.cookies.set(CREATOR_PORTAL_COOKIE, "link", creatorPortalCookieOptions());
  return response;
}

function redirectWithError(req: Request, code: string) {
  const url = creatorUrl(req, LINK_CREATOR_SIGNUP_PATH);
  url.searchParams.set("error", code);
  return linkResponse(NextResponse.redirect(url, 303));
}

async function removePartialSignup(accountId: string | null, userId: string) {
  const db = serviceClient();
  if (accountId) {
    const { error } = await db
      .from("creator_accounts")
      .delete()
      .eq("id", accountId)
      .eq("auth_user_id", userId);
    if (error) {
      // Do not delete Auth while an application row still points at it. That
      // would leave a reserved creator email with no usable login.
      console.error("Link creator account cleanup failed", error);
      return;
    }
  }
  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) console.error("Link creator auth cleanup failed", error);
}

export async function POST(req: Request) {
  const input = parseLinkCreatorSignup(await req.formData());
  if (!input) return redirectWithError(req, "invalid");

  const db = serviceClient();
  // Public signup never takes over a pre-provisioned or existing creator.
  // ILIKE catches legacy mixed-case emails; escaped wildcards keep it exact.
  const { data: existing, error: existingError } = await db
    .from("creator_accounts")
    .select("id")
    .ilike("email", exactCaseInsensitiveEmailPattern(input.email))
    .maybeSingle();
  if (existingError) {
    console.error("Link creator account lookup failed", existingError);
    return redirectWithError(req, "failed");
  }
  if (existing) return redirectWithError(req, "exists");

  const auth = createClient(process.env.SUPABASE_URL!, linkCreatorPublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: created, error: createError } = await auth.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: { display_name: input.displayName },
      emailRedirectTo: creatorUrl(req, LINK_CREATOR_LOGIN_PATH).toString(),
    },
  });
  if (createError || !created.user || created.user.identities?.length === 0) {
    if (createError) console.error("Link creator auth signup failed", createError);
    return redirectWithError(req, created.user?.identities?.length === 0 ? "exists" : "failed");
  }

  let accountId: string | null = null;
  let creatorToken: string | null = null;
  try {
    const { data: account, error: accountError } = await db
      .from("creator_accounts")
      .insert(linkCreatorAccountRow(input, created.user.id))
      .select("id")
      .single();
    if (accountError || !account) throw accountError || new Error("Link creator account insert failed");
    accountId = account.id as string;

    // When Supabase auto-confirms email, mint the dashboard session before
    // completing related writes so a signing/configuration failure rolls back.
    if (created.session) creatorToken = await signCreatorSession(accountId, created.user.id);

    const { error: progressError } = await db
      .from("creator_onboarding_progress")
      .insert({ creator_account_id: accountId });
    if (progressError) throw progressError;

    const { error: assignmentError } = await db
      .from("creator_agency_assignments")
      .insert(linkCreatorAssignmentRow(accountId, new Date().toISOString()));
    if (assignmentError) throw assignmentError;
  } catch (error) {
    await removePartialSignup(accountId, created.user.id);
    console.error("Link creator provisioning failed", error);
    return redirectWithError(req, "failed");
  }

  if (!created.session) {
    const url = creatorUrl(req, LINK_CREATOR_SIGNUP_PATH);
    url.searchParams.set("status", LINK_CREATOR_SIGNUP_STATUS);
    return linkResponse(NextResponse.redirect(url, 303));
  }

  const response = linkResponse(NextResponse.redirect(creatorUrl(req, "/creator"), 303));
  response.cookies.set(CREATOR_SESSION_COOKIE, creatorToken!, creatorCookieOptions());
  // Creator and operator sessions remain mutually exclusive in one browser.
  response.cookies.delete(AGENCY_COOKIE);
  response.cookies.delete(AGENCY_PORTAL_COOKIE);
  response.cookies.delete(SESSION_COOKIE);
  response.cookies.delete(CLONE_SCOPE_COOKIE);
  return response;
}
