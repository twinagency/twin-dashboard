import { NextRequest, NextResponse } from "next/server";
import { dashboardOrigin, trustedFormOrigin } from "@/lib/form-origin";
import { flirtOnboardingOptional } from "@/lib/flirt-onboarding";
import { flirtCreatorLocaleCookie, parseFlirtCreatorLocale } from "@/lib/flirt-creator-locale";

export async function POST(request: NextRequest) {
  if (!flirtOnboardingOptional() || !trustedFormOrigin(request)) return new NextResponse(null, { status: 403 });
  const locale = parseFlirtCreatorLocale((await request.formData().catch(() => null))?.get("locale")?.toString());
  if (!locale) return new NextResponse(null, { status: 400 });
  const response = new NextResponse(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
  response.cookies.set(flirtCreatorLocaleCookie(locale, dashboardOrigin(request).startsWith("https:")));
  return response;
}
