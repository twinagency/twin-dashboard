// Regression guard (G50a F1 queue half + F2 read failure, W9 lib-mtproto-2): two gaps the promoted known-red tests do
// not reach. (1) lib/mtproto/runs.ts queueRun checked only status === "draft", so a draft made while the creator was
// active queued after the creator was paused and the worker claimed it. (2) confirmLive must read each creator's
// userbot_connections.live_enabled fresh, and a FAILED read refuses (unknown holds win), never goes live.
// Controls: queueRun on an active creator queues; confirmLive with every gate readable and open goes live.
// Fixtures copied from tests/rules/G50a-confirm-without-arm.test.ts. Runs in `npm run test:rules`. Offline FakeDb.
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

test("control: queueRun on an active creator queues", async () => {
  const db = freshDb();
  const run = await createDryRun(RUN_OK);
  await queueRun(run.id, "operator");
  assert.equal(db.rows("reengage_runs")[0].status, "queued");
});

test("F1: creator paused after the draft was made, queueRun must refuse and leave it a draft", async () => {
  const db = freshDb();
  const run = await createDryRun(RUN_OK);
  db.rows("clones")[0].status = "paused";
  await assert.rejects(queueRun(run.id, "operator"), RunValidationError);
  assert.equal(db.rows("reengage_runs")[0].status, "draft", "queueRun queued a run for a PAUSED creator");
});

test("control: every gate readable and open, confirmLive goes live", async () => {
  const { db, id } = await reviewedRun("true", true);
  assert.equal(await tryConfirm(id), null);
  assert.equal(db.rows("reengage_runs")[0].dry_run, false);
});

test("F2: the creator LIVE switch cannot be read, confirmLive must refuse and leave the run dry", async () => {
  const { db, id } = await reviewedRun("true", true);
  db.fail("userbot_connections", "select", { message: "read timeout", ifSelectIncludes: "live_enabled" });
  const err = await tryConfirm(id);
  assert.equal(db.rows("reengage_runs")[0].dry_run, true, "confirmLive went live without reading the creator LIVE switch");
  assert.ok(err instanceof RunValidationError, `expected RunValidationError, got ${String(err)}`);
});
