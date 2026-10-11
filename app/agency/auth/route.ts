import { SESSION_COOKIE } from "@/lib/session";
import { CLONE_SCOPE_COOKIE } from "@/lib/clone-scope";
import { dashboardOrigin, trustedFormOrigin } from "@/lib/form-origin";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { agencyIdentity } from "@/lib/agency-identity";
import { setAgencySession } from "@/lib/agency-session";
import { AGENCY_PORTAL_COOKIE, isMoxy, isLynq } from "@/lib/agency-brand";

export async function POST(req: NextRequest) {
  if (!trustedFormOrigin(req)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const fd = await req.formData();
  const login = String(fd.get("email") ?? "").trim();
  // A bare username signs in as <username>@dashboard.tgaiclone.xyz.
  const email = login.includes("@") ? login : `${login.toLowerCase()}@dashboard.tgaiclone.xyz`;
  const password = String(fd.get("password") ?? "");
  if (email.length > 254 || password.length > 256) return new NextResponse("Invalid input", { status: 400 });
  // A new client per login: never replace the shared admin client's session.
  const auth = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await auth.auth.signInWithPassword({ email, password });
  const token = data.session?.access_token;
  const identity = token ? await agencyIdentity(token) : null;
  if (error || !token || !identity) {
    return NextResponse.redirect(new URL("/agency/login?error=1", dashboardOrigin(req)), 303);
  }
  const response = NextResponse.redirect(new URL("/revenue", dashboardOrigin(req)), 303);
  setAgencySession(response, data.session!);
  response.cookies.delete(SESSION_COOKIE);
  response.cookies.delete(CLONE_SCOPE_COOKIE);
  response.cookies.set(AGENCY_PORTAL_COOKIE,isMoxy(identity.name) ? "moxy" : isLynq(identity.name) ? "lynq" : "twin",{httpOnly:true,secure:process.env.NODE_ENV === "production",sameSite:"strict",path:"/",maxAge:60*60*24*30});
  response.headers.set("Cache-Control", "no-store");
  return response;
}
