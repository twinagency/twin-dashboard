// Pure logic behind scripts/render-sequence.ts. No ffmpeg, no network, no
// database — so the rules that decide what a customer ends up owning can be
// asserted directly.
//
// The render worker turns ONE approved source recording into an ordered set of
// clips. Two properties matter more than anything else here:
//
//   * A CUT LIST THAT IS WRONG MUST BE REFUSED, NOT RENDERED. Once a revision
//     publishes it is immutable (migration 147) and a fan may already have
//     bought from it. There is no "fix it afterwards".
//   * PARTIAL OUTPUT MUST NEVER PUBLISH. Six clips approved, five rendered, is
//     not a sequence that is 83% ready. It is a sequence that promises a part 6
//     the fan can never receive.
//
// Everything user-fixable is returned as a structured error rather than thrown.
// The operator gets a list of what to fix in the timeline editor; an exception
// would give them one problem at a time.
import { MIN_PAID_MEDIA_PRICE_STARS } from "./pricing";

/** The shortest clip worth selling. Below this a "part" is a glitch, not a product. */
export const MIN_CLIP_SECONDS = 3;

/** ffmpeg's cut is keyframe-influenced, so a rendered clip is rarely exactly the
 *  requested length. Wider than this and the cut did not land where the operator
 *  put it, which means the clip does not contain what its caption promises. */
export const DURATION_TOLERANCE_SECONDS = 1.0;

export interface CutPoint {
  position: number;
  isPreview: boolean;
  startSeconds: number;
  endSeconds: number;
  /** null only for the preview; a paid part must carry a price. */
  priceStars: number | null;
  caption?: string | null;
  requiresPosition?: number | null;
  standaloneSaleAllowed?: boolean;
}

export type CutListErrorCode =
  | "empty_cut_list"
  | "duplicate_position"
  | "non_contiguous_positions"
  | "preview_not_first"
  | "multiple_previews"
  | "preview_is_priced"
  | "paid_part_unpriced"
  | "price_below_floor"
  | "range_not_ordered"
  | "clip_too_short"
  | "range_outside_source"
  | "ranges_overlap"
  | "unexpected_gap"
  | "dependency_not_earlier"
  | "dependency_missing";

export interface CutListError {
  code: CutListErrorCode;
  /** The cut point this is about, or null when it is about the list as a whole. */
  position: number | null;
  message: string;
}

export interface ValidateCutListOptions {
  sourceDurationSeconds: number;
  /** Gaps between consecutive clips are usually a mistake (dead footage the fan
   *  paid for is missing). Set true when the operator deliberately cut filler out. */
  allowGaps?: boolean;
}

/**
 * Validate an approved cut list against the real source duration.
 *
 * Returns every problem found, ordered by position, so the timeline editor can
 * show them all at once. An empty array means the list is renderable.
 */
