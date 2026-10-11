import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/supabase-service";
import { agencyIdentity } from "@/lib/agency-identity";
import { setAgencySession } from "@/lib/agency-session";
import { AGENCY_PORTAL_COOKIE } from "@/lib/agency-brand";
import { SESSION_COOKIE } from "@/lib/session";
import { CLONE_SCOPE_COOKIE } from "@/lib/clone-scope";
import { dashboardOrigin, trustedFormOrigin } from "@/lib/form-origin";
import { JESS_KATE_PORTAL as portal } from "@/lib/partner-portals";

export function GET(req: NextRequest) {
  return NextResponse.redirect(new URL(portal.loginPath, dashboardOrigin(req)), 303);
}
export async function POST(req: NextRequest) {
  const json = req.headers.get("accept")?.includes("application/json");
  const failed = (error = "credentials", status = 401) => json
    ? NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } })
    : NextResponse.redirect(new URL(`${portal.loginPath}?error=1`, dashboardOrigin(req)), 303);
  if (!trustedFormOrigin(req) || req.headers.has("next-action")) return failed("origin", 403);
  try {
    const password = String((await req.formData()).get("password") ?? "");
    if (!password || password.length > 256) return failed();
    // Neither agency, account nor creator scope can be chosen in the submitted form.
    const member = await serviceClient().from("agency_memberships").select("user_id,email")
      .eq("agency_id", portal.id).eq("email", portal.loginEmail).eq("active", true).maybeSingle();
    if (member.error || !member.data?.user_id || member.data.email !== portal.loginEmail) return failed("unavailable", 503);
    const auth = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await auth.auth.signInWithPassword({ email: portal.loginEmail, password });
    const token = data.session?.access_token;
    const identity = !error && token ? await agencyIdentity(token) : null;
    if (error || !token || data.user?.id !== member.data.user_id || identity?.id !== portal.id || identity.cloneIds.length === 0) return failed();
    const response = json ? NextResponse.json({ ok: true }) : NextResponse.redirect(new URL("/revenue", dashboardOrigin(req)), 303);
    const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/" };
    setAgencySession(response, data.session!);
    response.cookies.set(AGENCY_PORTAL_COOKIE, portal.slug, { ...options, maxAge: 60 * 60 * 24 * 30 });
    response.cookies.delete(SESSION_COOKIE);
    // Open this one-creator workspace ready to edit instead of disabling tabs until selected.
    if (identity.cloneIds.length === 1) response.cookies.set(CLONE_SCOPE_COOKIE, identity.cloneIds[0], { ...options, maxAge: 60 * 60 * 24 * 30 });
    else response.cookies.delete(CLONE_SCOPE_COOKIE);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    console.error("Jess and Kate AI sign-in unavailable");
    return failed("unavailable", 503);
  }
}
