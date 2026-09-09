"use server";

import { guardDashboardAction } from "@/lib/agency-management";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { requireCloneAccess } from "@/lib/dashboard-access";
import {
  canEditRevision,
  canTransitionRevision,
  publishBlockers,
  revisionEditBlocker,
  revisionTransitionBlocker,
  sessionOperatorPatch,
  patchTouchesOwnership,
  type PartDraft,
  type RevisionState,
  type SessionStatus,
} from "@/lib/sequence-policy";

type RevisionRow = {
  id: string;
  sequence_id: string;
  revision_no: number;
  state: RevisionState;
  approved_by: string | null;
  approved_at: string | null;
};

/** Resolve a revision and prove it belongs to this creator. Every revision
 *  action goes through here, so tenant isolation is in one place. */
async function ownedRevision(cloneId: string, revisionId: string): Promise<{ revision: RevisionRow; sourceCaption: string | null }> {
  const { data, error } = await supabaseAdmin
    .from("video_sequence_revisions")
    .select("id,sequence_id,revision_no,state,approved_by,approved_at,video_sequences!inner(clone_id,source_video_id)")
    .eq("id", revisionId)
    .eq("video_sequences.clone_id", cloneId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sequence revision not found for this creator");
  const row = data as unknown as RevisionRow & { video_sequences: { source_video_id: string | null } };

  let sourceCaption: string | null = null;
  const sourceId = row.video_sequences?.source_video_id ?? null;
  if (sourceId) {
    const { data: video } = await supabaseAdmin.from("videos").select("caption").eq("id", sourceId).maybeSingle();
    sourceCaption = (video as { caption: string | null } | null)?.caption ?? null;
  }
  return { revision: row, sourceCaption };
}

function parsePartDrafts(raw: FormDataEntryValue | null): PartDraft[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw ?? "[]"));
  } catch {
    throw new Error("Could not read the clip list");
  }
  if (!Array.isArray(parsed)) throw new Error("Could not read the clip list");
  return parsed.map((entry, index) => {
    const p = entry as Record<string, unknown>;
    const position = Number(p.position);
    const start = Number(p.sourceStartSeconds);
    const end = Number(p.sourceEndSeconds);
    if (!Number.isSafeInteger(position) || position < 0) throw new Error(`Clip ${index + 1} has an invalid position`);
    if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error(`Clip ${index + 1} has an invalid time range`);
    const isPreview = p.isPreview === true;
    const priceRaw = p.priceStars;
    const priceStars = isPreview || priceRaw === null || priceRaw === "" || priceRaw === undefined ? null : Number(priceRaw);
    if (priceStars !== null && !Number.isSafeInteger(priceStars)) throw new Error(`Clip ${index + 1} has an invalid price`);
    const requires = p.requiresPosition;
    return {
      position,
      isPreview,
      caption: typeof p.caption === "string" ? p.caption.trim() || null : null,
      priceStars,
      sourceStartSeconds: start,
      sourceEndSeconds: end,
      requiresPosition: requires === null || requires === "" || requires === undefined ? null : Number(requires),
    } satisfies PartDraft;
  });
}

// ── Sequence lifecycle ──────────────────────────────────────────────────────

