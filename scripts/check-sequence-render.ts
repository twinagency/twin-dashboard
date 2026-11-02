// Guards for the video sequence render worker (scripts/render-sequence.ts) and
// its pure logic (lib/sequence-render.ts).
//
// WHY THIS CHECK EXISTS, SPECIFICALLY:
// A published revision is immutable (migration 147) and a fan may already have
// bought from it. There is no fixing one afterwards, so everything that decides
// what gets published has to be pinned here. The two that would fail silently:
//
//   * A CUT LIST THAT SHOULD HAVE BEEN REFUSED. Overlapping ranges, a range
//     past the end of the recording, a part that depends on a part that does
//     not exist. Each one renders perfectly well and produces a product that
//     lies about what it contains.
//   * A PARTIAL PUBLISH. Six parts approved, five rendered. If decidePublish
//     ever returned true on an incomplete render, the sequence would promise a
//     part 6 that no fan can ever receive, permanently.
//
// It also pins the human-approval requirement to the migration itself: an AI
// boundary proposal must never be able to author a render job.
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateCutList,
  durationWithinTolerance,
  decidePublish,
  clipStoragePath,
  partRow,
  MIN_CLIP_SECONDS,
  DURATION_TOLERANCE_SECONDS,
  type CutPoint,
} from "../lib/sequence-render";
import { MIN_PAID_MEDIA_PRICE_STARS } from "../lib/pricing";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`PASS  ${name}`);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_SECONDS = 120;

function cut(over: Partial<CutPoint> & { position: number }): CutPoint {
  const start = over.startSeconds ?? over.position * 10;
  return {
    isPreview: false,
    startSeconds: start,
    endSeconds: over.endSeconds ?? start + 10,
    priceStars: over.isPreview ? null : MIN_PAID_MEDIA_PRICE_STARS,
    caption: null,
    requiresPosition: null,
    standaloneSaleAllowed: false,
    ...over,
  };
}

/** The shape the brief calls a useful starting template: one free preview at
 *  position 0, then four paid parts, contiguous, inside the source. */
function validList(): CutPoint[] {
  return [
    cut({ position: 0, isPreview: true, priceStars: null, startSeconds: 0, endSeconds: 10 }),
    cut({ position: 1, startSeconds: 10, endSeconds: 30 }),
    cut({ position: 2, startSeconds: 30, endSeconds: 55 }),
    cut({ position: 3, startSeconds: 55, endSeconds: 80, requiresPosition: 2 }),
    cut({ position: 4, startSeconds: 80, endSeconds: 110 }),
  ];
}

const codes = (cuts: CutPoint[], opts = {}) =>
  validateCutList(cuts, { sourceDurationSeconds: SOURCE_SECONDS, ...opts }).map((e) => e.code);

// ── the happy path must actually pass ───────────────────────────────────────
// Without this, "always reject everything" would satisfy every other assertion.
check("a well formed cut list validates clean", () => {
  assert.deepEqual(codes(validList()), []);
});

check("an empty cut list is refused", () => {
  assert.deepEqual(codes([]), ["empty_cut_list"]);
});

// ── ranges ──────────────────────────────────────────────────────────────────
check("overlapping ranges are refused", () => {
  const cuts = validList();
  cuts[2].startSeconds = 25; // starts before part 1 ends at 30
  assert.ok(codes(cuts).includes("ranges_overlap"));
});

check("a range past the end of the recording is refused", () => {
  const cuts = validList();
  cuts[4].endSeconds = SOURCE_SECONDS + 30;
  assert.ok(codes(cuts).includes("range_outside_source"));
});

check("a range that ends before it starts is refused", () => {
  const cuts = validList();
  cuts[1].endSeconds = cuts[1].startSeconds;
  assert.ok(codes(cuts).includes("range_not_ordered"));
});

check("a clip shorter than the floor is refused", () => {
  const cuts = validList();
  cuts[1].endSeconds = cuts[1].startSeconds + (MIN_CLIP_SECONDS - 1);
  assert.ok(codes(cuts).includes("clip_too_short"));
});

check("a gap between parts is reported, unless the operator allowed it", () => {
  const cuts = validList();
  cuts[2].startSeconds = 35; // part 1 ends at 30
  assert.ok(codes(cuts).includes("unexpected_gap"));
  assert.ok(!codes(cuts, { allowGaps: true }).includes("unexpected_gap"));
});

// ── positions and the preview ───────────────────────────────────────────────
check("duplicate positions are refused", () => {
  const cuts = validList();
  cuts[2].position = 1;
  assert.ok(codes(cuts).includes("duplicate_position"));
});

