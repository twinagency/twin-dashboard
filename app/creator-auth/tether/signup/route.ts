import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase-service";
import { CREATOR_SESSION_COOKIE, creatorCookieOptions, signCreatorSession } from "@/lib/creator-session";
import { AGENCY_COOKIE } from "@/lib/agency-policy";
import { AGENCY_PORTAL_COOKIE } from "@/lib/agency-brand";
import { SESSION_COOKIE } from "@/lib/session";
import { CLONE_SCOPE_COOKIE } from "@/lib/clone-scope";
import { dashboardOrigin } from "@/lib/form-origin";
import { TETHER_CREATOR_LOGIN_PATH, TETHER_CREATOR_SIGNUP_PATH } from "@/lib/creator-routing";
import {
  creatorPublishableKey,
  parseTetherCreatorSignup,
  tetherCreatorAccountRow,
  tetherCreatorAssignmentRow,
  TETHER_CREATOR_SIGNUP_STATUS,
} from "@/lib/tether-creator-signup";

function creatorUrl(req: Request, path: string): URL {
  return new URL(path, dashboardOrigin(req));
}

function redirectWithError(req: Request, code: string) {
  const url = creatorUrl(req, TETHER_CREATOR_SIGNUP_PATH);
  url.searchParams.set("error", code);
  return NextResponse.redirect(url, 303);
}

async function removePartialSignup(accountId: string | null, userId: string) {
  const db = serviceClient();
  if (accountId) {
    const { error } = await db.from("creator_accounts").delete().eq("id", accountId).eq("auth_user_id", userId);
    if (error) console.error("Tether creator account cleanup failed", error);
  }
  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) console.error("Tether creator auth cleanup failed", error);
}

export async function POST(req: Request) {
  const input = parseTetherCreatorSignup(await req.formData());
  if (!input) return redirectWithError(req, "invalid");

  const db = serviceClient();
  // Exact normalized email comparison: wildcard matching must never select a
  // pre-provisioned account for a public applicant.
  const { data: existing, error: existingError } = await db
    .from("creator_accounts")
    .select("id")
    .eq("email", input.email)
    .maybeSingle();
  if (existingError) {
    console.error("Tether creator account lookup failed", existingError);
    return redirectWithError(req, "failed");
  }
  // Public signup never takes over or reassigns an existing creator record.
  if (existing) return redirectWithError(req, "exists");

  const auth = createClient(process.env.SUPABASE_URL!, creatorPublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: created, error: createError } = await auth.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: { display_name: input.displayName },
      emailRedirectTo: creatorUrl(req, TETHER_CREATOR_LOGIN_PATH).toString(),
    },
  });
  if (createError || !created.user || created.user.identities?.length === 0) {
    if (createError) console.error("Tether creator auth signup failed", createError);
    return redirectWithError(req, created.user?.identities?.length === 0 ? "exists" : "failed");
  }

  let accountId: string | null = null;
  let creatorToken: string | null = null;
  try {
    const { data: account, error: accountError } = await db
      .from("creator_accounts")
      .insert(tetherCreatorAccountRow(input, created.user.id))
      .select("id")
      .single();
    if (accountError || !account) throw accountError || new Error("Tether creator account insert failed");
    accountId = account.id as string;
    // Fail before the remaining writes if this deployment cannot mint the
    // application session needed by an auto-confirmed Supabase project.
    if (created.session) creatorToken = await signCreatorSession(accountId, created.user.id);

    const { error: progressError } = await db
      .from("creator_onboarding_progress")
      .insert({ creator_account_id: accountId });
    if (progressError) throw progressError;

    const { error: assignmentError } = await db
      .from("creator_agency_assignments")
      .insert(tetherCreatorAssignmentRow(accountId, new Date().toISOString()));
    if (assignmentError) throw assignmentError;
  } catch (error) {
    await removePartialSignup(accountId, created.user.id);
    console.error("Tether creator provisioning failed", error);
    return redirectWithError(req, "failed");
  }

  if (!created.session) {
    const url = creatorUrl(req, TETHER_CREATOR_SIGNUP_PATH);
    url.searchParams.set("status", TETHER_CREATOR_SIGNUP_STATUS);
    return NextResponse.redirect(url, 303);
  }

  const response = NextResponse.redirect(creatorUrl(req, "/creator"), 303);
  response.cookies.set(CREATOR_SESSION_COOKIE, creatorToken!, creatorCookieOptions());
  // Creator and operator sessions remain mutually exclusive in one browser.
  response.cookies.delete(AGENCY_COOKIE);
  response.cookies.delete(AGENCY_PORTAL_COOKIE);
  response.cookies.delete(SESSION_COOKIE);
  response.cookies.delete(CLONE_SCOPE_COOKIE);
  return response;
}
