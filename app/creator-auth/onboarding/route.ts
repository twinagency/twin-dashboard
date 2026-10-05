import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { CREATOR_SESSION_COOKIE } from "@/lib/creator-session";
import { creatorDashboardIdentity } from "@/lib/creator-dashboard-identity";
import { creatorRequestUrl } from "@/lib/creator-origin";
import { CREATOR_PORTAL_COOKIE, creatorLoginPath } from "@/lib/creator-routing";
import {
  CREATOR_QUESTIONNAIRE_TERMINAL_STATUSES,
  creatorQuestionnairePageForQuestion,
  nextQuestionnaireRevision,
  questionnaireRequiredMissing,
} from "@/lib/creator-questionnaire-draft";
import { creatorContentCompleted } from "@/lib/creator-content-requirements";
import { isMoxy } from "@/lib/agency-brand";
import { creatorOnboardingEditable } from "@/lib/creator-onboarding-policy";

function back(req: Request, status: string, step?: "questionnaire" | "voice" | "consent", section?: string) {
  const url = creatorRequestUrl(req, "/creator/onboarding");
  url.searchParams.set("status", status);
  if (step) url.searchParams.set("step", step);
  if (section) url.searchParams.set("section", section);
  url.hash = "step-result";
  return NextResponse.redirect(url, 303);
}

function submissionErrorStatus(error: { message?: string } | null | undefined) {
  return error?.message === "creator_file_removal_pending" ? "file_removal_pending" : "error";
}

async function getCreator(req: NextRequest) {
  return {
    creator: await creatorDashboardIdentity(req.cookies.get(CREATOR_SESSION_COOKIE)?.value),
    portal: req.cookies.get(CREATOR_PORTAL_COOKIE)?.value,
  };
}

