import { NextRequest, NextResponse } from "next/server";
import { getAgencyOnboardingAccess, assignedCreatorAccount } from "@/lib/agency-onboarding-access";
import { dashboardOrigin, trustedFormOrigin } from "@/lib/form-origin";
import { serviceClient } from "@/lib/supabase-service";

export async function POST(req: NextRequest) {
  if (!trustedFormOrigin(req)) return new NextResponse("Forbidden",{status:403});
  const access = await getAgencyOnboardingAccess();
  if (!access) return new NextResponse("Agency sign in required",{status:401});
  const form = await req.formData();
  const id = String(form.get("creator_account_id") || "");
  if (!await assignedCreatorAccount(access,id)) return new NextResponse("Creator access denied",{status:403});
  const back = (result:string) => NextResponse.redirect(new URL(`/agency/creators/${id}?result=${result}`,dashboardOrigin(req)),303);
  const name = String(form.get("display_name") || "").trim();
  const revision = String(form.get("revision") || "");
  if (!name || name.length > 120 || !revision || !Number.isFinite(Date.parse(revision))) return back("error");
  const result = await serviceClient().from("creator_accounts").update({display_name:name,updated_at:new Date().toISOString()})
    .eq("id",id).eq("updated_at",revision).select("id");
  return back(result.error ? "error" : result.data?.length ? "saved" : "conflict");
}
