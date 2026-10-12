import { createHash, timingSafeEqual, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { serviceClient } from "@/lib/supabase-service";
import { creatorAccountStatusAllowsAccess, creatorDashboardIdentity, ONBOARDING_REVIEW_ACCOUNT_ID, ONBOARDING_REVIEW_AGENCY_ID } from "@/lib/creator-dashboard-identity";
import { CREATOR_SESSION_COOKIE, creatorCookieOptions, signCreatorSession } from "@/lib/creator-session";
import { CREATOR_PORTAL_COOKIE, creatorPortalCookieOptions } from "@/lib/creator-routing";
import { dashboardOrigin } from "@/lib/form-origin";
import { AGENCY_COOKIE } from "@/lib/agency-policy";
import { AGENCY_PORTAL_COOKIE } from "@/lib/agency-brand";
import { SESSION_COOKIE } from "@/lib/session";
import { CLONE_SCOPE_COOKIE } from "@/lib/clone-scope";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The raw key is handed only to the owner, never bundled into client code.
// Archive the dedicated account to revoke access, including existing sessions.
const KEY_SHA256 = "a3537cd0e99289895955531910c7f5e514f2a98515760f1bf5dc2ada38ce4151";
const REVIEW_EMAIL = `onboarding-review-${ONBOARDING_REVIEW_ACCOUNT_ID}@example.invalid`;

function privateResponse(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
function unavailable(status = 404) {
  return privateResponse(new NextResponse("Onboarding review is unavailable.", { status }));
}

export async function GET(req: NextRequest, context: { params: Promise<{ key: string }> }) {
  const { key } = await context.params;
  if (req.headers.has("next-action") || !/^[a-f0-9]{64}$/.test(key)) return unavailable();
  const digest = createHash("sha256").update(key).digest();
  if (!timingSafeEqual(digest, Buffer.from(KEY_SHA256, "hex"))) return unavailable();
  try {
    if (process.env.FLIRT_SUPABASE_PROJECT_REF !== "lkmfwpqegjluirfusnaw") return unavailable();
    const db = serviceClient();
    const lookup = () => db.from("creator_accounts").select("id,auth_user_id,source,account_status")
      .eq("id", ONBOARDING_REVIEW_ACCOUNT_ID).maybeSingle();
    let account = await lookup();
    if (account.error) return unavailable(503);
    if (!account.data) {
      // Provision only the fixed review identity. No invitation or email is sent.
      const created = await db.auth.admin.createUser({ email: REVIEW_EMAIL, password: randomBytes(48).toString("base64url"), email_confirm: true,
        app_metadata: { onboarding_review: true } });
      if (created.error || !created.data.user) {
        // A simultaneous first visit may already be creating the same account.
        account = await lookup();
        if (account.error || !account.data) return unavailable(503);
      } else {
        const inserted = await db.from("creator_accounts").insert({ id: ONBOARDING_REVIEW_ACCOUNT_ID,
          auth_user_id: created.data.user.id, email: REVIEW_EMAIL, display_name: "Onboarding Review", account_status: "applicant", source: "admin" });
        if (inserted.error) {
          await db.auth.admin.deleteUser(created.data.user.id);
          return unavailable(503);
        }
        account = await lookup();
      }
    }
    if (account.error || !account.data?.auth_user_id || account.data.source !== "admin"
      || !creatorAccountStatusAllowsAccess(account.data.account_status)) return unavailable();

    // Idempotent repair after a partial first visit. Never overwrite an existing
    // assignment, progress, application, uploaded file or questionnaire answer.
    const [assignment, progress] = await Promise.all([
      db.from("creator_agency_assignments").upsert({ creator_account_id: ONBOARDING_REVIEW_ACCOUNT_ID,
        agency_id: ONBOARDING_REVIEW_AGENCY_ID, assignment_source: "admin" }, { onConflict: "creator_account_id", ignoreDuplicates: true }),
      db.from("creator_onboarding_progress").upsert({ creator_account_id: ONBOARDING_REVIEW_ACCOUNT_ID }, { onConflict: "creator_account_id", ignoreDuplicates: true }),
    ]);
    if (assignment.error || progress.error) return unavailable(503);
    const token = await signCreatorSession(ONBOARDING_REVIEW_ACCOUNT_ID, account.data.auth_user_id);
    const identity = await creatorDashboardIdentity(token);
    if (!identity || identity.accountId !== ONBOARDING_REVIEW_ACCOUNT_ID || identity.cloneIds.length || identity.readOnly) return unavailable();

    const destination = new URL("/creator/onboarding", dashboardOrigin(req));
    const step = req.nextUrl.searchParams.get("step");
    if (step === "content" || step === "questionnaire") destination.searchParams.set("step", step);
    const response = privateResponse(NextResponse.redirect(destination, 303));
    response.cookies.set(CREATOR_SESSION_COOKIE, token, creatorCookieOptions());
    response.cookies.set(CREATOR_PORTAL_COOKIE, "twin", creatorPortalCookieOptions());
    response.cookies.delete(AGENCY_COOKIE);
    response.cookies.delete(AGENCY_PORTAL_COOKIE);
    response.cookies.delete(SESSION_COOKIE);
    response.cookies.delete(CLONE_SCOPE_COOKIE);
    return response;
  } catch { return unavailable(503); }
}

// Link preview crawlers must not provision an account or receive a session.
export async function HEAD() { return unavailable(); }
