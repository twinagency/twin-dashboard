// Regression guard (G50a): was KNOWN RED tests/known-red/W9-lib-mtproto-2-review-audience-swap.test.ts (local branch rwl/W9-lib-mtproto-2 @ 9459f9c2), fixed in this PR (lib/mtproto/review.ts, lib/mtproto/audience.ts, lib/mtproto/runs.ts). Original header below.
/**
 * KNOWN RED (W9 lib-mtproto-2 F3, = W8 H4 + Codex/D3 angle): the review gate compares only the audience TOTAL, never
 * who is in it. lib/mtproto/review.ts:210-249 checkReviewGate compares currentAudienceSize (review.ts:169-176,
 * eligible + holdout + cap_reached from audience.ts computeAudiencePreview over `users`) against the single number
 * `audience_size` that recordDryRunReview (runs.ts:257-280) stored. No membership is stored, so after review one
 * reviewed fan can drop out (blocked) and one never-reviewed fan become eligible, total unchanged, and the gate opens.
 * Condition: review recorded; users row uid(2) set blocked, new eligible users row uid(50) added; confirmLive.
 * Turns green when confirmLive rejects a live audience containing a fan the review never covered, leaving the run
 * dry_run=true (fix-agnostic: message not asserted). Control: nothing changed after review, confirm succeeds.
 * Pins the dashboard gate: the review gate claims the audience is unchanged; a worker-side audience freeze alone leaves this red by design.
 * Promoted: runs in `npm run test:rules`. Offline FakeDb, no network.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { __setMtDbForTest } from "../../lib/mtproto/db";
import { FakeDb } from "../../lib/mtproto/tests/fake-db";
import { insertEvent } from "../../lib/mtproto/events";
import { currentAudienceSize } from "../../lib/mtproto/review";
import { RunValidationError, confirmLive, createDryRun, getRun, queueRun, recordDryRunReview, type CreateRunInput } from "../../lib/mtproto/runs";
import { CONFIRM_LIVE_PHRASE, GLOBAL_LIVE_ARM_KEY } from "../../lib/mtproto/types";

const CLONE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RUN_OK = { createdBy: "operator", cloneIds: [CLONE_A], filters: {}, dailyCap: 30, runCap: null, holdoutPct: 15 } satisfies CreateRunInput;
const T = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function userRow(id: string, over: Record<string, unknown> = {}, clone = CLONE_A): Record<string, unknown> {
  return {
    id, clone_id: clone, telegram_id: 1000 + Number(id.slice(-4)), name: id, language_code: "en", blocked: false, blocked_reason: null,
    paused: false, is_active: true, minor_flagged_at: null, first_seen_at: "2026-08-20T00:00:00Z", legacy_id: null, purchase_count: 0,
    last_message_received: T(72), total_spent_stars: 0, spend_tier: null, ...over,
  };
}
function freshDb(): FakeDb {
  const db = new FakeDb();
  db.seed("clones", [{ id: CLONE_A, name: "Alpha", slug: "alpha", status: "active" }]);
  // Every other live gate is OPEN (fleet armed, creator LIVE, no stop) so only the variable under test differs
  // and a future F2 fix (confirm requires arm + LIVE) cannot flip the control or pass the red for the wrong reason.
  db.seed("app_settings", [{ key: "mtproto_global_stop", value: "false" }, { key: GLOBAL_LIVE_ARM_KEY, value: "true" }]);
  db.seed("userbot_connections", [{ clone_id: CLONE_A, status: "active", tg_user_id: null, dc_id: null, last_seen_at: null, paused: false, paused_reason: null, daily_cap: 30, live_enabled: true, session_ref: null, created_at: T(500), updated_at: T(500) }]);
  __setMtDbForTest(db);
  return db;
}
async function finishedDryRun(db: FakeDb): Promise<string> {
  const run = await createDryRun(RUN_OK);
  await queueRun(run.id, "operator");
  Object.assign(db.rows("reengage_runs")[0], { status: "done" });
  db.seed("users", [1, 2, 3, 4].map((n) => userRow(uid(n))));
  const start = T(72);
  db.seed("reengage_episodes", [
    ...[1, 2, 3].map((n) => ({ id: `e${n}`, run_id: run.id, clone_id: CLONE_A, user_id: uid(n), telegram_id: 1000 + n, episode_start_inbound_at: start, state: "acked", dry_run: true, tg_message_id: null, sent_at: T(1), prepared_text: "hey", acked_text: "hey", skip_reason: null, error_code: null, created_at: T(2) })),
    { id: "e4", run_id: run.id, clone_id: CLONE_A, user_id: uid(4), telegram_id: 1004, episode_start_inbound_at: start, state: "holdout", dry_run: true, tg_message_id: null, sent_at: null, prepared_text: null, acked_text: null, skip_reason: null, error_code: null, created_at: T(2) },
  ]);
  await insertEvent({ runId: run.id, cloneId: CLONE_A, userId: uid(9), episodeId: null, eventType: "scan_excluded", actor: "system", detail: { reason: "blocked" } });
  return run.id;
}

test.after(() => __setMtDbForTest(null));

test("control: audience unchanged after review, confirmLive goes live", async () => {
  const db = freshDb();
  const id = await finishedDryRun(db);
  await recordDryRunReview(id, "operator");
  const live = await confirmLive(id, "operator", CONFIRM_LIVE_PHRASE);
  assert.equal(live.dryRun, false);
  assert.equal(db.rows("reengage_runs")[0].dry_run, false);
});

test("F3: equal-size swap (one reviewed fan out, one unreviewed fan in), confirmLive must refuse and leave the run dry", async () => {
  const db = freshDb();
  const id = await finishedDryRun(db);
  await recordDryRunReview(id, "operator");
  const reviewedSize = await currentAudienceSize((await getRun(id))!);
  db.rows("users").find((u) => u.id === uid(2))!.blocked = true; // a reviewed fan leaves the audience
  db.rows("users").push(userRow(uid(50))); // a fan nobody reviewed joins it
  assert.equal(await currentAudienceSize((await getRun(id))!), reviewedSize, "setup: the swap keeps the total equal");
  let err: unknown = null;
  try {
    await confirmLive(id, "operator", CONFIRM_LIVE_PHRASE);
  } catch (e) {
    err = e;
  }
  assert.equal(db.rows("reengage_runs")[0].dry_run, true, "confirmLive went live with a fan (uid 50) the review never covered: the gate compares only the audience total");
  assert.ok(err instanceof RunValidationError, `expected RunValidationError, got ${String(err)}`);
});
