import { NextRequest, NextResponse } from "next/server";
import { VIEW_AS_COOKIE } from "@/lib/view-as-session";
import { dashboardOrigin, trustedFormOrigin } from "@/lib/form-origin";

// Deliberately a plain Route Handler POST, not a "use server" action: a
// server action POSTs to the CURRENT pathname, which would make it
// impossible to exempt from middleware.ts's global "read-only while viewing
// as" block by path. This fixed URL is that one exemption (see
// lib/view-as.ts VIEW_AS_EXIT_PATH), so it must stay a plain form POST.
export async function POST(req: NextRequest) {
  if (!trustedFormOrigin(req)) return new NextResponse("Forbidden", { status: 403 });
  const response = NextResponse.redirect(new URL("/admin/view-as", dashboardOrigin(req)), 303);
  response.cookies.delete(VIEW_AS_COOKIE);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
