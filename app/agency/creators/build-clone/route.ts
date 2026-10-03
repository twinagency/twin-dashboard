import { NextRequest, NextResponse } from "next/server";
import { getAgencyOnboardingAccess, assignedCreatorAccount } from "@/lib/agency-onboarding-access";
import { dashboardOrigin, trustedFormOrigin } from "@/lib/form-origin";
import { buildCloneForCreator } from "@/lib/flirt-clone-pipeline-server";
import { outcomeResult } from "@/lib/flirt-clone-outcome";

// Operator action: (re)run the clone build for one approved applicant.
// With FLIRT_CLONE_PIPELINE_ENABLED off this does nothing and says so.
export async function POST(req: NextRequest) {
  if (!trustedFormOrigin(req)) return new NextResponse("Forbidden", { status: 403 });
  const access = await getAgencyOnboardingAccess();
  if (!access) return new NextResponse("Agency sign in required", { status: 401 });
  const id = String((await req.formData()).get("creator_account_id") || "");
  if (!await assignedCreatorAccount(access, id)) return new NextResponse("Creator access denied", { status: 403 });
  const outcome = await buildCloneForCreator(id);
  return NextResponse.redirect(new URL(`/agency/creators/${id}?result=${outcomeResult(outcome)}`, dashboardOrigin(req)), 303);
}
