import { NextRequest, NextResponse } from "next/server";
import { CREATOR_SESSION_COOKIE } from "@/lib/creator-session";
import { creatorDashboardIdentity } from "@/lib/creator-dashboard-identity";
import { trustedFormOrigin } from "@/lib/form-origin";
import { supabaseAdmin } from "@/lib/supabase";
import { FLIRT_QUESTIONNAIRE_PAGES } from "@/lib/flirt-questionnaire";
import { creatorOnboardingEditable, flirtOnboardingOptional } from "@/lib/flirt-onboarding";
import { COMPACT_QUESTIONNAIRE_ALIASES, previousCompactSavePage } from "@/lib/creator-questionnaire-compact";
import {
  creatorQuestionnairePage,
  nextQuestionnaireRevision,
  parseQuestionnairePagePatch,
} from "@/lib/creator-questionnaire-draft";

export const runtime = "nodejs";

const reply = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "private, no-store" },
});

export async function POST(req: NextRequest) {
  if (req.headers.has("next-action") || !trustedFormOrigin(req)) return reply({ error: "Untrusted request" }, 403);
  const creator = await creatorDashboardIdentity(req.cookies.get(CREATOR_SESSION_COOKIE)?.value);
  if (!creator || creator.readOnly) return reply({ error: "Creator access denied" }, 403);

  try {
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > 100_000) return reply({ error: "Questionnaire section is too large" }, 413);
    const body = await req.json() as { section?: unknown; answers?: unknown; revision?: unknown };
    if (typeof body.section !== "string" || typeof body.revision !== "string") return reply({ error: "Invalid autosave request" }, 400);
    const flirtPage = flirtOnboardingOptional() ? FLIRT_QUESTIONNAIRE_PAGES.find(page => page.slug === body.section) : undefined;
    const previousPage = previousCompactSavePage(body.section);
    const page = flirtPage || previousPage || creatorQuestionnairePage(body.section, true);
    if (!previousPage && page.slug !== (COMPACT_QUESTIONNAIRE_ALIASES[body.section] || body.section)) return reply({ error: "Invalid questionnaire section" }, 400);
    const patch = parseQuestionnairePagePatch(page, body.answers);
    if (!Object.keys(patch).length) return reply({ error: "No questionnaire answers supplied" }, 400);

    const { data: existing, error: readError } = await supabaseAdmin
      .from("creator_applications")
      .select("id,status,answers,updated_at")
      .eq("creator_account_id", creator.accountId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (readError) return reply({ error: "Questionnaire could not be loaded" }, 503);
    if (!creatorOnboardingEditable(existing?.status)) return reply({ error: "This application is locked" }, 409);
    if (!existing && body.revision) return reply({ error: "Questionnaire changed in another window. Refresh before saving." }, 409);
    if (existing && (!body.revision || body.revision !== existing.updated_at)) {
      return reply({ error: "Questionnaire changed in another window. Refresh before saving." }, 409);
    }

    const now = nextQuestionnaireRevision(existing?.updated_at);
    const merged = { ...((existing?.answers || {}) as Record<string, string>), ...patch };
    if (!existing) {
      const { data, error } = await supabaseAdmin
        .from("creator_applications")
        .insert({ id: creator.accountId, creator_account_id: creator.accountId, answers: merged, status: "draft", updated_at: now })
        .select("updated_at")
        .single();
      if (error?.code === "23505") return reply({ error: "Questionnaire changed in another window. Refresh before saving." }, 409);
      if (error || !data) return reply({ error: "Questionnaire could not be saved" }, 503);
      return reply({ ok: true, revision: data.updated_at });
    }

    const { data, error } = await supabaseAdmin
      .from("creator_applications")
      .update({ answers: merged, updated_at: now })
      .eq("id", existing.id)
      .eq("creator_account_id", creator.accountId)
      .eq("status", existing.status)
      .eq("updated_at", existing.updated_at)
      .select("updated_at")
      .maybeSingle();
    if (error) return reply({ error: "Questionnaire could not be saved" }, 503);
    if (!data) return reply({ error: "Questionnaire changed in another window. Refresh before saving." }, 409);
    return reply({ ok: true, revision: data.updated_at });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "Questionnaire could not be saved" }, 400);
  }
}

