"use server";

import { guardDashboardAction } from "@/lib/agency-management";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { requireCloneAccess } from "@/lib/dashboard-access";
import {
  canEditRevision,
  canTransitionRevision,
  manifestBlockers,
  publishBlockers,
  PENDING_STORAGE_PREFIX,
  revisionEditBlocker,
  revisionTransitionBlocker,
  sessionOperatorPatch,
  patchTouchesOwnership,
  type PartDraft,
  type RenderEvidence,
  type RenderJobStatus,
  type RevisionState,
  type SessionStatus,
} from "@/lib/sequence-policy";
import { cutPointRows, cutPointsFromParts, validateCutList } from "@/lib/sequence-render";

type RevisionRow = {
  id: string;
  sequence_id: string;
  revision_no: number;
  state: RevisionState;
  approved_by: string | null;
  approved_at: string | null;
};

type SourceVideo = { id: string; storagePath: string; caption: string | null };

/** Resolve a revision and prove it belongs to this creator. Every revision
 *  action goes through here, so tenant isolation is in one place. */
async function ownedRevision(
  cloneId: string,
  revisionId: string,
): Promise<{ revision: RevisionRow; sourceCaption: string | null; source: SourceVideo | null }> {
  const { data, error } = await supabaseAdmin
    .from("video_sequence_revisions")
    .select("id,sequence_id,revision_no,state,approved_by,approved_at,video_sequences!inner(clone_id,source_video_id)")
    .eq("id", revisionId)
    .eq("video_sequences.clone_id", cloneId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sequence revision not found for this creator");
  const row = data as unknown as RevisionRow & { video_sequences: { source_video_id: string | null } };

  let source: SourceVideo | null = null;
  const sourceId = row.video_sequences?.source_video_id ?? null;
  if (sourceId) {
    // Scoped to the creator a second time. The sequence already proved
    // ownership, but the recording is a separate row and a re-pointed
    // source_video_id must not become a way to read another creator's file.
    const { data: video } = await supabaseAdmin
      .from("videos").select("id,caption,storage_path").eq("id", sourceId).eq("clone_id", cloneId).maybeSingle();
    const found = video as { id: string; caption: string | null; storage_path: string } | null;
    if (found) source = { id: found.id, storagePath: found.storage_path, caption: found.caption };
  }
  return { revision: row, sourceCaption: source?.caption ?? null, source };
}

/** The revision's clip rows plus the newest render job, which together are the
 *  only evidence that the approved cut has actually been produced. */
async function renderEvidence(revisionId: string): Promise<RenderEvidence> {
  const [{ data: partRows, error: partsErr }, { data: jobRows, error: jobErr }] = await Promise.all([
    supabaseAdmin.from("video_sequence_parts")
      .select("position,storage_path,duration_seconds").eq("revision_id", revisionId).order("position"),
    supabaseAdmin.from("video_sequence_jobs")
      .select("status,created_at").eq("revision_id", revisionId)
      .order("created_at", { ascending: false }).limit(1),
  ]);
  if (partsErr) throw new Error(partsErr.message);
  if (jobErr) throw new Error(jobErr.message);

  const job = ((jobRows ?? []) as { status: RenderJobStatus }[])[0] ?? null;
  return {
    jobStatus: job?.status ?? null,
    parts: (partRows ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        position: Number(row.position),
        storagePath: (row.storage_path as string | null) ?? null,
        durationSeconds: row.duration_seconds === null || row.duration_seconds === undefined
          ? null
          : Number(row.duration_seconds),
      };
    }),
  };
}

