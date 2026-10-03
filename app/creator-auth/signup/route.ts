import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { serviceClient } from "@/lib/supabase-service";
import { CREATOR_SESSION_COOKIE, creatorCookieOptions, signCreatorSession } from "@/lib/creator-session";
import { creatorRequestUrl } from "@/lib/creator-origin";
import { AGENCY_COOKIE } from "@/lib/agency-policy";
import { AGENCY_PORTAL_COOKIE } from "@/lib/agency-brand";
import { SESSION_COOKIE } from "@/lib/session";
import { CLONE_SCOPE_COOKIE } from "@/lib/clone-scope";
import { TETHER_PORTAL } from "@/lib/partner-portals";
import { TETHER_CREATOR_SIGNUP_PATH } from "@/lib/creator-routing";

function redirectWithError(req: Request, code: string, portal: "twin" | "tether", agencyCode = "") {
  const url = creatorRequestUrl(req, portal === "tether" ? TETHER_CREATOR_SIGNUP_PATH : "/creator/signup");
  url.searchParams.set("error", code);
  // Keep the invite (and its agency branding) on the retry page.
  if (portal === "twin" && agencyCode) url.searchParams.set("code", agencyCode);
  return NextResponse.redirect(url, 303);
}

async function sha256(value: string): Promise<string> {
  const data = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(data)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(req: Request) {
  const form = await req.formData();
  const displayName = String(form.get("display_name") || "").trim();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const agencyCode = String(form.get("agency_code") || "").trim().toUpperCase();
  // Presentation hint only. A matching Tether agency code is still required
  // before any account can receive a Tether assignment.
  const portal = form.get("portal") === "tether" ? "tether" : "twin";

  if (!displayName || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
    return redirectWithError(req, "invalid", portal, agencyCode);
  }
  if (portal === "tether" && !agencyCode) return redirectWithError(req, "agency_code", portal);

  // Creator auth is an independent security context. Do not allow an existing
  // agency/operator cookie in the same browser to scope or block these writes.
  const db = serviceClient();

  let agencyCodeHash: string | null = null;
  if (agencyCode) {
    agencyCodeHash = await sha256(agencyCode);
    const now = new Date().toISOString();
    const { data: code } = await db
      .from("creator_agency_codes")
      .select("id,agency_id,active,max_uses,uses,expires_at")
      .eq("code_hash", agencyCodeHash)
      .maybeSingle();
    if (!code?.active || (code.expires_at && code.expires_at <= now) || (code.max_uses != null && code.uses >= code.max_uses)) {
      return redirectWithError(req, "agency_code", portal);
    }
    if (portal === "tether" && code.agency_id !== TETHER_PORTAL.id) return redirectWithError(req, "agency_code", portal);
  }

  const { data: existing } = await db
    .from("creator_accounts")
    .select("id,auth_user_id")
    .ilike("email", email)
    .maybeSingle();

  if (existing?.auth_user_id) return redirectWithError(req, "exists", portal, agencyCode);

  const { data: created, error: createError } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (createError || !created.user) {
    console.error("creator auth user creation failed", createError);
    const duplicate = !!createError && /already|registered|exists/i.test(createError.message || "");
    return redirectWithError(req, duplicate ? "exists" : "failed", portal, agencyCode);
  }

  let accountId = existing?.id as string | undefined;
  try {
    let agencyId: string | null = null;
    if (agencyCodeHash) {
      const { data: claim, error: claimError } = await db.rpc("claim_creator_agency_code", { p_code_hash: agencyCodeHash });
      const first = Array.isArray(claim) ? claim[0] : null;
      if (claimError || !first?.agency_id) throw new Error("agency_code_unavailable");
      agencyId = first.agency_id as string;
    }

    if (accountId) {
      const { error } = await db
        .from("creator_accounts")
        .update({ auth_user_id: created.user.id, email, display_name: displayName, updated_at: new Date().toISOString() })
        .eq("id", accountId);
      if (error) throw error;
    } else {
      const { data, error } = await db
        .from("creator_accounts")
        .insert({ auth_user_id: created.user.id, email, display_name: displayName, account_status: "applicant", source: "twin" })
        .select("id")
        .single();
      if (error || !data) throw error || new Error("creator account insert failed");
      accountId = data.id as string;
    }

    const { error: progressError } = await db
      .from("creator_onboarding_progress")
      .upsert({ creator_account_id: accountId }, { onConflict: "creator_account_id", ignoreDuplicates: true });
    if (progressError) throw progressError;

    if (agencyId) {
      const { error } = await db.from("creator_agency_assignments").upsert({
        creator_account_id: accountId,
        agency_id: agencyId,
        assignment_source: "invite",
        assigned_at: new Date().toISOString(),
      }, { onConflict: "creator_account_id" });
      if (error) throw error;
    }

    const token = await signCreatorSession(accountId!, created.user.id);
    const jar = await cookies();
    jar.set(CREATOR_SESSION_COOKIE, token, creatorCookieOptions());
    // A browser can be an agency operator OR a creator for this app session,
    // not both. Clearing the operator state prevents the creator pages from
    // inheriting agency-scoped data access after signup.
    jar.delete(AGENCY_COOKIE);
    jar.delete(AGENCY_PORTAL_COOKIE);
    jar.delete(SESSION_COOKIE);
    jar.delete(CLONE_SCOPE_COOKIE);
    // New creators always land on onboarding first; Moxy creators can skip it from there (Ronan, 2026-10-03).
    return NextResponse.redirect(creatorRequestUrl(req, "/creator/onboarding"), 303);
  } catch (error) {
    await db.auth.admin.deleteUser(created.user.id).catch(() => undefined);
    console.error("creator signup failed", error);
    return redirectWithError(req, error instanceof Error && error.message === "agency_code_unavailable" ? "agency_code" : "failed", portal, agencyCode);
  }
}
