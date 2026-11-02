import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { AGENCY_COOKIE } from "@/lib/agency-policy";
import { dashboardOrigin, trustedFormOrigin } from "@/lib/form-origin";
import { serviceClient } from "@/lib/supabase-service";
import { JESS_KATE_PORTAL as portal } from "@/lib/partner-portals";
export async function POST(req: NextRequest) {
  if (!trustedFormOrigin(req) || req.headers.has("next-action")) return new NextResponse("Forbidden", {status:403});
  if (req.cookies.get(AGENCY_COOKIE)?.value || !await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) return new NextResponse("Unauthorized", {status:401});
  const done = (saved: boolean) => NextResponse.redirect(new URL(`/agency-admin/jess-kate-password?result=${saved ? "saved" : "error"}`, dashboardOrigin(req)), 303);
  try {
    const password = String((await req.formData()).get("password") ?? "");
    if (password.length < 16 || password.length > 256) return done(false);
    const db = serviceClient();
    const member = await db.from("agency_memberships").select("user_id").eq("agency_id",portal.id).eq("email",portal.loginEmail).eq("active",true).maybeSingle();
    if (member.error || !member.data) return done(false);
    const {error} = await db.auth.admin.updateUserById(member.data.user_id, {password});
    const response = done(!error); response.headers.set("Cache-Control", "no-store"); return response;
  } catch { return done(false); }
}
