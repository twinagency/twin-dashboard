import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/supabase-service";
import { agencyIdentity } from "@/lib/agency-identity";
import { AGENCY_COOKIE } from "@/lib/agency-policy";
import { AGENCY_PORTAL_COOKIE } from "@/lib/agency-brand";
import { SESSION_COOKIE } from "@/lib/session";
import { CLONE_SCOPE_COOKIE } from "@/lib/clone-scope";
import { dashboardOrigin, trustedFormOrigin } from "@/lib/form-origin";
import { TETHER_PORTAL as portal } from "@/lib/partner-portals";

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
    const form = await req.formData();
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !password || password.length > 256) return failed();

    const member = await serviceClient().from("agency_memberships").select("user_id,email")
      .eq("agency_id", portal.id).eq("email", email).eq("active", true).maybeSingle();
    if (member.error) return failed("unavailable", 503);
    if (!member.data?.user_id || member.data.email !== email) return failed();
    const auth = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await auth.auth.signInWithPassword({ email, password });
    const token = data.session?.access_token;
    const identity = !error && token ? await agencyIdentity(token) : null;
    if (error || !token || data.user?.id !== member.data.user_id || identity?.id !== portal.id || identity.cloneIds.length === 0) return failed();

    const response = json ? NextResponse.json({ ok: true }) : NextResponse.redirect(new URL("/revenue", dashboardOrigin(req)), 303);
    const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/" };
    response.cookies.set(AGENCY_COOKIE, token, { ...options, maxAge: Math.min(data.session?.expires_in ?? 3600, 3600) });
    response.cookies.set(AGENCY_PORTAL_COOKIE, portal.slug, { ...options, maxAge: 60 * 60 * 24 * 30 });
    response.cookies.delete(SESSION_COOKIE);
    if (identity.cloneIds.length === 1) response.cookies.set(CLONE_SCOPE_COOKIE, identity.cloneIds[0], { ...options, maxAge: 60 * 60 * 24 * 30 });
    else response.cookies.delete(CLONE_SCOPE_COOKIE);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    console.error("Tether sign-in unavailable");
    return failed("unavailable", 503);
  }
}