check("a hole in the numbering is refused", () => {
  // A missing part 3 means the bot offers a part that does not exist.
  const cuts = validList().filter((c) => c.position !== 3);
  assert.ok(codes(cuts).includes("non_contiguous_positions"));
});

check("the preview must be position 0 and there can be only one", () => {
  const moved = validList();
  moved[0].isPreview = false;
  moved[0].priceStars = MIN_PAID_MEDIA_PRICE_STARS;
  moved[2].isPreview = true;
  moved[2].priceStars = null;
  assert.ok(codes(moved).includes("preview_not_first"));

  const two = validList();
  two[1].isPreview = true;
  two[1].priceStars = null;
  assert.ok(codes(two).includes("multiple_previews"));
});

// ── money ───────────────────────────────────────────────────────────────────
check("a priced preview is refused", () => {
  const cuts = validList();
  cuts[0].priceStars = 500;
  assert.ok(codes(cuts).includes("preview_is_priced"));
});

check("an unpriced paid part is refused", () => {
  const cuts = validList();
  cuts[1].priceStars = null;
  assert.ok(codes(cuts).includes("paid_part_unpriced"));
});

check("a paid part under the Stars floor is refused", () => {
  const cuts = validList();
  cuts[1].priceStars = MIN_PAID_MEDIA_PRICE_STARS - 1;
  assert.ok(codes(cuts).includes("price_below_floor"));
});

// ── dependencies ────────────────────────────────────────────────────────────
check("a prerequisite must come earlier and must exist", () => {
  const later = validList();
  later[1].requiresPosition = 3;
  assert.ok(codes(later).includes("dependency_not_earlier"));

  // A part that depends on the preview after the preview was removed. The
  // numbering is still legal (a sequence may start at 1), so nothing else
  // catches this one.
  const missing = [
    cut({ position: 1, startSeconds: 10, endSeconds: 20 }),
    cut({ position: 2, startSeconds: 20, endSeconds: 30 }),
    cut({ position: 3, startSeconds: 30, endSeconds: 40, requiresPosition: 0 }),
  ];
  const found = codes(missing);
  assert.ok(found.includes("dependency_missing"), found.join(","));
  assert.ok(!found.includes("non_contiguous_positions"), "a sequence may legally start at part 1");
});

// ── validation reports everything at once ───────────────────────────────────
check("every problem is reported together, not one at a time", () => {
  const cuts = validList();
  cuts[1].priceStars = null;
  cuts[2].startSeconds = 25;
  cuts[4].endSeconds = SOURCE_SECONDS + 5;
  const found = codes(cuts);
  assert.ok(found.includes("paid_part_unpriced"));
  assert.ok(found.includes("ranges_overlap"));
  assert.ok(found.includes("range_outside_source"));
});

check("validation never throws on a malformed list", () => {
  // The operator gets a list of fixes, never a stack trace.
  assert.doesNotThrow(() => validateCutList([], { sourceDurationSeconds: SOURCE_SECONDS }));
  assert.doesNotThrow(() => validateCutList(
    [cut({ position: 0, startSeconds: Number.NaN, endSeconds: Number.NaN })],
    { sourceDurationSeconds: SOURCE_SECONDS },
  ));
});

// ── the all-or-nothing publish gate ─────────────────────────────────────────
check("a complete render publishes", () => {
  const cuts = validList();
  const rendered = cuts.map((c) => ({ position: c.position, storagePath: "p", durationSeconds: 10 }));
  const decision = decidePublish(cuts, rendered, "running");
  assert.equal(decision.publish, true);
  assert.equal(decision.publish === true && decision.parts, cuts.length);
});

check("an INCOMPLETE render never publishes, and names what is missing", () => {
  // The property that matters most in this file. Five of six parts rendered is
  // not a sequence that is nearly ready, it is one that promises a part the fan
  // can never be sent.
  const cuts = validList();
  const rendered = cuts.slice(0, 3).map((c) => ({ position: c.position, storagePath: "p", durationSeconds: 10 }));
  const decision = decidePublish(cuts, rendered, "running");
  assert.equal(decision.publish, false);
  assert.equal(decision.publish === false && decision.reason, "incomplete");
  assert.deepEqual(decision.publish === false && decision.missing, [3, 4]);
});

check("a job that already succeeded publishes nothing on a second run", () => {
  const cuts = validList();
  const rendered = cuts.map((c) => ({ position: c.position, storagePath: "p", durationSeconds: 10 }));
  const decision = decidePublish(cuts, rendered, "succeeded");
  assert.equal(decision.publish, false);
  assert.equal(decision.publish === false && decision.reason, "already_published");
});

