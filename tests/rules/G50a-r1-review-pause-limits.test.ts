// Regression guard (G50a round 1, PR #410 review: Flash solo + Opus final). Five gaps left by the first G50a fix:
// (1) recordDryRunReview fingerprinted the audience at the review click, so a fan who became eligible AFTER the dry
//     run was in the reviewed digest without ever being dry-run. Now the review refuses unless every current audience
//     member was seen by the dry run: a dry-run episode (the worker makes one per eligible fan, hold-out and
//     over-cap included) or a scan_excluded event (a fan only the worker's own rules exclude).
// (2) queueRun / recordDryRunReview / confirmLive ignored userbot_connections.paused, and the audience silently drops a
//     paused connection's fans, so a review taken while paused fingerprinted an empty set that confirm then matched.
// (3) stored limits JSON that is malformed or shape-invalid read as the defaults, and a one-field save wrote them over
//     the real caps. Only an absent row reads as defaults now.
// (4) app/mtproto-campaign/actions.ts currentMtprotoLimits served defaults on a failed read; it and the never-throw
//     getMtprotoLimits had no other caller and are removed.
// (5) the go-live confirm copy (components/mtproto/RunControls.tsx) named REENGAGE_ALLOW_LIVE, which the worker no
//     longer reads; it now names the fleet live arm and the creator LIVE switch.
// Controls: a clean dry run reviews and goes live; a partial stored limits object saves. Fixtures copied from
// tests/rules/G50a-confirm-without-arm.test.ts. Runs in `npm run test:rules`. Offline FakeDb, no network.
import assert from "node:assert/strict";
import test from "node:test";
import { __setMtDbForTest } from "../../lib/mtproto/db";
import { FakeDb } from "../../lib/mtproto/tests/fake-db";
import { insertEvent } from "../../lib/mtproto/events";
import { RunValidationError, confirmLive, createDryRun, queueRun, recordDryRunReview, type CreateRunInput } from "../../lib/mtproto/runs";
import { CONFIRM_LIVE_PHRASE, GLOBAL_LIVE_ARM_KEY, MTPROTO_LIMITS_KEY } from "../../lib/mtproto/types";
import { readFileSync } from "node:fs";
import { setMtprotoLimits } from "../../lib/mtproto/limits";
import { REVIEW_KIND } from "../../lib/mtproto/review";

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
const reviews = (db: FakeDb) => db.rows("reengage_events").filter((e) => (e.detail as { kind?: string } | null)?.kind === REVIEW_KIND);

test("control: every audience member was dry-run, the review records and confirm goes live", async () => {
  const { db, id } = await reviewedRun("true", true);
  assert.equal(reviews(db).length, 1);
  assert.equal(await tryConfirm(id), null);
  assert.equal(db.rows("reengage_runs")[0].dry_run, false);
});

test("1: a fan eligible after the dry run (no dry-run episode) makes the review refuse", async () => {
  const db = freshDb();
  db.seed("app_settings", [{ key: "mtproto_global_stop", value: "false" }, { key: GLOBAL_LIVE_ARM_KEY, value: "true" }]);
  db.seed("userbot_connections", [conn(true)]);
  const id = await finishedDryRun(db);
  db.rows("users").push(userRow(uid(5)));
  await assert.rejects(recordDryRunReview(id, "operator"), (e: unknown) => e instanceof RunValidationError && /dry run/i.test((e as Error).message));
  assert.equal(reviews(db).length, 0, "no review recorded over an unseen fan");
});

test("1: a fan the dry run saw and excluded (scan_excluded, e.g. a worker-only rule) is not unseen, the review records", async () => {
  const db = freshDb();
  db.seed("app_settings", [{ key: "mtproto_global_stop", value: "false" }, { key: GLOBAL_LIVE_ARM_KEY, value: "true" }]);
  db.seed("userbot_connections", [conn(true)]);
  const id = await finishedDryRun(db);
  db.rows("users").push(userRow(uid(5)));
  await insertEvent({ runId: id, cloneId: CLONE_A, userId: uid(5), episodeId: null, eventType: "scan_excluded", actor: "system", detail: { reason: "max_unanswered" } });
  await recordDryRunReview(id, "operator");
  assert.equal(reviews(db).length, 1);
});

