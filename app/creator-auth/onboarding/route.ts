import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { CREATOR_SESSION_COOKIE } from "@/lib/creator-session";
import { creatorDashboardIdentity } from "@/lib/creator-dashboard-identity";
import { creatorRequestUrl } from "@/lib/creator-origin";
import { CREATOR_QUESTIONNAIRE } from "@/lib/creator-questionnaire";
import { CREATOR_PORTAL_COOKIE, creatorLoginPath } from "@/lib/creator-routing";

function back(req: Request, status: string, step?: "questionnaire" | "voice" | "consent") {
  const url = creatorRequestUrl(req, "/creator/onboarding");
  url.searchParams.set("status", status);
  if (step) url.searchParams.set("step", step);
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
  const { data } = await supabaseAdmin
    .from("creator_applications")
    .select("id,status,answers")
    .eq("creator_account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
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
    const answers: Record<string, string> = {};
    for (const question of CREATOR_QUESTIONNAIRE) {
      const values = form.getAll(question.id).map((value) => String(value || "").trim());
      const value = [...values].reverse().find(Boolean) ?? "";
      if (!(question.id in answers) || value) answers[question.id] = value;
    }
    if (!answers.full_name || !answers.preferred_name || !answers.platforms || !answers.boundaries) {
      return back(req, "questionnaire_missing", "questionnaire");
    }

    const existing = await latestApplication(accountId);
    if (existing?.id) {
      const merged = { ...(existing.answers || {}), ...answers };
      const { error } = await supabaseAdmin
        .from("creator_applications")
        .update({ answers: merged, status: existing.status === "submitted" ? "submitted" : "draft", updated_at: now })
        .eq("id", existing.id);
      if (error) return back(req, "error", "questionnaire");
    } else {
      const { error } = await supabaseAdmin
        .from("creator_applications")
        .insert({ creator_account_id: accountId, answers, status: "draft" });
      if (error) return back(req, "error", "questionnaire");
    }

    const { error: progressError } = await supabaseAdmin
      .from("creator_onboarding_progress")
      .upsert({ creator_account_id: accountId, questionnaire_completed: true, updated_at: now }, { onConflict: "creator_account_id" });
    if (progressError) return back(req, "error", "questionnaire");
    return back(req, "questionnaire_saved", "questionnaire");
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

    const { data: existing } = await supabaseAdmin
      .from("creator_consents")
      .select("id")
      .eq("creator_account_id", accountId)
      .eq("consent_version", "twin-creator-consent-v1")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabaseAdmin
        .from("creator_consents")
        .insert({ creator_account_id: accountId, legal_name: legalName, consent_version: "twin-creator-consent-v1", signed_at: now });
      if (error) return back(req, "error", "consent");
    }
    return back(req, "consent_saved", "consent");
  }

  if (action === "submit") {
    const [{ data: progress }, { data: consent }, { data: files }] = await Promise.all([
      supabaseAdmin.from("creator_onboarding_progress").select("questionnaire_completed,content_completed,voice_completed").eq("creator_account_id", accountId).maybeSingle(),
      supabaseAdmin.from("creator_consents").select("id").eq("creator_account_id", accountId).limit(1).maybeSingle(),
      supabaseAdmin.from("creator_files").select("kind,storage_transfer_status").eq("creator_account_id", accountId),
    ]);
    const hasContent = (files || []).some((f) => f.kind === "content" && f.storage_transfer_status === "verified");
    if (!progress?.questionnaire_completed || !progress?.content_completed || !progress?.voice_completed || !consent || !hasContent) {
      return back(req, "not_ready", "consent");
    }

    const existing = await latestApplication(accountId);
    if (existing?.id) {
      const { error } = await supabaseAdmin
        .from("creator_applications")
        .update({ status: "submitted", submitted_at: now, updated_at: now })
        .eq("id", existing.id);
      if (error) return back(req, "error", "consent");
    } else {
      const { error } = await supabaseAdmin
        .from("creator_applications")
        .insert({ creator_account_id: accountId, status: "submitted", submitted_at: now, answers: {} });
      if (error) return back(req, "error", "consent");
    }
    return NextResponse.redirect(creatorRequestUrl(req, "/creator?submitted=1"), 303);
  }

  return back(req, "error");
}
