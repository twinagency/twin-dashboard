import { NextRequest, NextResponse } from "next/server";
import { getAgencyOnboardingAccess, assignedCreatorAccount } from "@/lib/agency-onboarding-access";
import { dashboardOrigin, trustedFormOrigin } from "@/lib/form-origin";
import { serviceClient } from "@/lib/supabase-service";
import { buildCloneForCreator } from "@/lib/flirt-clone-pipeline-server";
import { outcomeResult } from "@/lib/flirt-clone-outcome";

// Operator decision on a submitted FLIRT application. Approving records the decision.
// With FLIRT_CLONE_PIPELINE_ENABLED=true it then also builds the paused Twin clone
// (see lib/flirt-clone-pipeline.ts). With the flag off, approving does nothing more.
const DECISIONS = {
  reviewing: { account: "applicant", application: "reviewing" },
  approve: { account: "approved", application: "approved" },
  reject: { account: "rejected", application: "rejected" },
} as const;
const REVIEWABLE = new Set(["submitted", "reviewing", "approved", "rejected"]);

export async function POST(req: NextRequest) {
  if (!trustedFormOrigin(req)) return new NextResponse("Forbidden", { status: 403 });
  const access = await getAgencyOnboardingAccess();
  if (!access) return new NextResponse("Agency sign in required", { status: 401 });
  const form = await req.formData();
  const id = String(form.get("creator_account_id") || "");
  if (!await assignedCreatorAccount(access, id)) return new NextResponse("Creator access denied", { status: 403 });
  const back = (result: string) => NextResponse.redirect(new URL(`/agency/creators/${id}?result=${result}`, dashboardOrigin(req)), 303);
  const decision = DECISIONS[String(form.get("decision") || "") as keyof typeof DECISIONS];
  if (!decision) return back("error");

  const db = serviceClient();
  const application = await db.from("creator_applications").select("id,status")
    .eq("creator_account_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (application.error || !application.data || !REVIEWABLE.has(application.data.status)) return back("error");

  const now = new Date().toISOString();
  const app = await db.from("creator_applications").update({ status: decision.application, updated_at: now }).eq("id", application.data.id).select("id");
  if (app.error || !app.data?.length) return back("error");
  const acct = await db.from("creator_accounts").update({ account_status: decision.account, updated_at: now }).eq("id", id).select("id");
  if (acct.error || !acct.data?.length) return back("error");
  if (decision === DECISIONS.approve) {
    // The decision is already saved. A refusal or failure here never undoes it.
    const outcome = await buildCloneForCreator(id);
    if (outcome.kind !== "disabled") return back(outcomeResult(outcome));
  }
  return back("reviewed");
}