async function latestApplication(accountId: string) {
  return supabaseAdmin
    .from("creator_applications")
    .select("id,status,answers,updated_at")
    .eq("creator_account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

export async function POST(req: NextRequest) {
  const { creator, portal } = await getCreator(req);
  if (!creator) return NextResponse.redirect(creatorRequestUrl(req, creatorLoginPath(null, portal)), 303);
  if (creator.readOnly) return new NextResponse("Creator demo is read-only", { status: 403 });
  const accountId = creator.accountId;
  const form = await req.formData();
  const action = String(form.get("action") || "");
  const now = new Date().toISOString();

  if (action === "questionnaire") {
    const { data: existing, error: readError } = await latestApplication(accountId);
    if (readError) return back(req, "error", "questionnaire");
    if (existing && CREATOR_QUESTIONNAIRE_TERMINAL_STATUSES.has(existing.status) && !creatorOnboardingEditable(existing.status, creator)) return back(req, "questionnaire_saved", "questionnaire");
    if (!creatorOnboardingEditable(existing?.status, creator)) return back(req, "application_locked", "questionnaire");
    const revision = String(form.get("revision") || "");
    // Every question is optional for Moxy creators (Ronan, 2026-10-03).
    const moxy = isMoxy(creator.name);
    if (moxy && !existing?.id) return back(req, "questionnaire_saved", "questionnaire");
    if (!existing?.id || !revision) return back(req, "questionnaire_missing", "questionnaire");
    if (existing.updated_at !== revision) return back(req, "questionnaire_conflict", "questionnaire");
    const answers = (existing.answers || {}) as Record<string, string>;
    const missing = moxy ? [] : questionnaireRequiredMissing(answers);
    if (missing.length) return back(req, "questionnaire_missing", "questionnaire", creatorQuestionnairePageForQuestion(missing[0]).slug);

    const sealedAt = nextQuestionnaireRevision(existing.updated_at);
    const { data: sealed, error: sealError } = await supabaseAdmin
      .from("creator_applications")
      .update({ updated_at: sealedAt })
      .eq("id", existing.id)
      .eq("creator_account_id", accountId)
      .eq("status", existing.status)
      .eq("updated_at", revision)
      .select("updated_at")
      .maybeSingle();
    if (sealError) return back(req, "error", "questionnaire");
    if (!sealed) return back(req, "questionnaire_conflict", "questionnaire");

    const { error: progressError } = await supabaseAdmin
      .from("creator_onboarding_progress")
      .upsert({ creator_account_id: accountId, questionnaire_completed: true, updated_at: sealedAt }, { onConflict: "creator_account_id" });
    if (progressError) return back(req, "error", "questionnaire");
    return back(req, "questionnaire_saved", "questionnaire");
  }

  if (action === "skip_voice" || action === "consent") {
    const { data: existing, error } = await latestApplication(accountId);
    if (error) return back(req, "error", action === "consent" ? "consent" : "voice");
    if (!creatorOnboardingEditable(existing?.status, creator)) return back(req, "application_locked", action === "consent" ? "consent" : "voice");
  }

  if (action === "skip_voice") {
    const { error } = await supabaseAdmin
      .from("creator_onboarding_progress")
      .upsert({ creator_account_id: accountId, voice_completed: true, updated_at: now }, { onConflict: "creator_account_id" });
    if (error) return back(req, "error", "voice");
    return back(req, "voice_skipped", "voice");
  }

  if (action === "consent") {
    const legalName = String(form.get("legal_name") || "").trim();
    const agreed = form.get("agreed") === "on";
    if (!legalName || !agreed) return back(req, "consent_missing", "consent");

    const { data: existing, error: readError } = await supabaseAdmin
      .from("creator_consents")
      .select("id")
      .eq("creator_account_id", accountId)
      .eq("consent_version", "twin-creator-consent-v1")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (readError) return back(req, "error", "consent");
    if (!existing) {
      const { error } = await supabaseAdmin
        .from("creator_consents")
        .insert({ creator_account_id: accountId, legal_name: legalName, consent_version: "twin-creator-consent-v1", signed_at: now });
      if (error) return back(req, "error", "consent");
    }
    return back(req, "consent_saved", "consent");
  }

  if (action === "submit") {
    const [progressResult, consentResult, filesResult, applicationResult] = await Promise.all([
      supabaseAdmin.from("creator_onboarding_progress").select("questionnaire_completed,content_completed,voice_completed").eq("creator_account_id", accountId).maybeSingle(),
      supabaseAdmin.from("creator_consents").select("id").eq("creator_account_id", accountId).limit(1).maybeSingle(),
      supabaseAdmin.from("creator_files").select("kind,storage_transfer_status").eq("creator_account_id", accountId),
      latestApplication(accountId),
    ]);
    if (progressResult.error || consentResult.error || filesResult.error || applicationResult.error) return back(req, "error", "consent");
    const progress = progressResult.data;
    const consent = consentResult.data;
    const files = filesResult.data;
    const existing = applicationResult.data;
    if (existing && CREATOR_QUESTIONNAIRE_TERMINAL_STATUSES.has(existing.status)) return NextResponse.redirect(creatorRequestUrl(req, "/creator"), 303);
    if (existing && existing.status !== "draft") return back(req, "application_locked", "consent");
    // Every step is optional for Moxy creators (Ronan, 2026-10-03): they can submit without filling anything in.
    const moxy = isMoxy(creator.name);
    const questionnaireComplete = moxy || (!!progress?.questionnaire_completed && !!existing && questionnaireRequiredMissing((existing.answers || {}) as Record<string, string>).length === 0);
    const contentComplete = moxy || creatorContentCompleted(files || [], !!progress?.content_completed);
    const voiceComplete = moxy || !!progress?.voice_completed || (files || []).some((file) => file.kind === "voice" && file.storage_transfer_status === "verified");
    if (!questionnaireComplete || !contentComplete || !voiceComplete || (!consent && !moxy)) {
      return back(req, "not_ready", "consent");
    }

    let application = existing;
    if (!application) {
      // A Moxy creator who never opened the questionnaire has no draft yet; start an empty one to submit.
      const { data: created, error: createError } = await supabaseAdmin
        .from("creator_applications")
        .insert({ id: accountId, creator_account_id: accountId, answers: {}, status: "draft", updated_at: now })
        .select("id,status,answers,updated_at")
        .single();
      if (createError?.code === "23505") return back(req, "questionnaire_conflict", "consent");
      if (createError || !created) return back(req, submissionErrorStatus(createError), "consent");
      application = created;
    }

    const submittedAt = nextQuestionnaireRevision(application.updated_at);
    const { data: submittedApplication, error } = await supabaseAdmin
      .from("creator_applications")
      .update({ status: "submitted", submitted_at: now, updated_at: submittedAt })
      .eq("id", application.id)
      .eq("creator_account_id", accountId)
      .eq("status", "draft")
      .eq("updated_at", application.updated_at)
      .select("id")
      .maybeSingle();
    if (error) return back(req, submissionErrorStatus(error), "consent");
    if (!submittedApplication) return back(req, "questionnaire_conflict", "consent");
    return NextResponse.redirect(creatorRequestUrl(req, "/creator?submitted=1"), 303);
  }

  return back(req, "error");
}