export function validateCutList(cuts: CutPoint[], opts: ValidateCutListOptions): CutListError[] {
  const errors: CutListError[] = [];
  const push = (code: CutListErrorCode, position: number | null, message: string) =>
    errors.push({ code, position, message });

  if (!Array.isArray(cuts) || cuts.length === 0) {
    return [{ code: "empty_cut_list", position: null, message: "A sequence needs at least one part." }];
  }

  const sorted = [...cuts].sort((a, b) => a.position - b.position);

  // ── positions ─────────────────────────────────────────────────────────────
  const seen = new Set<number>();
  for (const cut of sorted) {
    if (seen.has(cut.position)) {
      push("duplicate_position", cut.position, `Two parts both claim position ${cut.position}.`);
    }
    seen.add(cut.position);
  }

  const previews = sorted.filter((c) => c.isPreview);
  if (previews.length > 1) {
    push("multiple_previews", null, "A revision may have at most one free preview.");
  }
  for (const preview of previews) {
    if (preview.position !== 0) {
      push("preview_not_first", preview.position, "The free preview must be position 0.");
    }
  }

  // Contiguous from 0 when a preview exists, otherwise from 1. A hole means a
  // part number the fan is told about that does not exist.
  const expectedStart = sorted.some((c) => c.position === 0) ? 0 : 1;
  const positions = [...seen].sort((a, b) => a - b);
  const expected = positions.map((_, i) => expectedStart + i);
  if (positions.join(",") !== expected.join(",")) {
    push("non_contiguous_positions", null,
      `Positions must run consecutively from ${expectedStart}. Got ${positions.join(", ") || "none"}.`);
  }

  // ── each cut on its own ───────────────────────────────────────────────────
  for (const cut of sorted) {
    if (cut.isPreview && cut.priceStars !== null && cut.priceStars !== undefined) {
      push("preview_is_priced", cut.position, "The preview is free by definition and cannot carry a price.");
    }
    if (!cut.isPreview) {
      if (cut.priceStars === null || cut.priceStars === undefined) {
        push("paid_part_unpriced", cut.position, `Part ${cut.position} needs a price.`);
      } else if (cut.priceStars < MIN_PAID_MEDIA_PRICE_STARS) {
        push("price_below_floor", cut.position,
          `Part ${cut.position} is ${cut.priceStars} Stars; the minimum is ${MIN_PAID_MEDIA_PRICE_STARS}.`);
      }
    }

    if (!(cut.endSeconds > cut.startSeconds)) {
      push("range_not_ordered", cut.position,
        `Part ${cut.position} ends at or before it starts (${cut.startSeconds} to ${cut.endSeconds}).`);
      continue; // every later range test would be nonsense
    }
    if (cut.endSeconds - cut.startSeconds < MIN_CLIP_SECONDS) {
      push("clip_too_short", cut.position,
        `Part ${cut.position} is ${(cut.endSeconds - cut.startSeconds).toFixed(1)}s; the minimum is ${MIN_CLIP_SECONDS}s.`);
    }
    if (cut.startSeconds < 0 || cut.endSeconds > opts.sourceDurationSeconds) {
      push("range_outside_source", cut.position,
        `Part ${cut.position} runs to ${cut.endSeconds}s but the recording is ${opts.sourceDurationSeconds}s long.`);
    }
  }

  // ── the list as a sequence ────────────────────────────────────────────────
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (!(prev.endSeconds > prev.startSeconds) || !(cur.endSeconds > cur.startSeconds)) continue;

    if (cur.startSeconds < prev.endSeconds) {
      push("ranges_overlap", cur.position,
        `Part ${cur.position} starts at ${cur.startSeconds}s, before part ${prev.position} ends at ${prev.endSeconds}s.`);
    } else if (!opts.allowGaps && cur.startSeconds > prev.endSeconds) {
      push("unexpected_gap", cur.position,
        `${(cur.startSeconds - prev.endSeconds).toFixed(1)}s of the recording falls between parts ${prev.position} and ${cur.position}.`);
    }
  }

  // ── dependencies ──────────────────────────────────────────────────────────
  for (const cut of sorted) {
    const req = cut.requiresPosition;
    if (req === null || req === undefined) continue;
    if (req >= cut.position) {
      push("dependency_not_earlier", cut.position,
        `Part ${cut.position} cannot require part ${req}: a prerequisite must come earlier.`);
    } else if (!seen.has(req)) {
      push("dependency_missing", cut.position,
        `Part ${cut.position} requires part ${req}, which is not in this revision.`);
    }
  }

  return errors.sort((a, b) => (a.position ?? -1) - (b.position ?? -1));
}

/** A rendered clip's measured duration against what was asked for. */
export function durationWithinTolerance(actualSeconds: number, cut: CutPoint): boolean {
  const expected = cut.endSeconds - cut.startSeconds;
  return Math.abs(actualSeconds - expected) <= DURATION_TOLERANCE_SECONDS;
}

export interface RenderedClip {
  position: number;
  storagePath: string;
  durationSeconds: number;
}

export type PublishDecision =
  | { publish: true; parts: number }
  | { publish: false; reason: "already_published" | "incomplete"; missing: number[] };

/**
 * The all-or-nothing gate, and the idempotency gate, in one place.
 *
 * Called immediately before the single publish step. It answers only: may this
 * job write a manifest right now? A job that already succeeded must never
 * publish again (the revision is immutable and may already have buyers), and a
 * render that produced fewer clips than were approved must never publish at
 * all.
 */
export function decidePublish(
  cuts: CutPoint[],
  rendered: RenderedClip[],
  jobStatus: "queued" | "running" | "succeeded" | "failed",
): PublishDecision {
  if (jobStatus === "succeeded") {
    return { publish: false, reason: "already_published", missing: [] };
  }
  const renderedPositions = new Set(rendered.map((r) => r.position));
  const missing = cuts.map((c) => c.position).filter((p) => !renderedPositions.has(p)).sort((a, b) => a - b);
  if (missing.length > 0) {
    return { publish: false, reason: "incomplete", missing };
  }
  return { publish: true, parts: cuts.length };
}

/** Storage key for one rendered clip. Deterministic in the revision and
 *  position so a retry of the same job overwrites its own previous attempt
 *  rather than littering the bucket with orphans. */
export function clipStoragePath(cloneId: string, revisionId: string, position: number): string {
  return `${cloneId}/sequences/${revisionId}/part-${String(position).padStart(2, "0")}.mp4`;
}

/** The row shape written to video_sequence_parts. Kept here so the column
 *  contract sits beside the validation that guarantees it. */
export function partRow(cut: CutPoint, rendered: RenderedClip, revisionId: string) {
  return {
    revision_id: revisionId,
    position: cut.position,
    is_preview: cut.isPreview,
    storage_path: rendered.storagePath,
    caption: cut.caption ?? null,
    duration_seconds: Number(rendered.durationSeconds.toFixed(2)),
    source_start_seconds: Number(cut.startSeconds.toFixed(2)),
    source_end_seconds: Number(cut.endSeconds.toFixed(2)),
    price_stars: cut.isPreview ? null : cut.priceStars,
    requires_position: cut.requiresPosition ?? null,
    standalone_sale_allowed: cut.standaloneSaleAllowed ?? false,
  };
}
