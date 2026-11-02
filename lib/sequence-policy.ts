// Pure policy for video sequences (migration 147): which state changes an
// operator may make, what is editable in each revision state, and why a fan's
// next part is not being offered.
//
// No database access, no React, no side effects. Every rule here is assertable
// offline in scripts/check-sequence-ui.ts, which is the point: this repo's
// dominant defect is "configured but inert": a control that saves, looks
// right, and is read by nothing. A rule that only exists inside a JSX handler
// cannot be tested and will drift.
import { MIN_PAID_MEDIA_PRICE_STARS } from "./pricing";

export const REVISION_STATES = ["draft", "processing", "review_required", "published", "unavailable"] as const;
export type RevisionState = (typeof REVISION_STATES)[number];

export const SESSION_STATUSES = ["invited", "active", "paused", "completed", "stopped"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const REVISION_STATE_LABELS: Record<RevisionState, string> = {
  draft: "Draft",
  processing: "Rendering",
  review_required: "Needs review",
  published: "Live",
  unavailable: "Withdrawn",
};

/** One clip as the reviewer is editing it, before it becomes a parts row. */
export type PartDraft = {
  position: number;
  isPreview: boolean;
  /** This clip's own description. Never the source recording's. */
  caption: string | null;
  priceStars: number | null;
  sourceStartSeconds: number;
  sourceEndSeconds: number;
  requiresPosition: number | null;
};

// ── Revision state machine ──────────────────────────────────────────────────
// A published revision is the product a customer already bought. It may be
// withdrawn from sale, and that is all: editing it would change what an
// existing buyer owns. Publishing a change means publishing a NEW revision.
const REVISION_TRANSITIONS: Record<RevisionState, readonly RevisionState[]> = {
  draft: ["processing", "review_required", "unavailable"],
  processing: ["review_required", "draft", "unavailable"],
  // review_required -> processing is the re-cut path. A reviewer who changes a
  // clip boundary after the first render has to send it back through the
  // renderer: the clips on disk no longer match the manifest, and publishing
  // that pair would sell footage nobody approved.
  review_required: ["published", "processing", "draft", "unavailable"],
  published: ["unavailable"],
  unavailable: [],
};

export function canTransitionRevision(from: RevisionState, to: RevisionState): boolean {
  return REVISION_TRANSITIONS[from].includes(to);
}

/** Null when the move is legal, otherwise the operator-facing reason. */
export function revisionTransitionBlocker(from: RevisionState, to: RevisionState): string | null {
  if (from === to) return "That revision is already in this state.";
  if (canTransitionRevision(from, to)) return null;
  if (from === "published") {
    return "A published revision can only be withdrawn. Publish a new revision to change the cut.";
  }
  if (from === "unavailable") return "A withdrawn revision cannot be changed. Create a new revision.";
  if (to === "published") return "Only a revision that has passed review can be published.";
  return `A ${REVISION_STATE_LABELS[from].toLowerCase()} revision cannot become ${REVISION_STATE_LABELS[to].toLowerCase()}.`;
}

// ── Editability ─────────────────────────────────────────────────────────────
const EDITABLE_STATES: readonly RevisionState[] = ["draft", "review_required"];

export function canEditRevision(state: RevisionState): boolean {
  return EDITABLE_STATES.includes(state);
}

export function revisionEditBlocker(state: RevisionState): string | null {
  if (canEditRevision(state)) return null;
  if (state === "published") return "This revision is live and cannot be edited. Publish a new revision instead.";
  if (state === "processing") return "This revision is still rendering. Wait for it to finish.";
  return "This revision has been withdrawn and cannot be edited.";
}

// ── Per-clip descriptions (brief section 4) ─────────────────────────────────
// A detail somewhere in the source recording is not evidence it appears in a
// given clip, so a clip may not simply carry the source video's caption. This
// is enforced rather than advised: reusing the source text blocks publication.
function normalizeCaption(value: string | null | undefined): string {
  return String(value ?? "").toLowerCase().replace(/\s+/g, " ").replace(/[.!?,;:]+$/g, "").trim();
}

export function descriptionIsInherited(partCaption: string | null, sourceCaption: string | null): boolean {
  const part = normalizeCaption(partCaption);
  const source = normalizeCaption(sourceCaption);
  if (!part || !source) return false;
  return part === source;
}

// ── Rendered evidence ───────────────────────────────────────────────────────
// THE GAP THIS SECTION CLOSES: publishing used to flip a revision to 'published'
// on the strength of the manifest alone. The manifest is only a list of
// timestamps. The clips themselves are produced by the render worker
// (scripts/render-sequence.ts), which is what writes a real storage path and a
// measured duration onto each parts row. Without that evidence a revision can
// be published whose parts point at "pending/<revision>/<n>", and the bot then
// tries to download a file that was never cut.
//
// So publication now requires proof of a render, not a promise of one.

/** The placeholder a draft manifest carries before anything has been cut. */
export const PENDING_STORAGE_PREFIX = "pending/";

/** Job states as they exist in video_sequence_jobs (migration 148). */
export type RenderJobStatus = "queued" | "running" | "succeeded" | "failed";

export type RenderedPart = {
  position: number;
  storagePath: string | null;
  /** Measured from the rendered file by the worker, never typed by anyone. */
  durationSeconds: number | null;
};

export type RenderEvidence = {
  /** The newest render job for this revision, or null when none was queued. */
  jobStatus: RenderJobStatus | null;
  parts: RenderedPart[];
};

/** Does this parts row point at a file the worker actually produced? */
export function isRenderedStoragePath(path: string | null | undefined): boolean {
  const value = String(path ?? "").trim();
  if (!value) return false;
  if (value.startsWith(PENDING_STORAGE_PREFIX)) return false;
  return value.toLowerCase().endsWith(".mp4");
}

/** Everything about the render that stands between this cut and publication. */
export function renderBlockers(evidence: RenderEvidence): string[] {
  const blockers: string[] = [];
  switch (evidence.jobStatus) {
    case null:
      blockers.push("This cut has never been rendered. Record an approval to send it to the renderer.");
      break;
    case "queued":
      blockers.push("This cut is waiting for the renderer. It can be published once the clips are cut.");
      break;
    case "running":
      blockers.push("This cut is being rendered right now. It can be published once the clips are cut.");
      break;
    case "failed":
      blockers.push("The last render of this cut failed. Fix the clip list and approve it again.");
      break;
    case "succeeded":
      break;
  }
  if (evidence.jobStatus !== "succeeded") return blockers;

  if (!evidence.parts.length) blockers.push("The renderer produced no clips for this revision.");
  for (const part of [...evidence.parts].sort((a, b) => a.position - b.position)) {
    const label = part.position === 0 ? "The preview" : `Part ${part.position}`;
    if (!isRenderedStoragePath(part.storagePath)) {
      blockers.push(`${label} has no rendered video file behind it.`);
    } else if (part.durationSeconds === null || !(part.durationSeconds > 0)) {
      blockers.push(`${label} has no measured duration, so it was not produced by the renderer.`);
    }
  }
  return blockers;
}

// ── Publish readiness ───────────────────────────────────────────────────────
export type PublishContext = {
  state: RevisionState;
  approvedBy: string | null;
  approvedAt: string | null;
  parts: PartDraft[];
  /** The source recording's caption, so an inherited description is caught. */
  sourceCaption: string | null;
  /** Proof the clips exist. REQUIRED rather than optional on purpose: an
   *  optional field is one a future caller forgets, and forgetting it is
   *  exactly the defect this whole file exists to prevent. */
  render: RenderEvidence;
};

/** Everything standing between this revision and publication, most structural
 *  first. Empty array means it is ready. */
export function publishBlockers(ctx: PublishContext): string[] {
  const blockers: string[] = [];
  const transition = revisionTransitionBlocker(ctx.state, "published");
  if (transition) blockers.push(transition);

  // Human approval is required and cannot be satisfied by any automatic step.
  if (!ctx.approvedBy || !ctx.approvedAt) blockers.push("A person must approve this cut before it can be published.");

  blockers.push(...manifestBlockers(ctx.parts, ctx.sourceCaption));
  blockers.push(...renderBlockers(ctx.render));
  return blockers;
}

/**
 * Everything wrong with the manifest itself: shape, prices, descriptions,
 * dependencies. Split out of publishBlockers because approving a cut has to
 * apply the SAME rules before a render job is queued. Rendering six clips and
 * only then discovering Part 3 has no description wastes minutes of ffmpeg and
 * leaves a revision that can never publish.
 */
export function manifestBlockers(draftParts: PartDraft[], sourceCaption: string | null): string[] {
  const blockers: string[] = [];
  const parts = [...draftParts].sort((a, b) => a.position - b.position);
  if (!parts.length) blockers.push("This revision has no clips.");

  const previews = parts.filter((p) => p.isPreview);
  if (previews.length > 1) blockers.push("Only one clip can be the free preview.");
  if (previews.some((p) => p.position !== 0)) blockers.push("The free preview must be the first clip, at position 0.");
  if (previews.some((p) => p.priceStars !== null)) blockers.push("The free preview cannot have a price.");

  const paid = parts.filter((p) => !p.isPreview);
  if (!paid.length) blockers.push("A sequence needs at least one paid part.");
  if (paid.some((p) => p.position < 1)) blockers.push("Paid parts start at position 1. Position 0 is reserved for the preview.");

  const positions = parts.map((p) => p.position);
  if (new Set(positions).size !== positions.length) blockers.push("Two clips share the same position.");

  const paidPositions = paid.map((p) => p.position).sort((a, b) => a - b);
  const contiguous = paidPositions.every((p, i) => p === i + 1);
  if (paidPositions.length && !contiguous) blockers.push("Paid part numbers must run 1, 2, 3 with no gaps.");

  for (const part of parts) {
    const label = part.isPreview ? "The preview" : `Part ${part.position}`;
    if (part.sourceEndSeconds <= part.sourceStartSeconds) blockers.push(`${label} ends before it starts.`);
    if (!normalizeCaption(part.caption)) blockers.push(`${label} needs its own description.`);
    if (descriptionIsInherited(part.caption, sourceCaption)) {
      blockers.push(`${label} still uses the source video's description. Describe what is in this clip specifically.`);
    }
    if (!part.isPreview) {
      if (part.priceStars === null) blockers.push(`${label} needs a price.`);
      else if (!Number.isSafeInteger(part.priceStars) || part.priceStars < MIN_PAID_MEDIA_PRICE_STARS) {
        blockers.push(`${label} must cost at least ${MIN_PAID_MEDIA_PRICE_STARS} Stars.`);
      }
    }
    if (part.requiresPosition !== null) {
      if (part.requiresPosition >= part.position) blockers.push(`${label} cannot depend on itself or a later part.`);
      else if (!positions.includes(part.requiresPosition)) blockers.push(`${label} depends on a part that does not exist.`);
    }
  }
  return blockers;
}

// ── Fan sessions ────────────────────────────────────────────────────────────
const SESSION_TRANSITIONS: Record<SessionStatus, readonly SessionStatus[]> = {
  invited: ["active", "paused", "stopped"],
  active: ["paused", "completed", "stopped"],
  paused: ["active", "stopped"],
  completed: [],
  stopped: [],
};

export function canTransitionSession(from: SessionStatus, to: SessionStatus): boolean {
  return SESSION_TRANSITIONS[from].includes(to);
}

/**
 * The ONLY columns an operator pause or resume may write.
 *
 * Pausing a fan's sequence stops further offers. It must never touch what he
 * already paid for, so entitlements, offers and the parts manifest are not on
 * this list and a patch is refused if it reaches for them.
 */
export const SESSION_OPERATOR_FIELDS = ["status", "pause_reason", "updated_at", "lock_version"] as const;

export function sessionOperatorPatch(
  next: SessionStatus,
  reason: string | null,
  lockVersion: number,
): Record<string, unknown> {
  return {
    status: next,
    pause_reason: next === "paused" || next === "stopped" ? reason : null,
    updated_at: new Date().toISOString(),
    lock_version: lockVersion + 1,
  };
}

/** True when a patch reaches beyond session state into anything ownership
 *  bearing. The operator controls must never produce one. */
export function patchTouchesOwnership(patch: Record<string, unknown>): boolean {
  const allowed = new Set<string>(SESSION_OPERATOR_FIELDS);
  return Object.keys(patch).some((key) => !allowed.has(key));
}

// ── Continuation ────────────────────────────────────────────────────────────
export type ContinuationContext = {
  sessionStatus: SessionStatus;
  revisionState: RevisionState;
  /** Positions the fan holds a live (unrevoked) entitlement for. */
  ownedPositions: number[];
  parts: PartDraft[];
  pendingAttemptId: string | null;
};

/**
 * The next part this fan may be offered, or null.
 *
 * Derived from what he owns plus each part's declared prerequisite, never by
 * incrementing a counter: a blind `next = last + 1` hands out a part whose
 * prerequisite was refunded, and skips a gap the operator deliberately left.
 */
export function nextEligiblePosition(parts: PartDraft[], ownedPositions: number[]): number | null {
  const owned = new Set(ownedPositions);
  const candidates = parts
    .filter((p) => !p.isPreview && !owned.has(p.position))
    .sort((a, b) => a.position - b.position);
  for (const part of candidates) {
    if (part.requiresPosition === null || owned.has(part.requiresPosition)) return part.position;
  }
  return null;
}

/** Why this fan is not being offered the next part, or null when he is
 *  eligible. Shown to the operator verbatim, so it names one cause. */
export function continuationBlockReason(ctx: ContinuationContext): string | null {
  if (ctx.revisionState !== "published") return "The sequence revision is no longer live.";
  if (ctx.sessionStatus === "paused") return "This fan's sequence is paused.";
  if (ctx.sessionStatus === "stopped") return "This fan's sequence was ended.";
  if (ctx.sessionStatus === "completed") return "This fan owns every part.";
  if (ctx.pendingAttemptId) return "An offer is already outstanding. It resolves before another is made.";
  const next = nextEligiblePosition(ctx.parts, ctx.ownedPositions);
  if (next === null) {
    const paid = ctx.parts.filter((p) => !p.isPreview);
    const owned = new Set(ctx.ownedPositions);
    if (paid.length && paid.every((p) => owned.has(p.position))) return "This fan owns every part.";
    return "The next part's prerequisite has not been bought yet.";
  }
  return null;
}

// Migration 147 may not be applied yet. A dashboard that 500s because a table
// is missing is worse than one that says so, and this repo already takes that
// position elsewhere (see rowFromForm's missing-column retry in
// app/clones/actions.ts). It lives here rather than in actions.ts because that
// file is "use server": every export there is a callable endpoint, and this is
// a pure predicate, not an action.
const MISSING_TABLE = "42P01";
export function isMissingSequenceTables(error: { code?: string } | null | undefined): boolean {
  return error?.code === MISSING_TABLE;
}
