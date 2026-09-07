import { dashboardOrigin, trustedFormOrigin } from "@/lib/form-origin";
import { NextRequest, NextResponse } from "next/server";
import { constantTimeEqual, signSession, SESSION_COOKIE } from "@/lib/session";
export async function POST(req: NextRequest) {
  if (!trustedFormOrigin(req)) return new NextResponse("Forbidden",{status:403});
  const fd=await req.formData();
  const password=String(fd.get("password")??"");
  const expected=process.env.DASHBOARD_PASSWORD;
  if (!expected || !password || password.length>256 || !constantTimeEqual(password,expected)) return NextResponse.redirect(new URL("/login?error=1",dashboardOrigin(req)),303);
  const next=String(fd.get("next")??"/");
  const safe=next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/";
  const response=NextResponse.redirect(new URL(safe,dashboardOrigin(req)),303);
  response.cookies.set(SESSION_COOKIE,await signSession(),{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:60*60*24*30});
  return response;
}
