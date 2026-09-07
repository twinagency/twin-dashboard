import { dashboardOrigin, trustedFormOrigin } from "@/lib/form-origin";
import { NextRequest, NextResponse } from "next/server";
import { AGENCY_COOKIE } from "@/lib/agency-policy";
import { supabaseAdmin } from "@/lib/supabase";
export async function POST(req: NextRequest) {
  if (!trustedFormOrigin(req)) return new NextResponse("Forbidden", { status: 403 });
  const token = req.cookies.get(AGENCY_COOKIE)?.value;
  if (token) await supabaseAdmin.auth.admin.signOut(token);
  const response = NextResponse.redirect(new URL("/agency/login", dashboardOrigin(req)), 303);
  response.cookies.delete(AGENCY_COOKIE);
  return response;
}
