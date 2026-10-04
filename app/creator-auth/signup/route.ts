import { exactCaseInsensitiveEmailPattern } from "@/lib/creator-email";
import { lookupCreatorInvitation } from "@/lib/creator-invite-agency";
import { trustedFormOrigin, isLynqHost } from "@/lib/form-origin";
import { randomUUID } from "node:crypto";
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
  if (req.headers.get("accept")?.includes("application/json")) return NextResponse.json({ error: code }, { status: code === "exists" ? 409 : code === "invite_unavailable" || code === "incomplete" ? 503 : 400, headers: { "Cache-Control": "private, no-store" } });
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
  if (!trustedFormOrigin(req) || req.headers.has("next-action")) return new NextResponse("Forbidden", { status: 403 });
  const requestId = randomUUID();
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
  const invitationRequired = isLynqHost(req);
  if (invitationRequired && !agencyCode) return redirectWithError(req, "invite_required", portal);
  if (agencyCode) {
    const invitation = await lookupCreatorInvitation(agencyCode);
    if (invitation.status !== "valid") return redirectWithError(req, `invite_${invitation.status}`, portal, agencyCode);
    agencyCodeHash = await sha256(agencyCode);
  }

  const { data: existing, error: lookupError } = await db
    .from("creator_accounts")
    .select("id,auth_user_id")
    .ilike("email", exactCaseInsensitiveEmailPattern(email))
    .maybeSingle();

  if (lookupError) return redirectWithError(req, "failed", portal, agencyCode);
  if (existing?.auth_user_id) return redirectWithError(req, "exists", portal, agencyCode);

  let expectedAgencyId: string | null = portal === "tether" ? TETHER_PORTAL.id : null;
  if (invitationRequired && !expectedAgencyId) {
    const agency = await db.from("partner_agencies").select("id").eq("slug", "moxy").eq("active", true).single();
    if (agency.error || !agency.data) return redirectWithError(req, "invite_unavailable", portal, agencyCode);
    expectedAgencyId = agency.data.id;
  }

  const { data: created, error: createError } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (createError || !created.user) {
    console.error("creator_signup", { requestId, stage: "auth_create", code: createError?.code || "unavailable" });
    const duplicate = !!createError && /already|registered|exists/i.test(createError.message || "");
    return redirectWithError(req, duplicate ? "exists" : "failed", portal, agencyCode);
  }

  let accountId: string | undefined;
  const registrationArgs = {
    p_user_id: created.user.id, p_email: email, p_display_name: displayName,
    p_code_hash: agencyCodeHash,
    p_direct_agency_id: null,
    p_expected_agency_id: expectedAgencyId,
  };
  try {
    // Repeating the same RPC reconciles an ambiguous/lost response. The DB
    // returns this user's existing account before claiming another slot.
    let result = await db.rpc("provision_creator_registration", registrationArgs);
    if (result.error) result = await db.rpc("provision_creator_registration", registrationArgs);
    if (result.error || !result.data) throw result.error || new Error("registration_failed");
    accountId = result.data as string;

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
    return req.headers.get("accept")?.includes("application/json")
      ? NextResponse.json({ next: "/creator/onboarding" }, { headers: { "Cache-Control": "private, no-store" } })
      : NextResponse.redirect(creatorRequestUrl(req, "/creator/onboarding"), 303);
  } catch (error) {
    // Never delete Auth after a possibly committed database transaction. Check
    // ownership readback; an unavailable readback is an explicit support case.
    const reconciled = await db.from("creator_accounts").select("id")
      .eq("auth_user_id", created.user.id).maybeSingle();
    if (!reconciled.error && !reconciled.data) {
      const cleanup = await db.auth.admin.deleteUser(created.user.id);
      if (cleanup.error) console.error("creator_signup", { requestId, stage: "auth_cleanup", code: cleanup.error.code || "failed" });
    }
    const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
    const inviteError = /^invite_(invalid|disabled|expired|exhausted)$/.test(message) ? message : null;
    console.error("creator_signup", { requestId, stage: "provision", outcome: reconciled.error ? "unknown" : reconciled.data ? "committed" : "rolled_back" });
    return redirectWithError(req, inviteError || (reconciled.error || reconciled.data ? "incomplete" : "failed"), portal, agencyCode);
  }
}
