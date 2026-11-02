import "server-only";
import { cache } from "react";
import { serviceClient } from "./supabase-service";
import type { CreatorDashboardIdentity } from "./creator-dashboard-identity";
import { CREATOR_PROFILE_QUESTIONS, creatorProfileAnswers } from "./creator-questionnaire-profile";
import { CREATOR_CONTENT_REQUIREMENTS } from "./creator-content-requirements";
import { contentFolders } from "./creator-content-intake";
import type { CreatorPreparation } from "./creator-preparation-model";

/** Read-only projection of the signed-in creator's existing intake. No paths, answers or consent text leave the server. */
export const getCreatorPreparation = cache(async (creator: Pick<CreatorDashboardIdentity, "accountId">): Promise<CreatorPreparation> => {
  const db = serviceClient(), accountId = creator.accountId;
  const contentKinds = ["content", ...CREATOR_CONTENT_REQUIREMENTS.map(item => item.kind)];
  const safe = async <T,>(query: PromiseLike<T>): Promise<T | null> => {
    try { return await query; } catch { return null; }
  };
  const [application, photos, videos, pending, consent] = await Promise.all([
    safe(db.from("creator_applications").select("answers").eq("creator_account_id", accountId).order("created_at", { ascending: false }).limit(1).maybeSingle()),
    safe(db.from("creator_files").select("id", { count: "exact", head: true }).eq("creator_account_id", accountId).in("kind", contentKinds).eq("storage_transfer_status", "verified").like("mime_type", "image/%")),
    safe(db.from("creator_files").select("id", { count: "exact", head: true }).eq("creator_account_id", accountId).in("kind", contentKinds).eq("storage_transfer_status", "verified").like("mime_type", "video/%")),
    safe(db.from("creator_files").select("id", { count: "exact", head: true }).eq("creator_account_id", accountId).in("kind", contentKinds).or("storage_transfer_status.is.null,storage_transfer_status.neq.verified")),
    safe(db.from("creator_consents").select("id", { count: "exact", head: true }).eq("creator_account_id", accountId)),
  ]);
  const count = (result: { error: unknown; count: number | null } | null) => result && !result.error && typeof result.count === "number" && Number.isSafeInteger(result.count) && result.count >= 0 ? result.count : null;
  const knownApplication = !!application && !application.error;
  const answers = knownApplication && application.data?.answers && typeof application.data.answers === "object" && !Array.isArray(application.data.answers) ? application.data.answers as Record<string, unknown> : {};
  const profile = creatorProfileAnswers(answers);
  const consentCount = count(consent);
  return {
    profile: { answered: knownApplication ? CREATOR_PROFILE_QUESTIONS.filter(question => !!profile[question.id]?.trim()).length : null, total: CREATOR_PROFILE_QUESTIONS.length },
    content: { photos: count(photos), videos: count(videos), pending: count(pending), folders: knownApplication ? contentFolders(answers).length : null },
    consentSaved: consentCount === null ? null : consentCount > 0,
  };
});