export async function createSequence(cloneId: string, fd: FormData) {
  await guardDashboardAction("app/sequences/actions.ts#createSequence", [cloneId, fd]);
  await requireCloneAccess(cloneId);
  const title = String(fd.get("title") ?? "").trim();
  const sourceVideoId = String(fd.get("sourceVideoId") ?? "").trim() || null;
  if (title.length < 1 || title.length > 200) throw new Error("Give the sequence a title of 1 to 200 characters");

  // The source recording and everything cut from it share one content family,
  // so owning the full video blocks its clips being resold as new content.
  let contentFamilyId = crypto.randomUUID();
  if (sourceVideoId) {
    const { data: video, error } = await supabaseAdmin
      .from("videos").select("id,clone_id,content_family_id").eq("id", sourceVideoId).eq("clone_id", cloneId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!video) throw new Error("That video does not belong to this creator");
    const existing = (video as { content_family_id: string | null }).content_family_id;
    if (existing) contentFamilyId = existing;
    else await supabaseAdmin.from("videos").update({ content_family_id: contentFamilyId }).eq("id", sourceVideoId);
  }

  const { data: sequence, error: seqErr } = await supabaseAdmin
    .from("video_sequences")
    .insert({ clone_id: cloneId, title, source_video_id: sourceVideoId, content_family_id: contentFamilyId })
    .select("id").single();
  if (seqErr) throw new Error(seqErr.message);

  const { error: revErr } = await supabaseAdmin
    .from("video_sequence_revisions")
    .insert({ sequence_id: (sequence as { id: string }).id, revision_no: 1, state: "draft" });
  if (revErr) throw new Error(revErr.message);

  revalidatePath("/sequences");
}

export async function saveSequenceParts(cloneId: string, revisionId: string, fd: FormData) {
  await guardDashboardAction("app/sequences/actions.ts#saveSequenceParts", [cloneId, revisionId, fd]);
  await requireCloneAccess(cloneId);
  const { revision } = await ownedRevision(cloneId, revisionId);

  const blocker = revisionEditBlocker(revision.state);
  if (blocker) throw new Error(blocker);

  const parts = parsePartDrafts(fd.get("parts"));
  if (!canEditRevision(revision.state)) throw new Error("This revision is not editable");

  // A draft manifest is replaced wholesale. The database trigger from migration
  // 147 refuses this outright once the revision is published, so an edit that
  // slipped past the state check above still cannot rewrite a sold product.
  const { error: delErr } = await supabaseAdmin.from("video_sequence_parts").delete().eq("revision_id", revisionId);
  if (delErr) throw new Error(delErr.message);

  if (parts.length) {
    const rows = parts.map((p) => ({
      revision_id: revisionId,
      position: p.position,
      is_preview: p.isPreview,
      // The renderer fills the real path. A draft row keeps a placeholder so the
      // manifest can be reviewed before anything is cut.
      storage_path: String(fd.get(`storagePath:${p.position}`) ?? `pending/${revisionId}/${p.position}`),
      caption: p.caption,
      source_start_seconds: p.sourceStartSeconds,
      source_end_seconds: p.sourceEndSeconds,
      price_stars: p.priceStars,
      requires_position: p.requiresPosition,
    }));
    const { error: insErr } = await supabaseAdmin.from("video_sequence_parts").insert(rows);
    if (insErr) throw new Error(insErr.message);
  }

  revalidatePath(`/sequences/${revisionId}`);
  revalidatePath("/sequences");
}

export async function approveSequenceRevision(cloneId: string, revisionId: string, fd: FormData) {
  await guardDashboardAction("app/sequences/actions.ts#approveSequenceRevision", [cloneId, revisionId, fd]);
  await requireCloneAccess(cloneId);
  const { revision } = await ownedRevision(cloneId, revisionId);
  const approver = String(fd.get("approvedBy") ?? "").trim();
  if (!approver) throw new Error("Record who approved this cut");

  const blocker = revisionTransitionBlocker(revision.state, "review_required");
  if (revision.state !== "review_required" && blocker) throw new Error(blocker);

  const { error } = await supabaseAdmin
    .from("video_sequence_revisions")
    .update({ state: "review_required", approved_by: approver, approved_at: new Date().toISOString() })
    .eq("id", revisionId);
  if (error) throw new Error(error.message);
  revalidatePath(`/sequences/${revisionId}`);
}

