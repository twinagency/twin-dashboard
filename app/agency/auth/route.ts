import { SESSION_COOKIE } from "@/lib/session";
import { CLONE_SCOPE_COOKIE } from "@/lib/clone-scope";
import { dashboardOrigin, trustedFormOrigin } from "@/lib/form-origin";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { agencyIdentity } from "@/lib/agency-identity";
import { AGENCY_COOKIE } from "@/lib/agency-policy";

export async function POST(req: NextRequest) {
  if (!trustedFormOrigin(req)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const fd = await req.formData();
  const email = String(fd.get("email") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  if (email.length > 254 || password.length > 256) return new NextResponse("Invalid input", { status: 400 });
  // A new client per login: never replace the shared admin client's session.
  const auth = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await auth.auth.signInWithPassword({ email, password });
  const token = data.session?.access_token;
  if (error || !token || !await agencyIdentity(token)) {
    return NextResponse.redirect(new URL("/agency/login?error=1", dashboardOrigin(req)), 303);
  }
  const response = NextResponse.redirect(new URL("/revenue", dashboardOrigin(req)), 303);
  response.cookies.set(AGENCY_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "strict", path: "/", maxAge: Math.min(data.session?.expires_in ?? 3600, 3600) });
  response.cookies.delete(SESSION_COOKIE);
  response.cookies.delete(CLONE_SCOPE_COOKIE);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