/** The revision's manifest as the reviewer edits it. */
async function partDrafts(revisionId: string): Promise<PartDraft[]> {
  const { data, error } = await supabaseAdmin
    .from("video_sequence_parts")
    .select("position,is_preview,caption,price_stars,source_start_seconds,source_end_seconds,requires_position")
    .eq("revision_id", revisionId).order("position");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
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
      // The renderer fills the real path, and nothing else may. A draft row
      // keeps a placeholder so the manifest can be reviewed before anything is
      // cut; publication refuses a part still carrying one. This used to accept
      // a storagePath:<n> form field, which let the browser hand the publish
      // gate a path with no file behind it.
      storage_path: `${PENDING_STORAGE_PREFIX}${revisionId}/${p.position}`,
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

/**
 * Approve a cut and hand it to the renderer.
 *
 * THE GAP THIS CLOSES: nothing in either repo ever wrote a video_sequence_jobs
 * row, so scripts/render-sequence.ts had no work to drain and no clip was ever
 * cut. Approval is the only moment a named human signs off on a set of
 * boundaries, and migration 148 makes approved_by/approved_at NOT NULL for
 * exactly that reason, so approval is where the job is born.
 *
 * The revision goes to 'processing', not straight to review: it is not
 * reviewable until the clips it describes exist.
 */
export async function approveSequenceRevision(cloneId: string, revisionId: string, fd: FormData) {
  await guardDashboardAction("app/sequences/actions.ts#approveSequenceRevision", [cloneId, revisionId, fd]);
  await requireCloneAccess(cloneId);
  const { revision, sourceCaption, source } = await ownedRevision(cloneId, revisionId);
  const approver = String(fd.get("approvedBy") ?? "").trim();
  if (!approver) throw new Error("Record who approved this cut");

  const blocker = revisionTransitionBlocker(revision.state, "processing");
  if (blocker) throw new Error(blocker);

  // Nothing can be cut without the recording. The job row's
  // source_storage_path is NOT NULL for the same reason: the worker downloads
  // bytes, not a catalogue entry.
  if (!source) throw new Error("This sequence has no source recording on file, so there is nothing to cut.");

  const parts = await partDrafts(revisionId);
  const problems = manifestBlockers(parts, sourceCaption);
  if (problems.length) throw new Error(problems.join(" "));

  const cuts = cutPointsFromParts(parts);
  // The source's real length is unknown here (videos carries no duration), so
  // every range is in bounds at this stage by definition. The worker measures
  // the file and runs this same validation again before it cuts anything,
  // which is the check that actually catches a range past the end.
  const cutErrors = validateCutList(cuts, { sourceDurationSeconds: Number.POSITIVE_INFINITY });
  if (cutErrors.length) throw new Error(cutErrors.map((e) => e.message).join(" "));

  // One live job per revision is a unique index in migration 148. Reading it
  // first turns a 23505 into a sentence the operator can act on.
  const { data: liveJobs, error: liveErr } = await supabaseAdmin
    .from("video_sequence_jobs").select("id,status").eq("revision_id", revisionId).in("status", ["queued", "running"]);
  if (liveErr) throw new Error(liveErr.message);
  if (liveJobs?.length) throw new Error("A render of this cut is already queued. Wait for it to finish.");

  const approvedAt = new Date().toISOString();
  const { error: jobErr } = await supabaseAdmin.from("video_sequence_jobs").insert({
    clone_id: cloneId,
    revision_id: revisionId,
    source_storage_path: source.storagePath,
    source_video_id: source.id,
    cut_points: cutPointRows(cuts),
    approved_by: approver,
    approved_at: approvedAt,
  });
  if (jobErr) throw new Error(jobErr.message);

  // The approval is recorded on the revision too, so the publish gate can see
  // it without joining the job ledger. The job row remains the immutable
  // record of what was signed off.
  const { error } = await supabaseAdmin
    .from("video_sequence_revisions")
    .update({ state: "processing", approved_by: approver, approved_at: approvedAt })
    .eq("id", revisionId);
  if (error) throw new Error(error.message);
  revalidatePath(`/sequences/${revisionId}`);
  revalidatePath("/sequences");
}

/**
 * Publish a revision the renderer has actually produced.
 *
 * THE GAP THIS CLOSES: this used to flip the revision to 'published' on the
 * strength of the manifest alone. The manifest is a list of timestamps. The
 * clips are made by the worker, which is what puts a real storage path and a
 * measured duration on each parts row, so publishing without that evidence
 * sells a fan a video file that was never cut.
 */
export async function publishSequenceRevision(cloneId: string, revisionId: string, fd: FormData) {
  await guardDashboardAction("app/sequences/actions.ts#publishSequenceRevision", [cloneId, revisionId, fd]);
  await requireCloneAccess(cloneId);
  const { revision, sourceCaption } = await ownedRevision(cloneId, revisionId);

  const [parts, render] = await Promise.all([partDrafts(revisionId), renderEvidence(revisionId)]);

  const blockers = publishBlockers({
    state: revision.state,
    approvedBy: revision.approved_by,
    approvedAt: revision.approved_at,
    parts,
    sourceCaption,
    render,
  });
  if (blockers.length) throw new Error(blockers.join(" "));

  // Conditional on the state we just read. Two operators clicking Publish at
  // once, or a withdrawal landing in between, must not produce two publishes.
  const { data: updated, error } = await supabaseAdmin
    .from("video_sequence_revisions")
    .update({ state: "published", published_at: new Date().toISOString() })
    .eq("id", revisionId)
    .eq("state", "review_required")
    .select("id");
  if (error) throw new Error(error.message);
  if (!updated?.length) throw new Error("This revision changed while you were looking at it. Reload and try again.");
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