// ── rendered clip validation ────────────────────────────────────────────────
check("a clip whose length missed the approved boundary is rejected", () => {
  const c = cut({ position: 1, startSeconds: 10, endSeconds: 30 }); // 20s approved
  assert.equal(durationWithinTolerance(20, c), true);
  assert.equal(durationWithinTolerance(20 + DURATION_TOLERANCE_SECONDS / 2, c), true);
  assert.equal(durationWithinTolerance(20 + DURATION_TOLERANCE_SECONDS + 0.5, c), false);
  assert.equal(durationWithinTolerance(5, c), false);
});

// ── storage and row shape ───────────────────────────────────────────────────
check("clip paths are deterministic, so a retry overwrites its own attempt", () => {
  const a = clipStoragePath("clone", "rev", 2);
  const b = clipStoragePath("clone", "rev", 2);
  assert.equal(a, b);
  assert.notEqual(a, clipStoragePath("clone", "rev", 3));
  // Sequence clips live under their own prefix, never beside ordinary videos.
  assert.ok(a.includes("/sequences/"));
  assert.ok(!a.includes("/videos/"));
});

check("the written row keeps the preview free and the paid part priced", () => {
  const preview = partRow(
    cut({ position: 0, isPreview: true, priceStars: null, startSeconds: 0, endSeconds: 10 }),
    { position: 0, storagePath: "p0", durationSeconds: 10 }, "rev",
  );
  assert.equal(preview.price_stars, null);
  assert.equal(preview.is_preview, true);

  const paid = partRow(
    cut({ position: 1, startSeconds: 10, endSeconds: 30, priceStars: 800 }),
    { position: 1, storagePath: "p1", durationSeconds: 20 }, "rev",
  );
  assert.equal(paid.price_stars, 800);
  assert.equal(paid.source_start_seconds, 10);
  assert.equal(paid.source_end_seconds, 30);
});

// ── the migration's own guarantees ──────────────────────────────────────────
check("migration 148 requires a named human behind every render job", () => {
  const sql = readFileSync(resolve(root, "../twin-bot/db/migrations/148_video_sequence_jobs.sql"), "utf8");
  assert.match(sql, /approved_by\s+text not null/i, "an AI proposal could author a render job");
  assert.match(sql, /approved_at\s+timestamptz not null/i);
});

check("migration 148 stops one revision being rendered twice at once", () => {
  const sql = readFileSync(resolve(root, "../twin-bot/db/migrations/148_video_sequence_jobs.sql"), "utf8");
  assert.match(sql, /create unique index[\s\S]{0,120}video_sequence_jobs_one_live_per_revision_uidx/i);
  assert.match(sql, /where status in \('queued', 'running'\)/i);
});

check("migration 148 makes a finished job final", () => {
  const sql = readFileSync(resolve(root, "../twin-bot/db/migrations/148_video_sequence_jobs.sql"), "utf8");
  assert.match(sql, /is terminal/i, "a succeeded job could be reopened and publish twice");
  assert.match(sql, /cut_points, new\.approved_by, new\.approved_at/i, "the approval record must be immutable");
});

check("migration 148 is mirrored into db/schema.sql", () => {
  const schema = readFileSync(resolve(root, "../twin-bot/db/schema.sql"), "utf8");
  assert.match(schema, /create table video_sequence_jobs/i);
  assert.match(schema, /video_sequence_jobs_one_live_per_revision_uidx/i);
  assert.match(schema, /alter table video_sequence_jobs enable row level security/i);
  assert.ok(!/grant[^\n;]*delete[^\n;]*video_sequence_jobs/i.test(schema),
    "a render job is an audit trail and must not be deletable");
});

// ── the worker wires the pure logic in ──────────────────────────────────────
// lib/sequence-render.ts being correct proves nothing if the worker never calls
// it. This repo's signature defect is exactly that: configured but inert.
check("the worker actually calls the validation and the publish gate", () => {
  const worker = readFileSync(resolve(root, "scripts/render-sequence.ts"), "utf8");
  assert.match(worker, /validateCutList\(/, "the worker renders without validating");
  assert.match(worker, /decidePublish\(/, "the worker publishes without the all-or-nothing gate");
  assert.match(worker, /durationWithinTolerance\(/, "the worker never checks a rendered clip landed on the boundary");
  assert.match(worker, /hasVideoStream\(/);
  // Re-validated at render time, not only when queued.
  assert.match(worker, /probeDuration\(srcPath\)/, "cut points must be checked against the real file");
});

check("the worker removes uploaded clips when a render fails", () => {
  const worker = readFileSync(resolve(root, "scripts/render-sequence.ts"), "utf8");
  assert.match(worker, /uploaded\.length[\s\S]{0,200}\.remove\(uploaded\)/,
    "a failed render would leave orphaned clips in the bucket");
});

console.log(`\nsequence render: ${passed} checks passed`);
