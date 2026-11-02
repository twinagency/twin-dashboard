import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/supabase-service";
import { agencyIdentity } from "@/lib/agency-identity";
import { setAgencySessionCookies } from "@/lib/agency-session";
import { AGENCY_PORTAL_COOKIE } from "@/lib/agency-brand";
import { SESSION_COOKIE } from "@/lib/session";
import { CLONE_SCOPE_COOKIE } from "@/lib/clone-scope";
import { dashboardOrigin, trustedFormOrigin } from "@/lib/form-origin";

// This is the LYNQ-only operator login. A submitted email may select an
// active member of this fixed agency, but it can never select another agency.
const LYNQ_AGENCY_ID = "74b03b70-397e-49ab-841f-8adb8241d87d";
const LYNQ_LOGIN_USER_ID = "6e6491b9-8db0-43f5-b04a-d4509318dac9";

const loginPath = (req: NextRequest) => req.nextUrl.pathname === "/link/auth" ? "/link" : "/lynq";

export function GET(req: NextRequest) {
  return NextResponse.redirect(new URL(loginPath(req), dashboardOrigin(req)), 303);
}

export async function POST(req: NextRequest) {
  const json = req.headers.get("accept")?.includes("application/json");
  const failed = (error = "credentials", status = 401) => json
    ? NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } })
    : NextResponse.redirect(new URL(`${loginPath(req)}?error=1`, dashboardOrigin(req)), 303);
  if (!trustedFormOrigin(req) || req.headers.has("next-action")) return NextResponse.json({ ok: false, error: "origin" }, { status: 403 });
  try {
  const form = await req.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (email.length > 254 || !password || password.length > 256) return failed();
  const memberQuery = serviceClient().from("agency_memberships").select("user_id,email")
    .eq("agency_id", LYNQ_AGENCY_ID).eq("active", true);
  // Password-only POSTs remain compatible with the original shared account;
  // the branded browser form now supplies an email for additional owners.
  const member = email
    ? await memberQuery.eq("email", email).maybeSingle()
    : await memberQuery.eq("user_id", LYNQ_LOGIN_USER_ID).maybeSingle();
  if (member.error || !member.data?.user_id || !member.data.email) return failed();
  const auth = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await auth.auth.signInWithPassword({ email: member.data.email, password });
  const token = data.session?.access_token;
  const identity = token ? await agencyIdentity(token) : null;
  if (error || !token || data.user?.id !== member.data.user_id || identity?.id !== LYNQ_AGENCY_ID) return failed();
  const response = json ? NextResponse.json({ ok: true }) : NextResponse.redirect(new URL("/revenue", dashboardOrigin(req)), 303);
  await setAgencySessionCookies(response, data.session!);
  response.cookies.delete(SESSION_COOKIE);
  response.cookies.delete(CLONE_SCOPE_COOKIE);
  response.cookies.set(AGENCY_PORTAL_COOKIE,"lynq",{httpOnly:true,secure:process.env.NODE_ENV === "production",sameSite:"strict",path:"/",maxAge:60*60*24*30});
  response.headers.set("Cache-Control", "no-store");
  return response;
  } catch {
    console.error("LYNQ sign-in request failed before completing");
    return failed("unavailable", 503);
  }
}
