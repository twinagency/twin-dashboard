import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/supabase-service";
import { agencyIdentity } from "@/lib/agency-identity";
import { AGENCY_COOKIE } from "@/lib/agency-policy";
import { SESSION_COOKIE } from "@/lib/session";
import { CLONE_SCOPE_COOKIE } from "@/lib/clone-scope";
import { dashboardOrigin, trustedFormOrigin } from "@/lib/form-origin";

// This is the existing read-only LYNQ login, shared by its two operators.
// Neither the account nor its agency can be selected by a submitted form.
const LYNQ_AGENCY_ID = "74b03b70-397e-49ab-841f-8adb8241d87d";
const LYNQ_LOGIN_USER_ID = "6e6491b9-8db0-43f5-b04a-d4509318dac9";

export function GET(req: NextRequest) {
  return NextResponse.redirect(new URL("/lynq", dashboardOrigin(req)), 303);
}

export async function POST(req: NextRequest) {
  const json = req.headers.get("accept")?.includes("application/json");
  const failed = (error = "credentials", status = 401) => json
    ? NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } })
    : NextResponse.redirect(new URL("/lynq?error=1", dashboardOrigin(req)), 303);
  if (!trustedFormOrigin(req) || req.headers.has("next-action")) return NextResponse.json({ ok: false, error: "origin" }, { status: 403 });
  try {
  const password = String((await req.formData()).get("password") ?? "");
  if (!password || password.length > 256) return failed();
  const member = await serviceClient().from("agency_memberships").select("email")
    .eq("agency_id", LYNQ_AGENCY_ID).eq("user_id", LYNQ_LOGIN_USER_ID).eq("active", true).maybeSingle();
  if (member.error || !member.data?.email) return failed("unavailable", 503);
  const auth = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await auth.auth.signInWithPassword({ email: member.data.email, password });
  const token = data.session?.access_token;
  const identity = token ? await agencyIdentity(token) : null;
  if (error || !token || data.user?.id !== LYNQ_LOGIN_USER_ID || identity?.id !== LYNQ_AGENCY_ID) return failed();
  const response = json ? NextResponse.json({ ok: true }) : NextResponse.redirect(new URL("/revenue", dashboardOrigin(req)), 303);
  response.cookies.set(AGENCY_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "strict", path: "/", maxAge: Math.min(data.session?.expires_in ?? 3600, 3600) });
  response.cookies.delete(SESSION_COOKIE);
  response.cookies.delete(CLONE_SCOPE_COOKIE);
  response.headers.set("Cache-Control", "no-store");
  return response;
  } catch {
    console.error("LYNQ sign-in request failed before completing");
    return failed("unavailable", 503);
  }
}