export async function publishSequenceRevision(cloneId: string, revisionId: string, fd: FormData) {
  await guardDashboardAction("app/sequences/actions.ts#publishSequenceRevision", [cloneId, revisionId, fd]);
  await requireCloneAccess(cloneId);
  const { revision, sourceCaption } = await ownedRevision(cloneId, revisionId);

  const { data: partRows, error: partsErr } = await supabaseAdmin
    .from("video_sequence_parts")
    .select("position,is_preview,caption,price_stars,source_start_seconds,source_end_seconds,requires_position")
    .eq("revision_id", revisionId).order("position");
  if (partsErr) throw new Error(partsErr.message);

  const parts: PartDraft[] = (partRows ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      position: Number(row.position),
      isPreview: row.is_preview === true,
      caption: (row.caption as string | null) ?? null,
      priceStars: row.price_stars === null ? null : Number(row.price_stars),
      sourceStartSeconds: Number(row.source_start_seconds),
      sourceEndSeconds: Number(row.source_end_seconds),
      requiresPosition: row.requires_position === null ? null : Number(row.requires_position),
    };
  });

  const blockers = publishBlockers({
    state: revision.state,
    approvedBy: revision.approved_by,
    approvedAt: revision.approved_at,
    parts,
    sourceCaption,
  });
  if (blockers.length) throw new Error(blockers.join(" "));

  const { error } = await supabaseAdmin
    .from("video_sequence_revisions")
    .update({ state: "published", published_at: new Date().toISOString() })
    .eq("id", revisionId);
  if (error) throw new Error(error.message);
  revalidatePath(`/sequences/${revisionId}`);
  revalidatePath("/sequences");
}

export async function withdrawSequenceRevision(cloneId: string, revisionId: string, fd: FormData) {
  await guardDashboardAction("app/sequences/actions.ts#withdrawSequenceRevision", [cloneId, revisionId, fd]);
  await requireCloneAccess(cloneId);
  const { revision } = await ownedRevision(cloneId, revisionId);
  if (!canTransitionRevision(revision.state, "unavailable")) {
    throw new Error(revisionTransitionBlocker(revision.state, "unavailable") ?? "This revision cannot be withdrawn");
  }
  // Withdrawing stops new offers. Purchases, entitlements and support history
  // are untouched, so an existing buyer keeps what he paid for.
  const { error } = await supabaseAdmin
    .from("video_sequence_revisions").update({ state: "unavailable" }).eq("id", revisionId);
  if (error) throw new Error(error.message);
  revalidatePath(`/sequences/${revisionId}`);
  revalidatePath("/sequences");
}

// ── Fan session controls ────────────────────────────────────────────────────

export async function setFanSequenceStatus(fd: FormData) {
  await guardDashboardAction("app/sequences/actions.ts#setFanSequenceStatus", [fd]);
  const userId = String(fd.get("userId") ?? "");
  const cloneId = String(fd.get("cloneId") ?? "");
  const next = String(fd.get("status") ?? "") as SessionStatus;
  const reason = String(fd.get("reason") ?? "").trim() || null;
  await requireCloneAccess(cloneId);
  if (!["active", "paused", "stopped"].includes(next)) throw new Error("Unsupported sequence status");

  const { data, error } = await supabaseAdmin
    .from("video_sequence_sessions")
    .select("clone_id,user_id,status,lock_version")
    .eq("clone_id", cloneId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("This fan has no sequence session");
  const session = data as { status: SessionStatus; lock_version: number };

  const patch = sessionOperatorPatch(next, reason, session.lock_version);
  // Belt and braces: the patch builder is pure and tested, but a future edit
  // that added an ownership field here would silently delete paid content.
  if (patchTouchesOwnership(patch)) throw new Error("Refusing a sequence update that reaches beyond session state");

  const { data: updated, error: updErr } = await supabaseAdmin
    .from("video_sequence_sessions")
    .update(patch)
    .eq("clone_id", cloneId).eq("user_id", userId)
    .eq("lock_version", session.lock_version)
    .select("user_id");
  if (updErr) throw new Error(updErr.message);
  if (!updated?.length) throw new Error("This session changed while you were looking at it. Reload and try again.");

  revalidatePath(`/clones/${cloneId}/fans/${userId}`);
  revalidatePath("/sequences");
}
