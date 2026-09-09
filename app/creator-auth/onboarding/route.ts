import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";
import { CREATOR_SESSION_COOKIE, verifyCreatorSession } from "@/lib/creator-session";
import { creatorRequestUrl } from "@/lib/creator-origin";
import { CREATOR_QUESTIONNAIRE } from "@/lib/creator-questionnaire";

function back(req: Request, status: string) {
  const url = creatorRequestUrl(req, "/creator/onboarding");
  url.searchParams.set("status", status);
  return NextResponse.redirect(url, 303);
}

async function getSession() {
  return verifyCreatorSession((await cookies()).get(CREATOR_SESSION_COOKIE)?.value);
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

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(creatorRequestUrl(req, "/creator/login"), 303);
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
      return back(req, "questionnaire_missing");
    }

    const existing = await latestApplication(session.accountId);
    if (existing?.id) {
      const merged = { ...(existing.answers || {}), ...answers };
      const { error } = await supabaseAdmin
        .from("creator_applications")
        .update({ answers: merged, status: existing.status === "submitted" ? "submitted" : "draft", updated_at: now })
        .eq("id", existing.id);
      if (error) return back(req, "error");
    } else {
      const { error } = await supabaseAdmin
        .from("creator_applications")
        .insert({ creator_account_id: session.accountId, answers, status: "draft" });
      if (error) return back(req, "error");
    }

    await supabaseAdmin
      .from("creator_onboarding_progress")
      .upsert({ creator_account_id: session.accountId, questionnaire_completed: true, updated_at: now }, { onConflict: "creator_account_id" });
    return back(req, "questionnaire_saved");
  }

  if (action === "skip_voice") {
    await supabaseAdmin
      .from("creator_onboarding_progress")
      .upsert({ creator_account_id: session.accountId, voice_completed: true, updated_at: now }, { onConflict: "creator_account_id" });
    return back(req, "voice_skipped");
  }

  if (action === "consent") {
    const legalName = String(form.get("legal_name") || "").trim();
    const agreed = form.get("agreed") === "on";
    if (!legalName || !agreed) return back(req, "consent_missing");

    const { data: existing } = await supabaseAdmin
      .from("creator_consents")
      .select("id")
      .eq("creator_account_id", session.accountId)
      .eq("consent_version", "twin-creator-consent-v1")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabaseAdmin
        .from("creator_consents")
        .insert({ creator_account_id: session.accountId, legal_name: legalName, consent_version: "twin-creator-consent-v1", signed_at: now });
      if (error) return back(req, "error");
    }
    return back(req, "consent_saved");
  }

  if (action === "submit") {
    const [{ data: progress }, { data: consent }, { data: files }] = await Promise.all([
      supabaseAdmin.from("creator_onboarding_progress").select("questionnaire_completed,content_completed,voice_completed").eq("creator_account_id", session.accountId).maybeSingle(),
      supabaseAdmin.from("creator_consents").select("id").eq("creator_account_id", session.accountId).limit(1).maybeSingle(),
      supabaseAdmin.from("creator_files").select("kind,storage_transfer_status").eq("creator_account_id", session.accountId),
    ]);
    const hasContent = (files || []).some((f) => f.kind === "content" && f.storage_transfer_status === "verified");
    if (!progress?.questionnaire_completed || !progress?.content_completed || !progress?.voice_completed || !consent || !hasContent) {
      return back(req, "not_ready");
    }

    const existing = await latestApplication(session.accountId);
    if (existing?.id) {
      const { error } = await supabaseAdmin
        .from("creator_applications")
        .update({ status: "submitted", submitted_at: now, updated_at: now })
        .eq("id", existing.id);
      if (error) return back(req, "error");
    } else {
      const { error } = await supabaseAdmin
        .from("creator_applications")
        .insert({ creator_account_id: session.accountId, status: "submitted", submitted_at: now, answers: {} });
      if (error) return back(req, "error");
    }
    return NextResponse.redirect(creatorRequestUrl(req, "/creator?submitted=1"), 303);
  }

  return back(req, "error");
}
