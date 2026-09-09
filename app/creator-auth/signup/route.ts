import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";
import { CREATOR_SESSION_COOKIE, creatorCookieOptions, signCreatorSession } from "@/lib/creator-session";

function redirectWithError(req: Request, code: string) {
  const url = new URL("/creator/signup", req.url);
  url.searchParams.set("error", code);
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

  if (!displayName || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
    return redirectWithError(req, "invalid");
  }

  let agencyId: string | null = null;
  if (agencyCode) {
    const codeHash = await sha256(agencyCode);
    const { data: claim, error: claimError } = await supabaseAdmin.rpc("claim_creator_agency_code", { p_code_hash: codeHash });
    const first = Array.isArray(claim) ? claim[0] : null;
    if (claimError || !first?.agency_id) return redirectWithError(req, "agency_code");
    agencyId = first.agency_id as string;
  }

  const { data: existing } = await supabaseAdmin
    .from("creator_accounts")
    .select("id,auth_user_id")
    .ilike("email", email)
    .maybeSingle();

  if (existing?.auth_user_id) return redirectWithError(req, "exists");

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (createError || !created.user) return redirectWithError(req, "exists");

  let accountId = existing?.id as string | undefined;
  try {
    if (accountId) {
      const { error } = await supabaseAdmin
        .from("creator_accounts")
        .update({ auth_user_id: created.user.id, email, display_name: displayName, updated_at: new Date().toISOString() })
        .eq("id", accountId);
      if (error) throw error;
    } else {
      const { data, error } = await supabaseAdmin
        .from("creator_accounts")
        .insert({ auth_user_id: created.user.id, email, display_name: displayName, account_status: "applicant", source: "twin" })
        .select("id")
        .single();
      if (error || !data) throw error || new Error("creator account insert failed");
      accountId = data.id as string;
    }

    await supabaseAdmin.from("creator_onboarding_progress").upsert({ creator_account_id: accountId }, { onConflict: "creator_account_id", ignoreDuplicates: true });

    if (agencyId) {
      const { error } = await supabaseAdmin.from("creator_agency_assignments").upsert({
        creator_account_id: accountId,
        agency_id: agencyId,
        assignment_source: "invite",
        assigned_at: new Date().toISOString(),
      }, { onConflict: "creator_account_id" });
      if (error) throw error;
    }

    const token = await signCreatorSession(accountId!, created.user.id);
    (await cookies()).set(CREATOR_SESSION_COOKIE, token, creatorCookieOptions());
    return NextResponse.redirect(new URL("/creator", req.url), 303);
  } catch (error) {
    await supabaseAdmin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
    console.error("creator signup failed", error);
    return redirectWithError(req, "failed");
  }
}
