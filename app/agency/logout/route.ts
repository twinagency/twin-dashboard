import { dashboardOrigin, trustedFormOrigin } from "@/lib/form-origin";
import { NextRequest, NextResponse } from "next/server";
import { AGENCY_COOKIE } from "@/lib/agency-policy";
import { serviceClient } from "@/lib/supabase-service";
import { CLONE_SCOPE_COOKIE } from "@/lib/clone-scope";
export async function POST(req: NextRequest) {
  if (!trustedFormOrigin(req)) return new NextResponse("Forbidden", { status: 403 });
  const token = req.cookies.get(AGENCY_COOKIE)?.value;
  if (token) await serviceClient().auth.admin.signOut(token, "local").catch(() => undefined);
  const response = NextResponse.redirect(new URL("/lynq", dashboardOrigin(req)), 303);
  response.cookies.delete(AGENCY_COOKIE);
  response.cookies.delete(CLONE_SCOPE_COOKIE);
  return response;
}
