import { dashboardOrigin, trustedFormOrigin } from "@/lib/form-origin";
import { NextRequest, NextResponse } from "next/server";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { FLIRT_TEAM_NAME } from "@/lib/agency-policy";
import { parseBirthDate, parseCity, parseContentUrl, parseFullName, parseSampleTexts, parseSocials } from "@/lib/agency-clone-request";
// serviceClient, not supabaseAdmin: see app/agency/creator-invites/manage/route.ts.
import { serviceClient } from "@/lib/supabase-service";

// Only queues a request. It never creates a clone: a separate builder picks the
// row up and the agency reviews the result before anything goes live.
export async function POST(req: NextRequest) {
  if (!trustedFormOrigin(req)) return new NextResponse("Forbidden", { status: 403 });
  const access = await getDashboardAccess();
  if (!access) return new NextResponse("Agency sign in required", { status: 401 });
  const back = (query: string) => NextResponse.redirect(new URL(`/agency/create?${query}`, dashboardOrigin(req)), 303);
  if (access.name.trim() !== FLIRT_TEAM_NAME) return back("result=error");

  const fd = await req.formData();
  const fullName = parseFullName(String(fd.get("full_name") ?? ""));
  const contentUrl = parseContentUrl(String(fd.get("content_url") ?? ""));
  const socials = parseSocials(String(fd.get("socials") ?? ""));
  const birthDate = parseBirthDate(String(fd.get("birth_date") ?? ""));
  const city = parseCity(String(fd.get("city") ?? ""));
  const sampleTexts = parseSampleTexts(String(fd.get("sample_texts") ?? ""));
  if (!fullName || !contentUrl || !socials || birthDate === undefined || city === undefined || sampleTexts === undefined) return back("result=invalid");

  const inserted = await serviceClient().from("agency_clone_requests").insert({
    agency_id: access.id,
    full_name: fullName,
    content_url: contentUrl,
    social_links: socials,
    birth_date: birthDate,
    city,
    sample_texts: sampleTexts,
  }).select("id");
  if (inserted.error || !inserted.data?.length) return back("result=error");
  return back("result=queued");
}