test("2: a paused creator connection refuses queueRun", async () => {
  const db = freshDb();
  db.seed("userbot_connections", [{ ...conn(true), paused: true, paused_reason: "manual" }]);
  const run = await createDryRun(RUN_OK);
  await assert.rejects(queueRun(run.id, "operator"), RunValidationError);
  assert.equal(db.rows("reengage_runs")[0].status, "draft");
});

test("2: connection paused after the dry run, review and confirm cannot take it live", async () => {
  const db = freshDb();
  db.seed("app_settings", [{ key: "mtproto_global_stop", value: "false" }, { key: GLOBAL_LIVE_ARM_KEY, value: "true" }]);
  db.seed("userbot_connections", [conn(true)]);
  const id = await finishedDryRun(db);
  db.rows("userbot_connections")[0].paused = true;
  await assert.rejects(recordDryRunReview(id, "operator"), RunValidationError);
  assert.equal(reviews(db).length, 0, "no review over a paused connection (its fans vanish from the audience)");
});

test("2: connection paused after the review, confirmLive refuses", async () => {
  const { db, id } = await reviewedRun("true", true);
  db.rows("userbot_connections")[0].paused = true;
  const err = await tryConfirm(id);
  assert.equal(db.rows("reengage_runs")[0].dry_run, true);
  assert.ok(err instanceof RunValidationError, `expected RunValidationError, got ${String(err)}`);
  assert.match((err as Error).message, /paused/, "refused for the pause itself, not only because the paused fans dropped out of the digest");
});

const REAL = { hourlyCap: 20, defaultDailyCap: 30, jitterMinMs: 4_000, jitterMaxMs: 25_000, minSilenceHours: 72, floodWaitMultiplier: 2, warmupHours: 24, minSendGapMinutes: 10, firstDayMaxSends: 5 };
function limitsDb(value: string): FakeDb {
  const db = new FakeDb();
  db.seed("app_settings", [{ key: MTPROTO_LIMITS_KEY, value }]);
  __setMtDbForTest(db);
  return db;
}
const storedLimits = (db: FakeDb) => db.rows("app_settings").find((r) => r.key === MTPROTO_LIMITS_KEY)!.value;

test("control: a partial stored limits object (older row) saves and keeps its fields", async () => {
  const db = limitsDb(JSON.stringify({ warmupHours: 24 }));
  await setMtprotoLimits({ hourlyCap: 7 }, "operator");
  const row = JSON.parse(storedLimits(db) as string);
  assert.equal(row.hourlyCap, 7);
  assert.equal(row.warmupHours, 24);
});

for (const [label, value] of [["malformed JSON", JSON.stringify(REAL).slice(0, -3)], ["an array", "[1,2]"], ["a non-numeric field", JSON.stringify({ ...REAL, warmupHours: "lots" })]] as const) {
  test(`3: stored limits are ${label}, a one-field save refuses and leaves the row as it was`, async () => {
    const db = limitsDb(value);
    await assert.rejects(setMtprotoLimits({ hourlyCap: 7 }, "operator"), /Nothing was saved/);
    assert.equal(storedLimits(db), value, "stored row untouched");
  });
}

test("4: no defaults-on-failure limits reader is left", () => {
  assert.doesNotMatch(readFileSync("app/mtproto-campaign/actions.ts", "utf8"), /currentMtprotoLimits|getMtprotoLimits/);
  assert.doesNotMatch(readFileSync("lib/mtproto/limits.ts", "utf8"), /export async function getMtprotoLimits/);
});

test("5: the go-live confirm copy names the real gates, not the retired env var", () => {
  const src = readFileSync("components/mtproto/RunControls.tsx", "utf8");
  assert.doesNotMatch(src, /REENGAGE_ALLOW_LIVE/);
  assert.match(src, /fleet live arm/);
  assert.match(src, /LIVE switch/);
});
