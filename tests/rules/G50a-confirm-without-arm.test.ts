// Regression guard (G50a): was KNOWN RED tests/known-red/W9-lib-mtproto-2-confirm-without-arm.test.ts (local branch rwl/W9-lib-mtproto-2 @ 9459f9c2), fixed in this PR (lib/mtproto/runs.ts). Original header below.
/**
 * KNOWN RED (W9 lib-mtproto-2 F2, = W8 H3 + per-creator angle): confirmLive checks the global STOP but neither the
 * fleet LIVE ARM nor the creator's own LIVE switch. lib/mtproto/runs.ts:296-334 reads getGlobalStop() only; it never
 * reads app_settings GLOBAL_LIVE_ARM_KEY (lib/mtproto/global-live-arm.ts, "true" = armed) nor
 * userbot_connections.live_enabled for the run's clones (lib/mtproto/connections.ts). The worker parks such a run and
 * fires it on a later arm/flip with an old review.
 * Condition: reviewed dry run; (a) arm "false", creator live_enabled true; (b) arm "true", creator live_enabled false.
 * Turns green when confirmLive rejects (RunValidationError) unless the fleet is armed AND every run clone is
 * live_enabled, leaving the run dry_run=true. Control: armed + creator live, confirm succeeds.
 * Promoted: runs in `npm run test:rules`. Offline FakeDb, no network.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { __setMtDbForTest } from "../../lib/mtproto/db";
import { FakeDb } from "../../lib/mtproto/tests/fake-db";
import { insertEvent } from "../../lib/mtproto/events";
import { RunValidationError, confirmLive, createDryRun, queueRun, recordDryRunReview, type CreateRunInput } from "../../lib/mtproto/runs";
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

const conn = (liveEnabled: boolean) => ({ clone_id: CLONE_A, status: "active", tg_user_id: null, dc_id: null, last_seen_at: null, paused: false, paused_reason: null, daily_cap: 30, live_enabled: liveEnabled, session_ref: null, created_at: T(500), updated_at: T(500) });
async function reviewedRun(arm: string | null, liveEnabled: boolean): Promise<{ db: FakeDb; id: string }> {
  const db = freshDb();
  db.seed("app_settings", [{ key: "mtproto_global_stop", value: "false" }, ...(arm === null ? [] : [{ key: GLOBAL_LIVE_ARM_KEY, value: arm }])]);
  db.seed("userbot_connections", [conn(liveEnabled)]);
  const id = await finishedDryRun(db);
  await recordDryRunReview(id, "operator");
  return { db, id };
}
async function tryConfirm(id: string): Promise<unknown> {
  try {
    await confirmLive(id, "operator", CONFIRM_LIVE_PHRASE);
    return null;
  } catch (e) {
    return e;
  }
}

test.after(() => __setMtDbForTest(null));

test("control: fleet armed and creator LIVE, confirmLive goes live", async () => {
  const { db, id } = await reviewedRun("true", true);
  const live = await confirmLive(id, "operator", CONFIRM_LIVE_PHRASE);
  assert.equal(live.dryRun, false);
  assert.equal(db.rows("reengage_runs")[0].dry_run, false);
});

for (const [label, arm] of [["absent", null], ['"false"', "false"]] as const) {
  test(`F2a: fleet live arm ${label} (creator LIVE), confirmLive must refuse and leave the run dry`, async () => {
    const { db, id } = await reviewedRun(arm, true);
    const err = await tryConfirm(id);
    assert.equal(db.rows("reengage_runs")[0].dry_run, true, `confirmLive went live with the fleet live arm ${label} (arm never checked)`);
    assert.ok(err instanceof RunValidationError, `expected RunValidationError, got ${String(err)}`);
  });
}

test("F2b: fleet armed but the run's creator has live_enabled false, confirmLive must refuse and leave the run dry", async () => {
  const { db, id } = await reviewedRun("true", false);
  const err = await tryConfirm(id);
  assert.equal(db.rows("reengage_runs")[0].dry_run, true, "confirmLive went live for a creator whose LIVE switch is off (live_enabled never checked)");
  assert.ok(err instanceof RunValidationError, `expected RunValidationError, got ${String(err)}`);
});
