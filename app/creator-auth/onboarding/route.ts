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
import { creatorOnboardingEditable, flirtOnboardingOptional } from "@/lib/flirt-onboarding";

function back(req: Request, status: string, step?: "questionnaire" | "content" | "voice" | "consent", section?: string) {
  const url = creatorRequestUrl(req, "/creator/onboarding");
  url.searchParams.set("status", status);
  if (step) url.searchParams.set("step", step);
  if (section) url.searchParams.set("section", section);
  url.hash = "step-result";
  return NextResponse.redirect(url, 303);
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
  const optional = flirtOnboardingOptional();

  if (action === "questionnaire") {
    const loaded = await latestApplication(accountId);
    if (loaded.error) return back(req, "error", "questionnaire");
    let existing = loaded.data;
    if (!optional && existing && CREATOR_QUESTIONNAIRE_TERMINAL_STATUSES.has(existing.status)) return back(req, "questionnaire_saved", "questionnaire");
    if (!creatorOnboardingEditable(existing?.status, optional)) return back(req, "application_locked", "questionnaire");
    let revision = String(form.get("revision") || "");
    // A creator who clicks through without typing has not triggered autosave.
    // Create only their empty draft; never manufacture questionnaire answers.
    if (!existing && optional && !revision) {
      const created = await supabaseAdmin.from("creator_applications")
        .insert({ id: accountId, creator_account_id: accountId, answers: {}, status: "draft", updated_at: now })
        .select("id,status,answers,updated_at").single();
      if (created.error?.code === "23505") return back(req, "questionnaire_conflict", "questionnaire");
      if (created.error || !created.data) return back(req, "error", "questionnaire");
      existing = created.data;
      revision = existing.updated_at;
    }
    if (!existing?.id || !revision) return back(req, "questionnaire_missing", "questionnaire");
    if (existing.updated_at !== revision) return back(req, "questionnaire_conflict", "questionnaire");
    const answers = (existing.answers || {}) as Record<string, string>;
    const missing = questionnaireRequiredMissing(answers);
    if (!optional && missing.length) return back(req, "questionnaire_missing", "questionnaire", creatorQuestionnairePageForQuestion(missing[0]).slug);

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
    return back(req, "questionnaire_saved", optional ? "content" : "questionnaire");
  }

  if (action === "skip_voice" || action === "consent") {
    const { data: existing, error } = await latestApplication(accountId);
    if (error) return back(req, "error", action === "consent" ? "consent" : "voice");
    if (!creatorOnboardingEditable(existing?.status, optional)) return back(req, "application_locked", action === "consent" ? "consent" : "voice");
  }

  if (action === "skip_voice") {
    const { error } = await supabaseAdmin
      .from("creator_onboarding_progress")
      .upsert({ creator_account_id: accountId, voice_completed: true, updated_at: now }, { onConflict: "creator_account_id" });
    if (error) return back(req, "error", "voice");
    return back(req, "voice_skipped", optional ? "consent" : "voice");
  }

  if (action === "consent") {
    const legalName = String(form.get("legal_name") || "").trim();
    const agreed = form.get("agreed") === "on";
    // Skipping consent is not agreement. No name, signature or consent row is invented.
    if (!legalName || !agreed) return back(req, optional ? "consent_skipped" : "consent_missing", "consent");

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
    const questionnaireComplete = !!progress?.questionnaire_completed && !!existing && questionnaireRequiredMissing((existing.answers || {}) as Record<string, string>).length === 0;
    const contentComplete = creatorContentCompleted(files || [], !!progress?.content_completed);
    const voiceComplete = !!progress?.voice_completed || (files || []).some((file) => file.kind === "voice" && file.storage_transfer_status === "verified");
    if (!optional && (!questionnaireComplete || !contentComplete || !voiceComplete || !consent)) {
      return back(req, "not_ready", "consent");
    }

    // Intake submission grants workspace access only. It does not approve the
    // creator, create a clone, connect Telegram, grant consent or start a bot.
    const submittedAt = nextQuestionnaireRevision(existing?.updated_at);
    if (!existing) {
      if (!optional) return back(req, "not_ready", "consent");
      const { error } = await supabaseAdmin.from("creator_applications")
        .insert({ id: accountId, creator_account_id: accountId, answers: {}, status: "submitted", submitted_at: now, updated_at: submittedAt });
      if (error?.code === "23505") return back(req, "questionnaire_conflict", "consent");
      if (error) return back(req, "error", "consent");
      return NextResponse.redirect(creatorRequestUrl(req, "/creator?submitted=1"), 303);
    }
    const { data: submittedApplication, error } = await supabaseAdmin
      .from("creator_applications")
      .update({ status: "submitted", submitted_at: now, updated_at: submittedAt })
      .eq("id", existing.id)
      .eq("creator_account_id", accountId)
      .eq("status", "draft")
      .eq("updated_at", existing.updated_at)
      .select("id")
      .maybeSingle();
    if (error) return back(req, "error", "consent");
    if (!submittedApplication) return back(req, "questionnaire_conflict", "consent");
    return NextResponse.redirect(creatorRequestUrl(req, "/creator?submitted=1"), 303);
  }

  return back(req, "error");
}
