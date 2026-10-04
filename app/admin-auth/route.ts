import { safeAdminNext } from "@/lib/login-routing";
import { AGENCY_COOKIE } from "@/lib/agency-policy";
import { AGENCY_PORTAL_COOKIE } from "@/lib/agency-brand";
import { CLONE_SCOPE_COOKIE } from "@/lib/clone-scope";
import { dashboardOrigin, trustedFormOrigin } from "@/lib/form-origin";
import { NextRequest, NextResponse } from "next/server";
import { constantTimeEqual, signSession, SESSION_COOKIE } from "@/lib/session";
import { authenticateOwner } from "@/lib/owner-auth";
import { CREATOR_SESSION_COOKIE } from "@/lib/creator-session";
export async function POST(req: NextRequest) {
  if (!trustedFormOrigin(req)) return new NextResponse("Forbidden",{status:403});
  const fd=await req.formData();
  const password=String(fd.get("password")??"");
  const owner = fd.get("mode") === "owner";
  const expected=process.env.DASHBOARD_PASSWORD;
  const token = owner
    ? await authenticateOwner(String(fd.get("username") ?? ""), password)
    : expected && password && password.length <= 256 && constantTimeEqual(password, expected)
      ? await signSession() : null;
  if (!token) {
    const location = new URL(owner ? "/login?owner=1&error=1" : "/twin?error=1", dashboardOrigin(req));
    if (owner) location.searchParams.set("next", safeAdminNext(String(fd.get("next") ?? "")));
    const denied = NextResponse.redirect(location, 303);
    denied.headers.set("Cache-Control", "private, no-store");
    return denied;
  }
  const safe=safeAdminNext(String(fd.get("next") ?? ""));
  const response=NextResponse.redirect(new URL(safe,dashboardOrigin(req)),303);
  response.cookies.set(SESSION_COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:60*60*24*30});
  response.cookies.delete(CREATOR_SESSION_COOKIE);
  response.cookies.delete(AGENCY_COOKIE);
  response.cookies.delete(AGENCY_PORTAL_COOKIE);
  response.cookies.delete(CLONE_SCOPE_COOKIE);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
