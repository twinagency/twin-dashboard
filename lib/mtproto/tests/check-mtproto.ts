// lib/mtproto/tests/check-mtproto.ts
//
// Run: npm run test:mtproto
//
// Same style as scripts/check-admin-api.ts: pure functions get real
// behavioral checks with zero Supabase and zero live tables (the new
// reengage_* tables do not exist yet — see migration 158's header). The few
// guarantees that only make sense against a real write (dry-run-only
// creation, confirm-live's status gate, stop_requested, preview never
// writing) are proven the same way check-admin-api.ts's B-series proves
// "only WRITE_ROUTES may write": by scanning the actual source the runtime
// calls, not a paraphrase of it, with comments stripped so the check can't
// pass on its own prose.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { classifyFan, computeAudiencePreview, isMissingIsTestColumn, isHoldout, type CandidateRow, type ClassifyContext } from "../audience";
import { funnelFromEpisodes, isRealSend } from "../episodes";
import { buildSendRows, sendFanLabel, sendsToCsv } from "../sends";
import { listEpisodesForRun } from "../episodes";
import { validateCreateRunInput, RunValidationError, createDryRun, queueRun, confirmLive, stopRun, getRun, recordDryRunReview, type CreateRunInput } from "../runs";
import { computeDryRunSummary, redactFan, redactText, computeSendPlan } from "../review";
import { insertEvent } from "../events";
import { getGlobalStop, setGlobalStop } from "../global-stop";
import { connectionFor, listConnections, setConnectionDailyCap, setConnectionLiveEnabled, setConnectionPaused } from "../connections";
import { autoHaltKind, buildAutoHaltInfo, describeAutoHaltEvent, goLivePhraseOk, resumePhraseOk } from "../halt";
import { autoHaltsFor } from "../halt-server";
import { describeEvent } from "../event-format";
import { computeOptOuts, optOutReport } from "../funnel";
import { computeSafetySnapshots } from "../safety";
import { AUTO_HALT_PREFIX } from "../types";
import { liftFromData } from "../attribution";
import { scrubDetail } from "../events";
import { sanitizeFilters } from "../validate";
import { __setMtDbForTest } from "../db";
import { FakeDb } from "./fake-db";
import { agencyDashboardPath } from "../../agency-policy";
import { CONFIRM_LIVE_PHRASE, HARD_MAX_DAILY_CAP, MIN_SILENCE_HOURS, PREVIEW_EXCLUSION_REASONS } from "../types";
import type { ReengageEpisode, SendRow } from "../types";

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push(`${name}\n      ${e instanceof Error ? e.message : String(e)}`);
  }
}
const asyncChecks: { name: string; fn: () => Promise<void> }[] = [];
function acheck(name: string, fn: () => Promise<void>): void {
  asyncChecks.push({ name, fn });
}
async function rejects(p: Promise<unknown>, pattern?: RegExp): Promise<Error> {
  try {
    await p;
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    if (pattern && !pattern.test(err.message)) throw new Error(`rejected with the wrong message: ${err.message}`);
    return err;
  }
  throw new Error("expected a rejection, but it resolved");
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function eq(actual: unknown, expected: unknown, what: string): void {
  if (actual !== expected) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function sourceCode(relPath: string): string {
  return readFileSync(fileURLToPath(new URL(relPath, import.meta.url)), "utf8")
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

// ── fixtures ─────────────────────────────────────────────────────────────────

const NOW = new Date("2026-09-22T12:00:00Z").getTime();
const baseCtx: ClassifyContext = {
  nowMs: NOW,
  minSilenceHours: MIN_SILENCE_HOURS,
  isOptedOut: () => false,
  isAlreadyContacted: () => false,
};
const baseRow: CandidateRow = {
  id: "user-1",
  clone_id: "clone-1",
  telegram_id: 123456,
  name: "Fan One",
  language_code: "en",
  blocked: false,
  blocked_reason: null,
  paused: false,
  is_active: true,
  minor_flagged_at: null,
  first_seen_at: "2026-08-15T00:00:00Z",
  legacy_id: null,
  purchase_count: 1,
  last_message_received: new Date(NOW - 48 * 3600_000).toISOString(), // 48h silent
  total_spent_stars: 100,
  spend_tier: "mid",
};

// ── A. classifyFan — exclusion reasons ───────────────────────────────────────

check("A1 a clean, silent-48h fan is eligible", () => {
  eq(classifyFan(baseRow, baseCtx), "eligible", "verdict");
});

check("A2 blocked (no specific reason) -> blocked", () => {
  eq(classifyFan({ ...baseRow, blocked: true }, baseCtx), "blocked", "verdict");
});

check("A3 blocked_reason 'minor' -> minor_gated, not the generic 'blocked' bucket", () => {
  eq(classifyFan({ ...baseRow, blocked: true, blocked_reason: "minor" }, baseCtx), "minor_gated", "verdict");
});

check("A4 minor_flagged_at survives even if blocked was cleared by hand", () => {
  eq(classifyFan({ ...baseRow, blocked: false, minor_flagged_at: "2026-08-01T00:00:00Z" }, baseCtx), "minor_gated", "verdict");
});

check("A5 blocked_reason 'us_location' -> us_location", () => {
  eq(classifyFan({ ...baseRow, blocked: true, blocked_reason: "us_location" }, baseCtx), "us_location", "verdict");
});

check("A6 paused fan -> paused", () => {
  eq(classifyFan({ ...baseRow, paused: true }, baseCtx), "paused", "verdict");
});

check("A7 is_active=false -> inactive", () => {
  eq(classifyFan({ ...baseRow, is_active: false }, baseCtx), "inactive", "verdict");
});

check("A8 opted-out fan -> opt_out", () => {
  eq(classifyFan(baseRow, { ...baseCtx, isOptedOut: () => true }), "opt_out", "verdict");
});

check("A9 already-contacted-this-episode fan -> already_contacted", () => {
  eq(classifyFan(baseRow, { ...baseCtx, isAlreadyContacted: () => true }), "already_contacted", "verdict");
});

check("A10 users.legacy_id set (the real import marker, twin-bot migration 081/123) -> legacy_import", () => {
  eq(classifyFan({ ...baseRow, legacy_id: "old-123" }, baseCtx), "legacy_import", "verdict");
  eq(classifyFan({ ...baseRow, legacy_id: "" }, baseCtx), "legacy_import", "even an empty legacy_id counts: exclude when unsure");
});

check("A11 a NATIVE fan first seen before 2026-08-10 (legacy_id null) is NOT legacy_import", () => {
  eq(classifyFan({ ...baseRow, first_seen_at: "2026-07-30T00:00:00Z", legacy_id: null }, baseCtx), "eligible", "verdict");
});

check("A12 no telegram_id -> no_chat_id", () => {
  eq(classifyFan({ ...baseRow, telegram_id: null }, baseCtx), "no_chat_id", "verdict");
});

check("A13 silent less than 24h -> within_24h", () => {
  const row = { ...baseRow, last_message_received: new Date(NOW - 2 * 3600_000).toISOString() };
  eq(classifyFan(row, baseCtx), "within_24h", "verdict");
});

check("A14 never messaged (last_message_received null) -> within_24h, not eligible", () => {
  eq(classifyFan({ ...baseRow, last_message_received: null }, baseCtx), "within_24h", "verdict");
});

check("A15 a higher minSilenceHours (lastActiveFromDays filter) raises the bar", () => {
  const ctx = { ...baseCtx, minSilenceHours: 72 }; // 3 days
  eq(classifyFan(baseRow, ctx), "within_24h", "48h silent fails a 72h-minimum filter");
});

check("A16 priority order: blocked is checked before paused/inactive/opt_out", () => {
  const row = { ...baseRow, blocked: true, paused: true, is_active: false };
  eq(classifyFan(row, { ...baseCtx, isOptedOut: () => true }), "blocked", "the hardest stop wins");
});

// ── B. isHoldout — deterministic, roughly matches the requested percentage ──

check("B1 isHoldout is deterministic for the same seed/clone/user", () => {
  const a = isHoldout("run-1", "clone-1", "user-1", 15);
  const b = isHoldout("run-1", "clone-1", "user-1", 15);
  eq(a, b, "same inputs must give the same verdict");
});

check("B2 a different seed can change the verdict (not hardcoded to one bucket)", () => {
  const results = new Set<boolean>();
  for (let i = 0; i < 200; i++) results.add(isHoldout(`run-${i}`, "clone-1", "user-1", 15));
  assert(results.size === 2, "expected both true and false to occur across many seeds");
});

check("B3 over many users, the holdout fraction is roughly the requested percentage", () => {
  const pct = 20;
  let count = 0;
  const total = 5000;
  for (let i = 0; i < total; i++) if (isHoldout("preview", "clone-1", `user-${i}`, pct)) count++;
  const observed = (count / total) * 100;
  assert(Math.abs(observed - pct) < 3, `expected ~${pct}%, got ${observed.toFixed(1)}%`);
});

check("B4 holdoutPct=0 never holds anyone out", () => {
  for (let i = 0; i < 500; i++) assert(!isHoldout("preview", "clone-1", `user-${i}`, 0), `user-${i} was held out at 0%`);
});

// ── C. funnelFromEpisodes ────────────────────────────────────────────────────

// A fan is (clone_id, telegram_id) since migration 163, so a test fan needs its
// own telegram id: derive a stable one from the userId label unless given.
const tgOf = (label: string | null | undefined): number => {
  let h = 7;
  for (const ch of label ?? "deleted") h = (h * 31 + ch.charCodeAt(0)) % 900_000_000;
  return 100_000_000 + h;
};
function episode(partial: Partial<ReengageEpisode>): ReengageEpisode {
  return {
    id: "ep-1",
    runId: "run-1",
    cloneId: "clone-1",
    userId: "user-1",
    telegramId: tgOf("userId" in partial ? partial.userId : "user-1"),
    episodeStartInboundAt: "2026-09-20T00:00:00Z",
    state: "eligible",
    dryRun: false,
    preparedText: null,
    ackedText: null,
    tgMessageId: null,
    claimedBy: null,
    claimedAt: null,
    sentAt: null,
    errorCode: null,
    skipReason: null,
    createdAt: "2026-09-20T00:00:00Z",
    updatedAt: "2026-09-20T00:00:00Z",
    ...partial,
  };
}

check("C1 funnel counts holdout and non-holdout separately, eligible includes both", () => {
  const episodes = [episode({ state: "eligible" }), episode({ state: "holdout" }), episode({ state: "holdout" })];
  const f = funnelFromEpisodes(episodes);
  eq(f.eligible, 3, "eligible = eligible + holdout");
  eq(f.holdout, 2, "holdout count");
});

check("C2 contacted/acknowledged/replied climb monotonically down the funnel", () => {
  const episodes = [
    episode({ state: "sent", sentAt: "2026-09-21T00:00:00Z" }),
    episode({ state: "acked", sentAt: "2026-09-21T00:00:00Z", tgMessageId: 5 }),
    episode({ state: "replied", sentAt: "2026-09-21T00:00:00Z", tgMessageId: 6 }),
  ];
  const f = funnelFromEpisodes(
    episodes.map((e, i) => ({ ...e, userId: `u${i}`, telegramId: tgOf(`u${i}`), state: i === 0 ? "acked" : e.state, tgMessageId: i === 0 ? 4 : e.tgMessageId })),
  );
  eq(f.contacted, 3, "contacted: acked + acked + replied (state sent is NOT contacted; the first was rewritten to acked)");
  eq(f.acknowledged, 3, "acknowledged: real sends Telegram accepted (message id)");
  eq(f.replied, 1, "replied");
  assert(f.contacted >= f.acknowledged && f.acknowledged >= f.replied, "funnel must narrow, never widen");
});

// ── D. sendsToCsv — shape + escaping ────────────────────────────────────────

function sendRow(partial: Partial<SendRow>): SendRow {
  return {
    episodeId: "ep-1",
    cloneId: "clone-1",
    cloneName: "Riley",
    userId: "user-1",
    telegramId: 123,
    sentAt: "2026-09-21T00:00:00Z",
    text: "hey, miss you",
    state: "sent",
    errorCode: null,
    repliedAt: null,
    boughtStars: null,
    boughtWithinHours: null,
    ...partial,
  };
}

check("D1 CSV has the expected header and one data row per send", () => {
  const csv = sendsToCsv([sendRow({}), sendRow({ episodeId: "ep-2" })]);
  const lines = csv.trim().split("\r\n");
  eq(lines.length, 3, "header + 2 rows");
  assert(lines[0].startsWith("episode_id,creator,user_id"), "header must lead with episode_id,creator,user_id");
});

check("D2 a comma/quote/newline in the exact send text is escaped, not corrupted", () => {
  const csv = sendsToCsv([sendRow({ text: 'hi, "babe"\nmiss you' })]);
  const lines = csv.trim().split("\r\n");
  eq(lines.length, 2, "the embedded newline must NOT create an extra row");
  assert(lines[1].includes('"hi, ""babe""'), "comma+quote must be quoted and the quote doubled");
});

check("D3 an empty send list is still a valid CSV (header only)", () => {
  const csv = sendsToCsv([]);
  eq(csv.trim().split("\r\n").length, 1, "header only");
});

// ── E. validateCreateRunInput ────────────────────────────────────────────────

const CLONE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLONE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLONE_PAUSED = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const validInput: CreateRunInput = { createdBy: "operator", cloneIds: [CLONE_A], filters: {}, dailyCap: 30, runCap: null, holdoutPct: 15 };

check("E1 a valid input does not throw", () => {
  validateCreateRunInput(validInput);
});

check("E2 no creators picked is rejected", () => {
  assert(
    (() => {
      try {
        validateCreateRunInput({ ...validInput, cloneIds: [] });
        return false;
      } catch (e) {
        return e instanceof RunValidationError;
      }
    })(),
    "expected a RunValidationError",
  );
});

check("E3 dailyCap above the hard ceiling is rejected", () => {
  assert(
    (() => {
      try {
        validateCreateRunInput({ ...validInput, dailyCap: HARD_MAX_DAILY_CAP + 1 });
        return false;
      } catch {
        return true;
      }
    })(),
    "expected a rejection",
  );
});

check("E4 holdoutPct outside 10-20 (or fractional) is rejected, 10 / 15 / 20 accepted", () => {
  for (const bad of [0, 5, 9, 21, 51, 15.5, NaN]) {
    let threw = false;
    try {
      validateCreateRunInput({ ...validInput, holdoutPct: bad });
    } catch {
      threw = true;
    }
    assert(threw, `holdoutPct ${bad} must be rejected`);
  }
  for (const good of [10, 15, 20]) validateCreateRunInput({ ...validInput, holdoutPct: good });
});

// ── F. every PREVIEW_EXCLUSION_REASONS entry is actually produced somewhere
// in classifyFan's source — catches a reason added to the type but never
// wired into the classifier (this repo's "configured but inert" pattern).

check("F1 every preview exclusion reason string literally appears in audience.ts", () => {
  const src = sourceCode("../audience.ts");
  for (const reason of PREVIEW_EXCLUSION_REASONS) {
    if (reason === "cap_reached" || reason === "holdout") continue; // assigned by the caller, not classifyFan
    assert(src.includes(`"${reason}"`), `classifyFan never returns "${reason}"`);
  }
});

// ── G. structural guarantees on the impure DB functions (same technique as
// check-admin-api.ts's B-series: read the real source the runtime calls) ────

check('G1 "dry-run creates nothing sendable": createDryRun always inserts dry_run: true, not caller-controlled', () => {
  const src = sourceCode("../runs.ts");
  const fn = src.slice(src.indexOf("export async function createDryRun"), src.indexOf("export async function getRun"));
  assert(fn.includes("dry_run: true"), "createDryRun must hardcode dry_run: true");
  assert(!/dry_run:\s*input\./.test(fn), "dry_run must never be taken from caller input at creation");
});

check('G2 "a run cannot go live without confirm_live_at": confirmLive requires status "done" and sets confirm_live_at', () => {
  const src = sourceCode("../runs.ts");
  const fn = src.slice(src.indexOf("export async function confirmLive"), src.indexOf("export async function stopRun"));
  assert(fn.includes('run.status !== "done"'), 'confirmLive must gate on status === "done"');
  assert(fn.includes("confirm_live_at: confirmedAt"), "confirmLive must set confirm_live_at");
  assert(fn.includes(".eq(\"status\", \"done\")"), "the update itself must be conditioned on status still being done (race-safe)");
});

check('G3 "stop sets stop_requested": stopRun always sets stop_requested: true', () => {
  const src = sourceCode("../runs.ts");
  const fn = src.slice(src.indexOf("export async function stopRun"));
  assert(fn.includes("stop_requested: true"), "stopRun must set stop_requested: true");
});

check('G4 "preview never writes": audience.ts calls no mutating Supabase method', () => {
  const src = sourceCode("../audience.ts");
  for (const w of [".insert(", ".update(", ".upsert(", ".delete(", ".rpc("]) {
    assert(!src.includes(w), `audience.ts calls ${w} — preview must be read-only`);
  }
});

check("G5 every mtproto admin route file gates itself with withAdmin (same shape as check-admin-api.ts B3)", () => {
  for (const f of ["preview/route.ts", "runs/route.ts", "events/route.ts", "connections/route.ts", "write/route.ts"]) {
    const src = sourceCode(`../../../app/api/admin/v1/mtproto/${f}`);
    assert(src.includes("withAdmin"), `${f} does not use withAdmin`);
    assert(/export const (GET|POST) = withAdmin\(/.test(src), `${f} exports a handler not wrapped in withAdmin(...)`);
  }
});

check("G6 no mtproto admin route file reaches Supabase directly (same rule as check-admin-api.ts B4)", () => {
  for (const f of ["preview/route.ts", "runs/route.ts", "events/route.ts", "connections/route.ts", "write/route.ts"]) {
    const src = sourceCode(`../../../app/api/admin/v1/mtproto/${f}`);
    assert(!src.includes("supabaseAdmin"), `${f} imports supabaseAdmin directly — reads/writes must go through lib/mtproto/`);
  }
});

// ── H. new behavioural checks (fake in-memory DB, never a real Supabase) ────

const RUN_OK = { createdBy: "operator", cloneIds: [CLONE_A], filters: {}, dailyCap: 30, runCap: null, holdoutPct: 15 } satisfies CreateRunInput;

function freshDb(): FakeDb {
  const db = new FakeDb();
  db.seed("clones", [
    { id: CLONE_A, name: "Alpha", slug: "alpha", status: "active" },
    { id: CLONE_B, name: "Beta", slug: "beta", status: "active" },
    { id: CLONE_PAUSED, name: "Gamma", slug: "gamma", status: "paused" },
  ]);
  __setMtDbForTest(db);
  return db;
}
const eventsOf = (db: FakeDb, type: string) => db.rows("reengage_events").filter((e) => e.event_type === type);

acheck("H1 createDryRun is always dry, draft, unconfirmed, whatever the caller smuggles in", async () => {
  const db = freshDb();
  const smuggled = { ...RUN_OK, dryRun: false, dry_run: false, confirmLiveAt: "2026-01-01T00:00:00Z", confirm_live_at: "2026-01-01T00:00:00Z", status: "running" } as unknown as CreateRunInput;
  const run = await createDryRun(smuggled);
  eq(run.dryRun, true, "dryRun");
  eq(run.confirmLiveAt, null, "confirmLiveAt");
  eq(run.status, "draft", "status");
  const row = db.rows("reengage_runs")[0];
  eq(row.dry_run, true, "stored dry_run");
  eq(row.confirm_live_at, null, "stored confirm_live_at");
  eq(eventsOf(db, "config_change").length, 1, "run_created event");
});

acheck("H2 createDryRun rejects out-of-bounds caps and hold-out, unknown, paused and malformed creators", async () => {
  const db = freshDb();
  const bad: Partial<CreateRunInput>[] = [
    { holdoutPct: 9 }, { holdoutPct: 21 }, { holdoutPct: 0 }, { dailyCap: 0 }, { dailyCap: 101 }, { dailyCap: 30.5 },
    { runCap: 0 }, { runCap: 10_001 }, { runCap: 2.5 }, { cloneIds: ["clone-1"] }, { cloneIds: ["dddddddd-dddd-4ddd-8ddd-dddddddddddd"] },
    { cloneIds: [CLONE_PAUSED] }, { cloneIds: [] },
  ];
  for (const b of bad) {
    await rejects(createDryRun({ ...RUN_OK, ...b }), undefined);
  }
  eq(db.rows("reengage_runs").length, 0, "nothing was written by any rejected create");
});

acheck("H3 filters are rebuilt: injection strings in excludeIds/language/numbers are rejected, unknown keys dropped", async () => {
  freshDb();
  for (const filters of [
    { excludeIds: ["1),id.neq.(2"] }, { language: "en),or(id.gt.0" }, { minSpendStars: -5 }, { minSpendStars: NaN },
    { lastActiveFromDays: 10, lastActiveToDays: 2 }, { segment: "everyone" },
  ]) {
    await rejects(createDryRun({ ...RUN_OK, filters: filters as never }));
  }
  const clean = sanitizeFilters({ segment: "top_spenders", evil: "x", dryRun: false, minSpendStars: 100 }, [CLONE_A]);
  assert(!("evil" in clean) && !("dryRun" in clean), "unknown keys must be dropped");
});

/** A finished dry run: 3 would-send episodes (+1 hold-out), 4 matching users, one
 *  scan_excluded event, status 'done'. Returns the run id. */
async function finishedDryRun(db: FakeDb): Promise<string> {
  const run = await createDryRun(RUN_OK);
  await queueRun(run.id, "operator");
  Object.assign(db.rows("reengage_runs")[0], { status: "done" });
  db.seed("users", [1, 2, 3, 4].map((n) => userRow(uid(n), { name: n === 1 ? "Mike Smith" : `Fan${n}` })));
  const start = T(72);
  db.seed("reengage_episodes", [
    ...[1, 2, 3].map((n) => ({ id: `e${n}`, run_id: run.id, clone_id: CLONE_A, user_id: uid(n), telegram_id: 1000 + n, episode_start_inbound_at: start, state: "acked", dry_run: true, tg_message_id: null, sent_at: T(1), prepared_text: `hey ${n === 1 ? "Mike" : "Fan" + n}, thinking of you`, acked_text: `hey ${n === 1 ? "Mike" : "Fan" + n}, thinking of you`, skip_reason: null, error_code: null, created_at: T(2) })),
    { id: "e4", run_id: run.id, clone_id: CLONE_A, user_id: uid(4), telegram_id: 1004, episode_start_inbound_at: start, state: "holdout", dry_run: true, tg_message_id: null, sent_at: null, prepared_text: null, acked_text: null, skip_reason: null, error_code: null, created_at: T(2) },
  ]);
  await insertEvent({ runId: run.id, cloneId: CLONE_A, userId: uid(9), episodeId: null, eventType: "scan_excluded", actor: "system", detail: { reason: "blocked" } });
  return run.id;
}

acheck("H4 confirmLive: needs the typed phrase, a finished dry run, no stop, no global stop; then sets confirm_live_at once", async () => {
  const db = freshDb();
  const run = { id: await finishedDryRun(db) };
  const setStatus = (status: string, extra: object = {}) => Object.assign(db.rows("reengage_runs")[0], { status }, extra);

  setStatus("done");
  for (const typed of [undefined, null, "", "go live", "GO", "yes"]) await rejects(confirmLive(run.id, "operator", typed as never), /GO LIVE/);
  eq(db.rows("reengage_runs")[0].dry_run, true, "still dry after wrong phrases");
  eq(db.rows("reengage_runs")[0].confirm_live_at, null, "confirm_live_at untouched");

  for (const st of ["draft", "queued", "running", "paused", "stopped", "failed"]) {
    setStatus(st);
    await rejects(confirmLive(run.id, "operator", CONFIRM_LIVE_PHRASE), /reviewed|need "done"|stopped/);
  }
  setStatus("done", { stop_requested: true });
  await rejects(confirmLive(run.id, "operator", CONFIRM_LIVE_PHRASE), /stopped/);
  setStatus("done", { stop_requested: false });

  db.seed("app_settings", [{ key: "mtproto_global_stop", value: "true" }]);
  await rejects(confirmLive(run.id, "operator", CONFIRM_LIVE_PHRASE), /GLOBAL STOP/);
  db.fail("app_settings", "select", { message: "boom" });
  await rejects(confirmLive(run.id, "operator", CONFIRM_LIVE_PHRASE), /unreadable/);
  db.fail("app_settings", "select", null);
  db.seed("app_settings", [{ key: "mtproto_global_stop", value: "false" }]);
  eq(db.rows("reengage_runs")[0].dry_run, true, "every refusal left the run dry");

  await rejects(confirmLive(run.id, "operator", CONFIRM_LIVE_PHRASE), /nobody has reviewed/);
  eq(db.rows("reengage_runs")[0].dry_run, true, "unreviewed: still dry");
  await recordDryRunReview(run.id, "operator");
  const live = await confirmLive(run.id, "operator", ` ${CONFIRM_LIVE_PHRASE} `);
  eq(live.dryRun, false, "dryRun after confirm");
  assert(live.confirmLiveAt !== null, "confirm_live_at set");
  eq(live.status, "queued", "requeued");
  const ev = eventsOf(db, "control_action").find((e) => e.detail.action === "confirm_live");
  assert(ev, "confirm_live control_action event written");
  eq(ev!.actor, "operator", "actor");
  assert(ev!.detail.before && ev!.detail.after, "before/after recorded");
  await rejects(confirmLive(run.id, "operator", CONFIRM_LIVE_PHRASE), /already live/);
});

acheck("H5 stopRun writes control_action with actor + before/after, refuses finished runs, reports audit failure loudly", async () => {
  const db = freshDb();
  const run = await createDryRun(RUN_OK);
  await queueRun(run.id, "operator");
  const stopped = await stopRun(run.id, "operator", "because");
  eq(stopped.status, "stopped", "status");
  eq(stopped.stopRequested, true, "stop_requested");
  const ev = eventsOf(db, "control_action").find((e) => e.detail.action === "stop_run");
  assert(ev, "stop_run event written");
  eq(ev!.actor, "operator", "actor");
  eq(ev!.detail.before.status, "queued", "before.status");
  eq(ev!.detail.after.status, "stopped", "after.status");
  await rejects(stopRun(run.id, "operator"), /cannot stop/);

  const r2 = await createDryRun(RUN_OK);
  db.fail("reengage_events", "insert", { message: "events down" });
  await rejects(stopRun(r2.id, "operator"), /WAS stopped, but the audit event failed/);
  eq(db.rows("reengage_runs").find((r) => r.id === r2.id)!.status, "stopped", "the stop itself still applied");

  db.fail("reengage_events", "insert", null);
  const r3 = await createDryRun(RUN_OK);
  db.fail("reengage_runs", "update", { message: "db down" });
  await rejects(stopRun(r3.id, "operator"), /stop failed/);
  db.fail("reengage_runs", "update", null);
  eq((await getRun(r3.id))!.stopRequested, false, "a failed stop reads as not stopped, never as stopped");
});

acheck("H6 global stop: writes flag + control_action (actor, before/after); lifting needs RESUME server-side; errors surface", async () => {
  const db = freshDb();
  eq(await getGlobalStop(), false, "default not stopped");
  await setGlobalStop(true, "operator", "test");
  eq(await getGlobalStop(), true, "stopped");
  const ev = eventsOf(db, "control_action").find((e) => e.detail.action === "global_stop");
  assert(ev, "global_stop event");
  eq(ev!.actor, "operator", "actor");
  eq(ev!.detail.before.stopped, false, "before");
  eq(ev!.detail.after.stopped, true, "after");

  for (const t of [undefined, null, "", "resum", "yes"]) await rejects(setGlobalStop(false, "operator", undefined, t as never), /RESUME/);
  eq(await getGlobalStop(), true, "still stopped after refused resumes");
  await setGlobalStop(false, "operator", undefined, "resume");
  eq(await getGlobalStop(), false, "lifted with the phrase");

  db.fail("app_settings", "upsert", { message: "write failed" });
  await rejects(setGlobalStop(true, "operator"), /failed/);
  db.fail("app_settings", "upsert", null);
  db.fail("app_settings", "select", { message: "read failed" });
  await rejects(getGlobalStop(), /could not read global stop/);
  db.fail("app_settings", "select", null);
  db.fail("reengage_events", "insert", { message: "events down" });
  await rejects(setGlobalStop(true, "operator"), /WAS applied, but the audit event failed/);
});

acheck("H7 connection pause/cap write before/after events and reject bad input", async () => {
  const db = freshDb();
  await setConnectionPaused(CLONE_A, true, "flood", "operator");
  const ev = eventsOf(db, "control_action").find((e) => e.detail.action === "pause_connection");
  assert(ev, "pause event");
  eq(ev!.detail.before.paused, false, "before");
  eq(ev!.detail.after.paused, true, "after");
  eq(ev!.clone_id, CLONE_A, "clone id on the event");
  await rejects(setConnectionPaused("not-a-uuid", true, null, "operator"));
  for (const bad of [0, 101, 30.5, NaN]) await rejects(setConnectionDailyCap(CLONE_A, bad, "operator"));
  await setConnectionDailyCap(CLONE_A, 40, "operator");
  eq(db.rows("userbot_connections")[0].daily_cap, 40, "cap stored");
  db.fail("userbot_connections", "upsert", { message: "nope" });
  await rejects(setConnectionPaused(CLONE_A, false, null, "operator"), /could not resume/);
});

// Audience preview against the fake: every exclusion in one table.
const T = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
function userRow(id: string, over: Partial<CandidateRow> = {}, clone = CLONE_A): Record<string, unknown> {
  return {
    id, clone_id: clone, telegram_id: 1000 + Number(id.slice(-4)), name: id, language_code: "en", blocked: false, blocked_reason: null,
    paused: false, is_active: true, minor_flagged_at: null, first_seen_at: "2026-08-20T00:00:00Z", legacy_id: null, purchase_count: 0,
    last_message_received: T(72), total_spent_stars: 0, spend_tier: null, ...over,
  };
}
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

acheck("H8 preview: every ineligible class excluded, numbers add up, caps and hold-out bounded", async () => {
  const db = freshDb();
  const contactedStart = T(100);
  db.seed("users", [
    userRow(uid(1)), userRow(uid(2)), userRow(uid(3)), userRow(uid(4)), userRow(uid(5)), // 5 clean
    userRow(uid(10), { blocked: true }),
    userRow(uid(11), { blocked: true, blocked_reason: "minor" }),
    userRow(uid(12), { minor_flagged_at: "2026-08-01T00:00:00Z" }),
    userRow(uid(13), { blocked: true, blocked_reason: "us_location" }),
    userRow(uid(14), { paused: true }),
    userRow(uid(15), { legacy_id: "old-1" }),
    userRow(uid(16), { first_seen_at: "2026-07-30T00:00:00Z" }), // native early fan: eligible
    userRow(uid(17), { last_message_received: T(2) }),
    userRow(uid(18), { last_message_received: contactedStart }), // already has an episode
    userRow(uid(19)), // opted out
    userRow(uid(20), { telegram_id: null }),
    userRow(uid(21), { is_active: false }),
    userRow(uid(22), { last_message_received: null }), // never messaged: not even a candidate
  ]);
  db.seed("reengage_optouts", [{ id: "1", clone_id: CLONE_A, user_id: uid(19), telegram_id: 1019 }]);
  // stored with a different spelling of the same instant
  db.seed("reengage_episodes", [{ id: "e1", clone_id: CLONE_A, user_id: uid(18), telegram_id: 1018, dry_run: false, episode_start_inbound_at: contactedStart.replace("Z", "+00:00") }]);

  const p = await computeAudiencePreview({ cloneIds: [CLONE_A], segment: "all_silent" }, { dailyCap: 30, runCap: null, holdoutPct: 15 });
  eq(p.excluded.blocked, 1, "blocked");
  eq(p.excluded.minor_gated, 2, "minor_gated");
  eq(p.excluded.us_location, 1, "us_location");
  eq(p.excluded.paused, 1, "paused");
  eq(p.excluded.legacy_import, 1, "legacy_import via legacy_id only");
  eq(p.excluded.within_24h, 1, "within_24h");
  eq(p.excluded.already_contacted, 1, "already_contacted (timestamp spelling differs)");
  eq(p.excluded.opt_out, 1, "opt_out");
  eq(p.excluded.no_chat_id, 1, "no_chat_id");
  eq(p.excluded.inactive, 1, "inactive");
  eq(p.candidatePool, 17, "pool excludes the never-messaged fan");
  eq(p.eligible + p.excludedTotal, p.candidatePool, "eligible + every exclusion (incl. hold-out, cap) === candidate pool");
  eq(p.eligible + p.holdout + p.excluded.cap_reached, 6, "6 clean fans are split between eligible, hold-out and cap");

  const capped = await computeAudiencePreview({ cloneIds: [CLONE_A] }, { dailyCap: 2, runCap: 1, holdoutPct: 10 });
  assert(capped.eligible <= 1, "eligible is bounded by min(dailyCap, runCap)");
  eq(capped.eligible + capped.excludedTotal, capped.candidatePool, "still adds up when capped");

  for (const holdoutPct of [0, 9, 21]) await rejects(computeAudiencePreview({ cloneIds: [CLONE_A] }, { dailyCap: 30, runCap: null, holdoutPct }));
  const wrote = db.rows("reengage_runs").length + db.rows("reengage_events").length;
  eq(wrote, 0, "preview wrote nothing");
});

acheck("H9 preview fails CLOSED when opt-outs cannot be read; tolerates only a missing table", async () => {
  const db = freshDb();
  db.seed("users", [userRow(uid(1))]);
  db.fail("reengage_optouts", "select", { message: "connection reset" });
  await rejects(computeAudiencePreview({ cloneIds: [CLONE_A] }, { dailyCap: 30, runCap: null, holdoutPct: 15 }), /opt/i);
  db.fail("reengage_optouts", "select", { message: 'relation "public.reengage_optouts" does not exist', code: "42P01" });
  db.fail("reengage_episodes", "select", { message: "Could not find the table", code: "PGRST205" });
  const p = await computeAudiencePreview({ cloneIds: [CLONE_A] }, { dailyCap: 30, runCap: null, holdoutPct: 15 });
  eq(p.candidatePool, 1, "unmigrated DB still previews");
});

acheck("H10 preview segments mirror the worker (top_spenders default 500, never_bought also needs purchase_count 0)", async () => {
  const db = freshDb();
  db.seed("users", [
    userRow(uid(1), { total_spent_stars: 600, purchase_count: 1 }),
    userRow(uid(2), { total_spent_stars: 100, purchase_count: 1 }),
    userRow(uid(3), { total_spent_stars: 0, purchase_count: 0 }),
    userRow(uid(4), { total_spent_stars: 0, purchase_count: 2 }), // undercounted buyer
  ]);
  const run = (segment: string) => computeAudiencePreview({ cloneIds: [CLONE_A], segment: segment as never }, { dailyCap: 100, runCap: null, holdoutPct: 10 });
  eq((await run("top_spenders")).candidatePool, 1, "top_spenders >= 500 by default");
  eq((await run("never_bought")).candidatePool, 1, "never_bought excludes the purchase_count>0 fan");
  eq((await run("lapsed_buyers")).candidatePool, 3, "lapsed = purchase_count > 0");
});

// Lift / attribution -----------------------------------------------------------
const H = 3_600_000;
const NOWMS = Date.parse("2026-09-22T12:00:00Z");
const at = (hoursBeforeNow: number) => new Date(NOWMS - hoursBeforeNow * H).toISOString();
function ep(over: Partial<ReengageEpisode>): ReengageEpisode {
  return episode({ cloneId: CLONE_A, createdAt: at(400), episodeStartInboundAt: at(500), updatedAt: at(400), ...over });
}
const order = (userId: string, hoursBeforeNow: number, stars: number) => ({ userId, cloneId: CLONE_A, stars, paidMs: NOWMS - hoursBeforeNow * H });

check("I1 lift: contacted and hold-out use the same rule and window; reply-gated attribution is separate", () => {
  const episodes = [
    ep({ userId: "c1", state: "replied", sentAt: at(300), tgMessageId: 1, createdAt: at(310) }),
    ep({ userId: "c2", state: "acked", sentAt: at(300), tgMessageId: 2, createdAt: at(310) }),
    ep({ userId: "h1", state: "holdout", createdAt: at(310) }),
    ep({ userId: "h2", state: "holdout", createdAt: at(310) }),
  ];
  const purchases = { truncated: false, orders: [order("c1", 290, 100), order("c2", 290, 50), order("h1", 290, 70)] };
  const lift = liftFromData(episodes, purchases, NOWMS);
  const w = lift.find((l) => l.windowHours === 72)!;
  eq(w.contacted.fans, 2, "contacted fans");
  eq(w.holdout.fans, 2, "hold-out fans");
  eq(w.contacted.buyers, 2, "contacted buyers count anyone who bought (c2 never replied)");
  eq(w.contacted.stars, 150, "contacted stars");
  eq(w.holdout.buyers, 1, "hold-out buyers use the same rule");
  eq(w.holdout.stars, 70, "hold-out stars");
  eq(w.contacted.attributedBuyers, 1, "replied AND bought = c1 only");
  eq(w.contacted.attributedStars, 100, "attributed stars");
});

check("I2 lift: only acked sends WITH a message id are contacted (dry-run acks, failed, cancelled are not)", () => {
  const episodes = [
    ep({ userId: "dry", state: "acked", sentAt: at(300), tgMessageId: null, dryRun: true }),
    ep({ userId: "failed", state: "failed", sentAt: at(300), tgMessageId: null }),
    ep({ userId: "cancelled", state: "cancelled" }),
    ep({ userId: "real", state: "acked", sentAt: at(300), tgMessageId: 9 }),
  ];
  const lift = liftFromData(episodes, { truncated: false, orders: [] }, NOWMS);
  eq(lift[0].contacted.fans, 1, "only the real send");
});

check("I3 lift: a window that has not finished yet is excluded, per window", () => {
  const episodes = [ep({ userId: "c1", state: "acked", sentAt: at(30), tgMessageId: 1 }), ep({ userId: "h1", state: "holdout", createdAt: at(30) })];
  const lift = liftFromData(episodes, { truncated: false, orders: [] }, NOWMS);
  eq(lift.find((l) => l.windowHours === 24)!.contacted.fans, 1, "24h window has finished");
  eq(lift.find((l) => l.windowHours === 72)!.contacted.fans, 0, "72h window has not");
  eq(lift.find((l) => l.windowHours === 168)!.holdout.fans, 0, "7d window has not, hold-out either");
});

check("I4 lift: hold-out anchor is shifted by the creator's median send lag so both windows start at 'when we would contact'", () => {
  const episodes = [
    ep({ userId: "c1", state: "acked", sentAt: at(250), createdAt: at(300), tgMessageId: 1 }), // lag 50h
    ep({ userId: "h1", state: "holdout", createdAt: at(300) }),
  ];
  // h1 buys 60h after creation: outside a 24h window anchored at creation+50h? 60-50=10h => inside 24h.
  const lift = liftFromData(episodes, { truncated: false, orders: [order("h1", 240, 10)] }, NOWMS);
  eq(lift.find((l) => l.windowHours === 24)!.holdout.buyers, 1, "purchase 10h after the shifted anchor counts");
});

check("I5 lift: a fan in both groups stays only in contacted; duplicate episodes count one fan; partial flag propagates", () => {
  const episodes = [
    ep({ userId: "x", state: "acked", sentAt: at(300), tgMessageId: 1 }),
    ep({ userId: "x", state: "holdout", episodeStartInboundAt: at(800) }),
    ep({ userId: "y", state: "acked", sentAt: at(300), tgMessageId: 2 }),
    ep({ userId: "y", state: "replied", sentAt: at(200), tgMessageId: 3, episodeStartInboundAt: at(900) }),
  ];
  const lift = liftFromData(episodes, { truncated: true, orders: [] }, NOWMS);
  eq(lift[0].contacted.fans, 2, "x and y once each");
  eq(lift[0].holdout.fans, 0, "x removed from hold-out");
  eq(lift[0].partial, true, "truncated purchases mark the report partial");
});

check("I6 funnel counts unique fans from acked sends only and narrows monotonically", () => {
  const episodes = [
    ep({ userId: "a", state: "acked", sentAt: at(10), tgMessageId: 1 }),
    ep({ userId: "a", state: "replied", sentAt: at(5), tgMessageId: 2, episodeStartInboundAt: at(900) }),
    ep({ userId: "b", state: "failed", sentAt: at(10) }),
    ep({ userId: "c", state: "uncertain", sentAt: at(10) }),
    ep({ userId: "d", state: "cancelled" }),
    ep({ userId: "e", state: "acked", sentAt: at(10), tgMessageId: null }), // dry-run would-send
    ep({ userId: "f", state: "holdout" }),
  ];
  const f = funnelFromEpisodes(episodes);
  eq(f.contacted, 2, "a (once) + the dry would-send e; failed/uncertain/cancelled excluded");
  eq(f.acknowledged, 1, "a only: real message id");
  eq(f.replied, 1, "a");
  eq(f.holdout, 1, "f");
  assert(f.contacted >= f.acknowledged && f.acknowledged >= f.replied, "narrowing");
});

check("D4 CSV neutralises spreadsheet formulas in text cells but leaves numbers alone", () => {
  const csv = sendsToCsv([sendRow({ text: "=HYPERLINK(\"http://x\")", telegramId: -5, cloneName: "+cmd" })]);
  assert(csv.includes("\"'=HYPERLINK") || csv.includes("'=HYPERLINK"), "formula text must be prefixed with an apostrophe");
  assert(csv.includes(",-5,"), "a negative number is data, not a formula");
  assert(csv.includes("'+cmd"), "leading + neutralised");
});

check("D5 event details are scrubbed of secret-shaped keys and session-string-shaped values, recursively", () => {
  const out = scrubDetail({ ok: 1, session_string: "abc", nested: { api_hash: "x", fine: 2 }, blob: "A".repeat(300) });
  eq(out.session_string, "[redacted]", "key");
  eq((out.nested as Record<string, unknown>).api_hash, "[redacted]", "nested key");
  eq((out.nested as Record<string, unknown>).fine, 2, "nested ok value kept");
  eq(out.blob, "[redacted]", "long base64-looking value");
});

// ── J. access control + structural guarantees ───────────────────────────────

check("J1 every exported server action calls guardDashboardAction before doing anything", () => {
  const src = sourceCode("../../../app/mtproto-campaign/actions.ts");
  const chunks = src.split("export async function ").slice(1);
  assert(chunks.length >= 8, `expected at least 8 exported actions, found ${chunks.length}`);
  for (const chunk of chunks) {
    const name = chunk.slice(0, chunk.indexOf("("));
    const body = chunk.slice(chunk.indexOf("{\n") + 2).trim();
    assert(body.startsWith("await guardDashboardAction("), `${name} must call guardDashboardAction as its FIRST statement`);
  }
});

check("J2 no agency route: /mtproto-campaign and every sub-path/action file is outside agencyDashboardPath and agency-management", () => {
  for (const p of ["/mtproto-campaign", "/mtproto-campaign/new", "/mtproto-campaign/connections", "/mtproto-campaign/live", `/mtproto-campaign/runs/${CLONE_A}`, `/mtproto-campaign/runs/${CLONE_A}/csv`]) {
    assert(!agencyDashboardPath(p, "anyagency", true), `${p} must be denied to an agency session`);
    assert(!agencyDashboardPath(p, "anyagency", false), `${p} must be denied to a read-only agency session`);
  }
  const mgmt = sourceCode("../../agency-management.ts");
  assert(!/mtproto/i.test(mgmt), "agency-management.ts must NOT allowlist any mtproto action (default deny)");
  const policy = sourceCode("../../agency-policy.ts");
  assert(!/mtproto/i.test(policy), "agency-policy.ts must not mention mtproto");
});

check("J3 confirm_live_at and dry_run:false are written by confirmLive ONLY (never by createRun, the action layer or any route)", () => {
  const files = [
    "../runs.ts", "../audience.ts", "../connections.ts", "../global-stop.ts", "../events.ts", "../episodes.ts",
    "../../../app/mtproto-campaign/actions.ts", "../../../app/api/admin/v1/mtproto/write/route.ts",
  ];
  for (const f of files) {
    const src = sourceCode(f);
    const hits = (src.match(/confirm_live_at\s*:\s*confirmedAt|dry_run\s*:\s*false/g) ?? []).length;
    if (f === "../runs.ts") eq(hits, 2, "runs.ts writes each exactly once (inside confirmLive)");
    else eq(hits, 0, `${f} must not write confirm_live_at / dry_run:false`);
  }
  const runs = sourceCode("../runs.ts");
  const c = runs.slice(runs.indexOf("export async function confirmLive"), runs.indexOf("const STOPPABLE"));
  assert(c.includes("confirm_live_at: confirmedAt") && c.includes("dry_run: false"), "the single write is inside confirmLive");
});

check("J4 the typed confirmations are enforced in the lib functions, not only the form", () => {
  const runs = sourceCode("../runs.ts");
  assert(/CONFIRM_LIVE_PHRASE/.test(runs.slice(runs.indexOf("export async function confirmLive"))), "confirmLive checks the phrase");
  const gs = sourceCode("../global-stop.ts");
  assert(/RESUME_PHRASE/.test(gs), "setGlobalStop checks the resume phrase");
});

check("J5 the live feed route and CSV export are not reachable through any allowlist and never cache", () => {
  const live = sourceCode("../../../app/mtproto-campaign/live/route.ts");
  assert(live.includes("no-store"), "live feed must be no-store");
  const csv = sourceCode("../../../app/mtproto-campaign/runs/[id]/csv/route.ts");
  assert(csv.includes("no-store"), "csv must be no-store");
});

check("J6 no mtproto module or component uses raw HTML injection or reads a secret env var", () => {
  for (const f of ["../../../components/mtproto/LiveFeed.tsx", "../../../components/mtproto/SendsTable.tsx", "../../../components/mtproto/ConnectionsTable.tsx", "../../../app/mtproto-campaign/runs/[id]/page.tsx"]) {
    assert(!/dangerouslySetInnerHTML|innerHTML|eval\(/.test(sourceCode(f)), `${f} injects raw HTML`);
  }
  for (const f of ["../events.ts", "../connections.ts", "../runs.ts", "../global-stop.ts"]) {
    assert(!/process\.env|SUPABASE_SERVICE|api_hash|SESSION_ENCRYPTION/i.test(sourceCode(f)), `${f} touches a secret`);
  }
});

check("J7 column/table/event names used here match migration 162 and twin-userbot contract.ts exactly", () => {
  // Two of the three files this compares live in SIBLING checkouts (../twin-bot,
  // ../twin-userbot). CI checks out this repo on its own, so there they are simply
  // absent and readFileSync threw ENOENT, failing the whole offline chain on files
  // the runner was never handed. Read them optionally and announce the skip out
  // loud. The in-repo half still runs everywhere, and when a sibling IS present
  // (every local workspace, which is where the drift actually happens) the full
  // comparison still fails on a mismatch. This is why check-sequence-render.ts and
  // check-sequence-ui.ts, which read ../twin-bot the same way, are kept out of the
  // test:offline chain entirely.
  const sibling = (rel: string) => {
    try {
      return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      console.log(`  [J7] cross-repo half SKIPPED: ${rel.split("/").slice(-1)[0]} is not checked out beside this repo`);
      return null;
    }
  };
  const mig = sibling("../../../../twin-bot/db/migrations/162_reengage_mtproto.sql");
  const mig164 = sibling("../../../../twin-bot/db/migrations/164_userbot_live_enabled.sql");
  const contract = sibling("../../../../twin-userbot/src/contract.ts");
  const listOf = (src: string, name: string) => {
    const m = new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const`).exec(src);
    return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
  };
  const mine = readFileSync(fileURLToPath(new URL("../types.ts", import.meta.url)), "utf8");
  for (const name of ["EPISODE_STATES", "RUN_STATUSES", "EVENT_TYPES", "EXCLUSION_REASONS", "RUN_SEGMENTS", "CONNECTION_STATUSES"]) {
    const a = listOf(mine, name);
    assert(a.length > 0, `${name} not found in types.ts`);
    if (!contract) continue;
    const b = listOf(contract, name);
    if (b.length) eq(JSON.stringify(a), JSON.stringify(b), `${name} drifted from twin-userbot/src/contract.ts`);
  }
  // The UserbotConnection shape is shared with the worker the same way the
  // const lists are: every field the worker's contract names must exist here,
  // spelled the same. (This side may carry extra columns the worker never
  // reads, createdAt/updatedAt today, so the rule is subset, not equality.)
  const fieldsOf = (src: string) => {
    const m = /export interface UserbotConnection \{([\s\S]*?)\n\}/.exec(src);
    return m ? [...m[1].matchAll(/^\s{2}(\w+)\??:/gm)].map((x) => x[1]) : [];
  };
  const mineFields = fieldsOf(mine);
  assert(mineFields.includes("liveEnabled"), "UserbotConnection.liveEnabled missing from types.ts (migration 164)");
  if (contract) {
    const theirs = fieldsOf(contract);
    assert(theirs.length > 0, "UserbotConnection not found in twin-userbot/src/contract.ts");
    assert(theirs.includes("liveEnabled"), "UserbotConnection.liveEnabled missing from twin-userbot/src/contract.ts");
    for (const f of theirs) assert(mineFields.includes(f), `UserbotConnection.${f} is in twin-userbot/src/contract.ts but not in types.ts`);
  }
  if (mig164) {
    assert(/\blive_enabled\b/.test(mig164), "migration 164 does not add live_enabled");
    assert(/not null default false/.test(mig164), "migration 164 must default live_enabled to false (dry) for every existing row");
    assert(!/\bdrop\s+(table|column)\b/i.test(mig164), "migration 164 must be additive only");
  }
  assert(sourceCode("../connections.ts").includes("live_enabled"), "connections.ts must map the live_enabled column");
  if (!mig) return;
  for (const v of listOf(mine, "EVENT_TYPES")) assert(mig.includes(`'${v}'`), `event type ${v} missing from the migration CHECK`);
  for (const v of listOf(mine, "EPISODE_STATES")) assert(mig.includes(`'${v}'`), `episode state ${v} missing from the migration CHECK`);
  for (const v of listOf(mine, "RUN_STATUSES")) assert(mig.includes(`'${v}'`), `run status ${v} missing from the migration CHECK`);
  for (const col of ["run_id", "clone_id", "user_id", "telegram_id", "episode_start_inbound_at", "tg_message_id", "sent_at", "confirm_live_at", "stop_requested", "holdout_pct", "daily_cap", "run_cap", "paused_reason", "dry_run", "prepared_text", "acked_text", "error_code", "skip_reason"]) {
    assert(new RegExp(`\\b${col}\\b`).test(mig), `column ${col} used by the dashboard is not in migration 162`);
  }
});


// ── K. dry-run review gate + dry-episode awareness ───────────────────────────

acheck("K1 review gate: live is REFUSED without a recorded review, even with the right phrase and a done run", async () => {
  const db = freshDb();
  const id = await finishedDryRun(db);
  await rejects(confirmLive(id, "operator", CONFIRM_LIVE_PHRASE), /nobody has reviewed/);
  eq(db.rows("reengage_runs")[0].dry_run, true, "still dry");
  eq(db.rows("reengage_runs")[0].confirm_live_at, null, "confirm_live_at untouched");
});

acheck("K2 review gate: REFUSED after the dry-run counts change since review; re-review reopens it", async () => {
  const db = freshDb();
  const id = await finishedDryRun(db);
  await recordDryRunReview(id, "operator");
  const ev = eventsOf(db, "control_action").find((e) => e.detail.kind === "dry_run_reviewed");
  assert(ev, "review event written");
  eq(ev!.detail.run_id, id, "event run_id");
  eq(ev!.detail.would_send_count, 3, "stored would_send_count is the server-computed one");
  eq(ev!.actor, "operator", "reviewed_by");

  // one more would-send appears
  db.rows("reengage_episodes").push({ id: "e5", run_id: id, clone_id: CLONE_A, user_id: uid(4), state: "acked", dry_run: true, tg_message_id: null, sent_at: T(1), acked_text: "x", prepared_text: "x", created_at: T(1) });
  await rejects(confirmLive(id, "operator", CONFIRM_LIVE_PHRASE), /changed since/);
  eq(db.rows("reengage_runs")[0].dry_run, true, "still dry");
  db.rows("reengage_episodes").pop();
  const live = await confirmLive(id, "operator", CONFIRM_LIVE_PHRASE);
  eq(live.dryRun, false, "counts back to what was reviewed: allowed");
});

acheck("K2b counts drift: hold-out flip and a new exclusion are each caught; re-review then allows", async () => {
  const db = freshDb();
  const id = await finishedDryRun(db);
  await recordDryRunReview(id, "operator");
  const holdoutRow = db.rows("reengage_episodes").find((e) => e.id === "e4")!;
  Object.assign(holdoutRow, { state: "acked", sent_at: T(1), acked_text: "hi", prepared_text: "hi" });
  await rejects(confirmLive(id, "operator", CONFIRM_LIVE_PHRASE), /changed since/);
  Object.assign(holdoutRow, { state: "holdout", sent_at: null, acked_text: null, prepared_text: null });
  await insertEvent({ runId: id, cloneId: CLONE_A, userId: uid(8), episodeId: null, eventType: "scan_excluded", actor: "system", detail: { reason: "paused" } });
  await rejects(confirmLive(id, "operator", CONFIRM_LIVE_PHRASE), /changed since/);
  await recordDryRunReview(id, "operator"); // human looks again at the new numbers
  const live = await confirmLive(id, "operator", CONFIRM_LIVE_PHRASE);
  eq(live.dryRun, false, "allowed after re-review");
});

acheck("K3 review gate: REFUSED with the wrong phrase even when reviewed and everything else holds", async () => {
  const db = freshDb();
  const id = await finishedDryRun(db);
  await recordDryRunReview(id, "operator");
  for (const typed of [undefined, "", "go live", "GO LIVE NOW", "yes"]) await rejects(confirmLive(id, "operator", typed as never), /GO LIVE/);
  eq(db.rows("reengage_runs")[0].dry_run, true, "still dry after wrong phrases");
});

acheck("K4 review gate: the live audience may be identical or smaller than reviewed, NEVER larger", async () => {
  const db = freshDb();
  const id = await finishedDryRun(db);
  await recordDryRunReview(id, "operator");
  db.rows("users").push(userRow(uid(50))); // a new fan became eligible
  await rejects(confirmLive(id, "operator", CONFIRM_LIVE_PHRASE), /audience grew/);
  eq(db.rows("reengage_runs")[0].dry_run, true, "still dry");
  db.tables["users"] = db.rows("users").filter((u) => u.id !== uid(50) && u.id !== uid(2)); // and one fan left
  const live = await confirmLive(id, "operator", CONFIRM_LIVE_PHRASE);
  eq(live.dryRun, false, "smaller audience is allowed");
});

acheck("K5 review gate: allowed ONLY when review + unchanged counts + phrase + no global stop + not stopped + audience not larger all hold", async () => {
  const db = freshDb();
  const id = await finishedDryRun(db);
  await recordDryRunReview(id, "operator");
  db.seed("app_settings", [{ key: "mtproto_global_stop", value: "true" }]);
  await rejects(confirmLive(id, "operator", CONFIRM_LIVE_PHRASE), /GLOBAL STOP/);
  db.seed("app_settings", [{ key: "mtproto_global_stop", value: "false" }]);
  Object.assign(db.rows("reengage_runs")[0], { stop_requested: true });
  await rejects(confirmLive(id, "operator", CONFIRM_LIVE_PHRASE), /stopped/);
  Object.assign(db.rows("reengage_runs")[0], { stop_requested: false });
  eq(db.rows("reengage_runs")[0].dry_run, true, "every refusal left it dry");
  const live = await confirmLive(id, "operator", CONFIRM_LIVE_PHRASE);
  eq(live.dryRun, false, "live");
  const ev = eventsOf(db, "control_action").find((e) => e.detail.action === "confirm_live");
  assert(ev && typeof ev.detail.reviewed_event_id === "number", "confirm event names the review it relied on");
  await rejects(confirmLive(id, "operator", CONFIRM_LIVE_PHRASE), /already live/);
});

acheck("K5b a review cannot be recorded for a run that is not done, is stopped, or would send nothing", async () => {
  const db = freshDb();
  const id = await finishedDryRun(db);
  const row = db.rows("reengage_runs")[0];
  for (const st of ["draft", "queued", "running", "failed"]) {
    Object.assign(row, { status: st });
    await rejects(recordDryRunReview(id, "operator"), /not finished/);
  }
  Object.assign(row, { status: "done", stop_requested: true });
  await rejects(recordDryRunReview(id, "operator"), /stopped/);
  Object.assign(row, { stop_requested: false });
  db.fail("reengage_episodes", "select", { message: "boom" });
  await rejects(recordDryRunReview(id, "operator"));
  db.fail("reengage_episodes", "select", null);
  db.tables["reengage_episodes"] = db.rows("reengage_episodes").filter((e) => e.state === "holdout");
  await rejects(recordDryRunReview(id, "operator"), /nothing/);
  eq(eventsOf(db, "control_action").filter((e) => e.detail.kind === "dry_run_reviewed").length, 0, "no review event written by any refusal");
});

acheck("K5c gate fails CLOSED when the review record or dry-run counts cannot be read", async () => {
  const db = freshDb();
  const id = await finishedDryRun(db);
  await recordDryRunReview(id, "operator");
  db.fail("reengage_events", "select", { message: "events unreadable" });
  await rejects(confirmLive(id, "operator", CONFIRM_LIVE_PHRASE), /unreadable/);
  db.fail("reengage_events", "select", null);
  db.fail("reengage_episodes", "select", { message: "episodes unreadable" });
  await rejects(confirmLive(id, "operator", CONFIRM_LIVE_PHRASE), /unreadable/);
  db.fail("reengage_episodes", "select", null);
  eq(db.rows("reengage_runs")[0].dry_run, true, "still dry");
});

acheck("K6 dry-run summary: counts, excluded by reason, at most 25 samples, fan names redacted to initial + id tail", async () => {
  const db = freshDb();
  const id = await finishedDryRun(db);
  const s = await computeDryRunSummary(id);
  eq(s.wouldSendCount, 3, "would send");
  eq(s.holdoutCount, 1, "hold-out");
  eq(s.excludedByReason.blocked, 1, "excluded by reason");
  const mike = s.sample.find((m) => m.who.startsWith("M."));
  assert(mike, "redacted label is initial + id tail");
  assert(mike!.who.endsWith(uid(1).slice(-4)), "id tail");
  assert(!JSON.stringify(s.sample).includes("Mike") && !JSON.stringify(s.sample).includes("Smith"), "no full name anywhere in the sample");
  eq(redactFan("Ann", "abcdef1234"), "A. …1234", "redactFan");
  eq(redactText("hi Ann and ann", "Ann"), "hi [name] and [name]", "redactText");
  for (let i = 0; i < 30; i++) db.rows("reengage_episodes").push({ id: `x${i}`, run_id: id, clone_id: CLONE_A, user_id: uid(100 + i), state: "acked", dry_run: true, tg_message_id: null, sent_at: T(1), acked_text: "hello", prepared_text: "hello", created_at: T(1) });
  const big = await computeDryRunSummary(id);
  eq(big.sample.length, 25, "sample capped at 25");
  eq(big.wouldSendCount, 33, "count is not capped");
  db.fail("users", "select", { message: "users down" });
  const withheld = await computeDryRunSummary(id);
  assert(withheld.sampleWithheld && withheld.sample.length === 0, "sample withheld when names cannot be read");
});

acheck("K7 send plan is capped by the min of run cap, daily cap and per-creator cap", async () => {
  const db = freshDb();
  const id = await finishedDryRun(db);
  const run = (await getRun(id))!;
  db.seed("userbot_connections", [{ clone_id: CLONE_A, status: "connected", paused: false, daily_cap: 2, tg_user_id: 1, dc_id: 1, last_seen_at: null, paused_reason: null, session_ref: null, created_at: T(1), updated_at: T(1) }]);
  const summary = await computeDryRunSummary(id);
  const plan = await computeSendPlan({ ...run, dailyCap: 30, runCap: null }, summary);
  eq(plan.firstDayTotal, 2, "creator cap 2 wins over 3 would-send and daily cap 30");
  eq(plan.runTotal, 3, "whole run is the would-send total");
  eq((await computeSendPlan({ ...run, dailyCap: 1, runCap: null }, summary)).firstDayTotal, 1, "run daily cap 1 wins");
  const plan3 = await computeSendPlan({ ...run, dailyCap: 30, runCap: 1 }, summary);
  eq(plan3.runTotal, 1, "run cap 1 wins");
  eq(plan3.firstDayTotal, 1, "run cap also bounds day one");
});

acheck("K8 preview excludes users.is_test accounts; falls back only when the column is missing; other errors fail closed", async () => {
  const db = freshDb();
  db.seed("users", [userRow(uid(1)), userRow(uid(2), { is_test: true }), userRow(uid(3), { is_test: false })]);
  const opts = { dailyCap: 30, runCap: null, holdoutPct: 15 };
  const p = await computeAudiencePreview({ cloneIds: [CLONE_A] }, opts);
  eq(p.excluded.test_account, 1, "test account excluded");
  eq(p.eligible + p.holdout, 2, "the other two survive");
  db.fail("users", "select", { message: "column users.is_test does not exist", code: "42703", ifSelectIncludes: "is_test" });
  const q = await computeAudiencePreview({ cloneIds: [CLONE_A] }, opts);
  eq(q.candidatePool, 3, "fallback read still works without the column");
  eq(q.excluded.test_account, 0, "no test filter without the column");
  db.fail("users", "select", { message: "connection reset", ifSelectIncludes: "is_test" });
  await rejects(computeAudiencePreview({ cloneIds: [CLONE_A] }, opts), /connection reset/);
  db.fail("users", "select", { message: "permission denied for table users", code: "42501" });
  await rejects(computeAudiencePreview({ cloneIds: [CLONE_A] }, opts), /permission denied/);
  db.fail("users", "select", { message: "column users.other does not exist", code: "42703" });
  await rejects(computeAudiencePreview({ cloneIds: [CLONE_A] }, opts), /other/);
  eq(isMissingIsTestColumn({ code: "42703", message: "column users.is_test does not exist" }), true, "is_test column error recognised");
  eq(isMissingIsTestColumn({ code: "42703", message: "column users.foo does not exist" }), false, "other column not recognised");
  eq(isMissingIsTestColumn({ message: "timeout while reading is_test" }), false, "unrelated failure mentioning is_test not recognised");
});

acheck("K9 dry-run episodes never count as contacted, and never block a later live audience", async () => {
  const db = freshDb();
  const start = T(72);
  db.seed("users", [userRow(uid(1), { last_message_received: start }), userRow(uid(2), { last_message_received: start })]);
  db.seed("reengage_episodes", [
    { id: "d1", clone_id: CLONE_A, user_id: uid(1), telegram_id: 1001, dry_run: true, episode_start_inbound_at: start },
    { id: "l2", clone_id: CLONE_A, user_id: uid(2), telegram_id: 1002, dry_run: false, episode_start_inbound_at: start },
  ]);
  const p = await computeAudiencePreview({ cloneIds: [CLONE_A] }, { dailyCap: 30, runCap: null, holdoutPct: 15 });
  eq(p.excluded.already_contacted, 1, "only the LIVE episode marks a fan contacted");
  eq(p.eligible + p.holdout, 1, "the fan with only a dry episode is still audience");
  db.fail("reengage_episodes", "select", { message: "column reengage_episodes.dry_run does not exist", code: "42703" });
  await rejects(computeAudiencePreview({ cloneIds: [CLONE_A] }, { dailyCap: 30, runCap: null, holdoutPct: 15 }));
});

check("K10 dry episodes are not real sends, funnel, lift or send rows", () => {
  const dryAcked = episode({ dryRun: true, state: "acked", sentAt: T(1), tgMessageId: 7 });
  const live = episode({ dryRun: false, state: "acked", sentAt: T(1), tgMessageId: 7 });
  eq(isRealSend(dryAcked), false, "dry+acked+message id is still not real");
  eq(isRealSend(live), true, "live is real");
  const f = funnelFromEpisodes([dryAcked, episode({ dryRun: true, state: "holdout" }), { ...live, userId: "u2" }]);
  eq(f.contacted, 1, "only the live send is contacted");
  eq(f.acknowledged, 1, "acknowledged");
  eq(f.holdout, 0, "a dry hold-out is not part of the real funnel");
  const reports = liftFromData([{ ...dryAcked, userId: "a" }, episode({ dryRun: true, state: "holdout", userId: "b", createdAt: T(50) })], { orders: [], truncated: false });
  const total = JSON.stringify(reports);
  assert(!/"fans":[1-9]/.test(total), `dry rows never enter lift: ${total}`);
});

check("K11 source: dry_run filters are in place; the dashboard never writes episodes, dry_run or dedupe_scope", () => {
  assert(/\.eq\("dry_run", false\)/.test(sourceCode("../audience.ts")), "audience already-contacted read filters dry_run=false");
  assert(/\.eq\("dry_run", false\)/.test(sourceCode("../safety.ts")), "safety sentToday filters dry_run=false");
  for (const f of ["../runs.ts", "../audience.ts", "../episodes.ts", "../review.ts", "../safety.ts", "../attribution.ts", "../sends.ts", "../funnel.ts", "../connections.ts", "../events.ts", "../global-stop.ts", "../../../app/mtproto-campaign/actions.ts", "../../../app/api/admin/v1/mtproto/write/route.ts"]) {
    const src = sourceCode(f);
    assert(!/dedupe_scope/.test(src), `${f} must not reference dedupe_scope`);
    if (/reengage_episodes/.test(src)) assert(!/\.(insert|upsert|update|delete)\(/.test(src), `${f} reads reengage_episodes and must not write anything`);
  }
});

check("K12 review gate is wired: confirmLive calls checkReviewGate before its conditional update", () => {
  const runs = sourceCode("../runs.ts");
  const c = runs.slice(runs.indexOf("export async function confirmLive"), runs.indexOf("const STOPPABLE"));
  const g = c.indexOf("checkReviewGate(run)");
  assert(g > 0, "confirmLive must call checkReviewGate");
  assert(g < c.indexOf('.from("reengage_runs")'), "the gate must run before the update");
  assert(c.indexOf("CONFIRM_LIVE_PHRASE") < g, "phrase is checked first");
});


// ── L. spike auto-halts (twin-userbot 5294362: src/spike.ts pauseCreator) ───
// Detail shape below is EXACTLY what pauseCreator writes.

const HALT_DETAIL = {
  errorCode: "auto_halt_spike:optout_spike", auto: true, kind: "optout_spike", requiresOperatorUnpause: true,
  stats: { sample: 12, optOuts: 3, complaints: 0, failures: 0 }, rate: 0.25, count: 3,
  threshold: { rate: 0.1, count: 3, minSample: 10 }, windowHours: 24, sampleMax: 50,
};
function haltedDb(reason = "auto_halt_spike:optout_spike", detail: Record<string, unknown> = HALT_DETAIL): FakeDb {
  const db = freshDb();
  db.seed("userbot_connections", [{ clone_id: CLONE_A, status: "connected", paused: true, paused_reason: reason, daily_cap: 30, tg_user_id: 1, dc_id: 1, last_seen_at: null, session_ref: null, created_at: T(5), updated_at: T(1) }]);
  db.seed("reengage_events", [
    { id: 1, ts: T(30), clone_id: CLONE_A, event_type: "account_halt", actor: "system", detail: { errorCode: "FLOOD_WAIT_300" } },
    { id: 2, ts: T(1), clone_id: CLONE_A, run_id: null, event_type: "account_halt", actor: "system", detail },
  ]);
  return db;
}

check("L1 pure: auto-halt reasons are recognised, manual pauses are not; text carries the tripped rate and threshold", () => {
  eq(autoHaltKind("auto_halt_spike:complaint_spike"), "complaint_spike", "kind");
  eq(autoHaltKind("auto_halt_spike:"), "unknown", "empty suffix still an auto-halt");
  eq(autoHaltKind("flood"), null, "manual reason");
  eq(autoHaltKind(null), null, "no reason");
  eq(AUTO_HALT_PREFIX, "auto_halt_spike:", "prefix mirrors twin-userbot contract");
  const info = buildAutoHaltInfo("auto_halt_spike:optout_spike", { ts: T(1), event_type: "account_halt", detail: HALT_DETAIL })!;
  eq(info.label, "Opt-out spike", "label");
  eq(info.tripped, "3 of 12 recent sends opted out (25%)", "tripped");
  assert(info.threshold!.includes("10% of sends") && info.threshold!.includes("3 opt-outs") && info.threshold!.includes("minimum 10"), `threshold text: ${info.threshold}`);
  const fail = buildAutoHaltInfo("auto_halt_spike:error_spike", { ts: T(1), detail: { kind: "error_spike", stats: { sample: 10, optOuts: 0, complaints: 0, failures: 4 }, rate: 0.4, threshold: { rate: 0.3, count: null, minSample: 10 } } })!;
  eq(fail.tripped, "4 of 10 recent sends hard-failed (40%)", "error spike");
  assert(fail.threshold!.includes("30% of sends") && !fail.threshold!.includes("null"), `error threshold: ${fail.threshold}`);
  const det = buildAutoHaltInfo("auto_halt_spike:detector_error", { ts: T(1), detail: { kind: "detector_error", error: "boom" } })!;
  assert(det.tripped!.includes("boom"), "detector error text");
  const nothing = buildAutoHaltInfo("auto_halt_spike:optout_spike", null)!;
  assert(!nothing.eventFound && nothing.tripped === null, "no event: say so, invent nothing");
  eq(buildAutoHaltInfo("flood", null), null, "manual pause has no auto-halt info");
});

check("L2 resume phrase: only 'RESUME <name>' or 'RESUME <short id>' (any case/spacing); bare RESUME, other names, empty never pass", () => {
  assert(resumePhraseOk("RESUME Alpha", "Alpha", CLONE_A), "name");
  assert(resumePhraseOk("  resume   alpha ", "Alpha", CLONE_A), "case and spacing");
  assert(resumePhraseOk("RESUME aaaaaaaa", "Alpha", CLONE_A), "short id");
  for (const bad of ["RESUME", "resume", "", "  ", "Alpha", "RESUME Beta", "RESUME aaaaaaa", "GO LIVE", null, undefined]) {
    assert(!resumePhraseOk(bad as never, "Alpha", CLONE_A), `must not pass: ${JSON.stringify(bad)}`);
  }
  assert(!resumePhraseOk("RESUME ", "", CLONE_A), "empty name never matches an empty phrase");
});

acheck("L3 Connections read-out: auto-halt shows reason + tripped rate/threshold from the LATEST matching account_halt; manual pause does not", async () => {
  const db = haltedDb();
  db.rows("userbot_connections").push({ clone_id: CLONE_B, status: "connected", paused: true, paused_reason: "operator said so", daily_cap: 30 } as never);
  db.rows("userbot_connections").push({ clone_id: CLONE_PAUSED, status: "connected", paused: false, paused_reason: null, daily_cap: 30 } as never);
  const { listConnections } = await import("../connections");
  const halts = await autoHaltsFor(await listConnections());
  eq(halts.size, 1, "only the auto-halted creator");
  const a = halts.get(CLONE_A)!;
  eq(a.tripped, "3 of 12 recent sends opted out (25%)", "tripped comes from the account_halt event, not the older flood halt");
  assert(a.threshold && a.eventFound, "threshold + event found");
  assert(!halts.has(CLONE_B), "manual pause is not an auto-halt");
  // unreadable halt events: still flagged AUTO-HALTED, without invented numbers
  db.fail("reengage_events", "select", { message: "events down" });
  const degraded = await autoHaltsFor(await listConnections());
  assert(degraded.get(CLONE_A) && !degraded.get(CLONE_A)!.eventFound, "flagged even when the event read fails");
});

acheck("L4 Safety panel snapshot carries the auto-halt (paused, reason, tripped, threshold); manual pause has none", async () => {
  const db = haltedDb();
  db.rows("userbot_connections").push({ clone_id: CLONE_B, status: "connected", paused: true, paused_reason: "manual", daily_cap: 30 } as never);
  const snaps = await computeSafetySnapshots([{ id: CLONE_A, name: "Alpha", slug: "a", status: "active", businessUsername: null }, { id: CLONE_B, name: "Beta", slug: "b", status: "active", businessUsername: null }]);
  const a = snaps.find((x) => x.cloneId === CLONE_A)!;
  const b = snaps.find((x) => x.cloneId === CLONE_B)!;
  assert(a.paused && a.autoHalt && a.autoHalt.tripped === "3 of 12 recent sends opted out (25%)", "auto-halt on the snapshot");
  assert(b.paused && b.autoHalt === null && b.pausedReason === "manual", "manual pause is distinct");
});

acheck("L5 RESUME of an auto-halt is REFUSED server-side without the phrase; nothing is written", async () => {
  const db = haltedDb();
  for (const typed of [undefined, null, "", "RESUME", "resume now", "RESUME Beta", "yes"]) {
    await rejects(setConnectionPaused(CLONE_A, false, null, "operator", typed as never), /AUTO-HALTED/);
  }
  const conn = db.rows("userbot_connections")[0];
  eq(conn.paused, true, "still paused");
  eq(conn.paused_reason, "auto_halt_spike:optout_spike", "reason untouched");
  eq(eventsOf(db, "control_action").length, 0, "no control_action event for a refused resume");
});

acheck("L6 RESUME with the phrase works and logs actor + before/after including the halt reason and numbers", async () => {
  const db = haltedDb();
  await setConnectionPaused(CLONE_A, false, null, "operator", "resume alpha");
  const conn = db.rows("userbot_connections")[0];
  eq(conn.paused, false, "resumed");
  eq(conn.paused_reason, null, "reason cleared");
  const ev = eventsOf(db, "control_action")[0];
  eq(ev.actor, "operator", "actor");
  eq(ev.clone_id, CLONE_A, "clone");
  eq(ev.detail.action, "resume_connection", "action");
  eq(ev.detail.before.paused, true, "before.paused");
  eq(ev.detail.before.pausedReason, "auto_halt_spike:optout_spike", "before carries the halt reason");
  eq(ev.detail.before.autoHalt.tripped, "3 of 12 recent sends opted out (25%)", "before carries what tripped");
  eq(ev.detail.after.paused, false, "after.paused");
  eq(ev.detail.confirmed, true, "typed confirmation recorded");
  eq(ev.detail.resumedAutoHalt, "auto_halt_spike:optout_spike", "resumed halt reason");
  // short id also accepted
  const db2 = haltedDb("auto_halt_spike:error_spike", { ...HALT_DETAIL, kind: "error_spike", errorCode: "auto_halt_spike:error_spike" });
  await setConnectionPaused(CLONE_A, false, null, "api-key", "RESUME aaaaaaaa");
  eq(db2.rows("userbot_connections")[0].paused, false, "short id resumes");
  eq(eventsOf(db2, "control_action")[0].actor, "api-key", "api actor");
});

acheck("L7 a MANUAL pause still resumes without a phrase; pausing an auto-halted creator keeps its halt reason; unreadable connection fails closed", async () => {
  const db = freshDb();
  await setConnectionPaused(CLONE_A, true, "flood", "operator");
  await setConnectionPaused(CLONE_A, false, null, "operator");
  eq(db.rows("userbot_connections")[0].paused, false, "manual resume needs no phrase");
  const db2 = haltedDb();
  await setConnectionPaused(CLONE_A, true, "just in case", "operator");
  eq(db2.rows("userbot_connections")[0].paused_reason, "auto_halt_spike:optout_spike", "auto-halt reason survives a manual pause click");
  db2.fail("userbot_connections", "select", { message: "down" });
  await rejects(setConnectionPaused(CLONE_A, false, null, "operator", "RESUME Alpha"), /could not read connection/);
});

check("L8 the resume gate is wired in the lib function, the server action and the API route (source)", () => {
  const c = sourceCode("../connections.ts");
  assert(/resumePhraseOk\(/.test(c), "setConnectionPaused calls resumePhraseOk");
  assert(c.indexOf("resumePhraseOk(") < c.indexOf('.from("userbot_connections")\n    .upsert'), "the phrase is checked before the write");
  assert(/confirmText/.test(sourceCode("../../../app/mtproto-campaign/actions.ts")), "server action passes confirmText");
  assert(/confirmText/.test(sourceCode("../../../app/api/admin/v1/mtproto/write/route.ts")), "API route passes confirmText");
  const table = sourceCode("../../../components/mtproto/ConnectionsTable.tsx");
  assert(table.includes("AUTO-HALTED") && table.includes("confirmText"), "connections UI shows the badge and collects the phrase");
  assert(sourceCode("../../../components/mtproto/SafetyPanel.tsx").includes("AUTO-HALTED"), "safety panel shows the badge");
});

check("L9 account_halt events read as text (stats + threshold) in the feed formatter, API summary and run page", () => {
  const t = describeAutoHaltEvent(HALT_DETAIL)!;
  assert(t.startsWith("AUTO-HALTED: Opt-out spike") && t.includes("3 of 12") && t.includes("trips at 10%"), `text: ${t}`);
  eq(describeAutoHaltEvent({ errorCode: "FLOOD_WAIT_300" }), null, "a flood halt is not a spike auto-halt");
  const e = describeEvent({ eventType: "account_halt", detail: HALT_DETAIL })!;
  assert(e.danger && e.text.includes("3 of 12") && e.text.includes("25%"), "feed text");
  assert(describeEvent({ eventType: "account_halt", detail: { errorCode: "FLOOD_WAIT_300" } })!.text.includes("FLOOD_WAIT_300"), "other halts still readable");
  const r = describeEvent({ eventType: "control_action", detail: { action: "resume_connection", confirmed: true, before: { pausedReason: "auto_halt_spike:optout_spike" } } })!;
  assert(r.text.includes("resumed") && r.text.includes("auto_halt_spike:optout_spike"), "resume text");
  eq(describeEvent({ eventType: "send_acked", detail: {} }), null, "plain events fall back to raw detail");
  assert(sourceCode("../../../components/mtproto/LiveFeed.tsx").includes("describeEvent"), "live feed uses the formatter");
  assert(sourceCode("../../../app/api/admin/v1/mtproto/events/route.ts").includes("describeEvent"), "events API adds summary");
  assert(sourceCode("../../../app/mtproto-campaign/runs/[id]/page.tsx").includes("HaltPanel"), "run detail renders halts");
});

acheck("L10 audience preview: a paused creator's fans are 'paused: not sent', never eligible, hold-out or counted as excluded", async () => {
  const db = freshDb();
  db.seed("users", [
    ...[1, 2, 3, 4, 5].map((n) => userRow(uid(n))),
    ...[21, 22, 23].map((n) => userRow(uid(n), {}, CLONE_B)),
  ]);
  db.seed("userbot_connections", [
    { clone_id: CLONE_A, status: "connected", paused: false, paused_reason: null, daily_cap: 30 },
    { clone_id: CLONE_B, status: "connected", paused: true, paused_reason: "auto_halt_spike:complaint_spike", daily_cap: 30 },
  ]);
  const p = await computeAudiencePreview({ cloneIds: [CLONE_A, CLONE_B] }, { dailyCap: 30, runCap: null, holdoutPct: 15 });
  eq(p.pausedNotSent, 3, "paused fans not sent");
  eq(p.pausedCreators.length, 1, "one paused creator");
  assert(p.pausedCreators[0].cloneId === CLONE_B && p.pausedCreators[0].autoHalted && p.pausedCreators[0].notSent === 3, "flagged as auto-halted with its fan count");
  eq(p.candidatePool, 5, "pool is the sendable creators only");
  eq(p.eligible + p.excludedTotal, p.candidatePool, "numbers still add up");
  assert(p.sample.every((f) => Number(f.telegramId) < 1020), "no sample fan belongs to the paused creator");
  // a manual pause is also not sent, but not flagged auto-halted
  db.rows("userbot_connections")[1].paused_reason = "manual";
  const m = await computeAudiencePreview({ cloneIds: [CLONE_B] }, { dailyCap: 30, runCap: null, holdoutPct: 15 });
  eq(m.eligible, 0, "nothing eligible for a paused creator");
  eq(m.pausedCreators[0].autoHalted, false, "manual pause distinct");
  // unreadable connections must not fail open
  db.fail("userbot_connections", "select", { message: "conn down" });
  await rejects(computeAudiencePreview({ cloneIds: [CLONE_A] }, { dailyCap: 30, runCap: null, holdoutPct: 15 }), /userbot_connections/);
});

acheck("L11 send plan (cap estimate): a paused creator contributes 0 on day one and to the run total, labelled paused", async () => {
  const db = freshDb();
  const id = await finishedDryRun(db);
  const run = (await getRun(id))!;
  db.seed("userbot_connections", [{ clone_id: CLONE_A, status: "connected", paused: true, paused_reason: "auto_halt_spike:optout_spike", daily_cap: 30 }]);
  const plan = await computeSendPlan({ ...run, dailyCap: 30, runCap: null }, await computeDryRunSummary(id));
  eq(plan.firstDayTotal, 0, "paused: nothing on day one");
  eq(plan.runTotal, 0, "paused: nothing over the run");
  assert(plan.perClone[0].paused && plan.perClone[0].pausedReason === "auto_halt_spike:optout_spike" && plan.perClone[0].wouldSend === 3, "still shows what it would have sent");
  assert(sourceCode("../../../components/mtproto/DryRunReview.tsx").includes("paused: not sent"), "review UI labels it");
});

check("L12 opted-out report: unique contacted fans per creator, opt-outs only from contacted fans, rate never above 100%", () => {
  const eps = [
    ep({ id: "a1", cloneId: CLONE_A, userId: "u1", state: "acked", tgMessageId: 1, sentAt: at(5) }),
    ep({ id: "a2", cloneId: CLONE_A, userId: "u2", state: "replied", tgMessageId: 2, sentAt: at(5) }),
    ep({ id: "a3", cloneId: CLONE_A, userId: "u3", state: "acked", tgMessageId: 3, sentAt: at(5) }),
    ep({ id: "a4", cloneId: CLONE_A, userId: "u4", state: "failed" }),
    ep({ id: "a5", cloneId: CLONE_A, userId: "u5", state: "acked", tgMessageId: 5, sentAt: at(5), dryRun: true }),
    ep({ id: "b1", cloneId: CLONE_B, userId: "u9", state: "acked", tgMessageId: 9, sentAt: at(5) }),
  ];
  const events = [
    { clone_id: CLONE_A, user_id: "u1" }, { clone_id: CLONE_A, user_id: "u1" }, // duplicate counts once
    { clone_id: CLONE_A, user_id: "u4" }, { clone_id: CLONE_A, user_id: "u5" }, // never really contacted: ignored
    { clone_id: CLONE_A, user_id: "zzz" }, { clone_id: CLONE_B, user_id: "u1" }, // other fan / wrong creator
  ];
  const r = optOutReport(eps, events, [{ id: CLONE_A, name: "Alpha" }, { id: CLONE_B, name: "Beta" }]);
  const a = r.perCreator.find((x) => x.cloneId === CLONE_A)!;
  eq(a.contacted, 3, "contacted"); eq(a.optedOut, 1, "opted out"); eq(Math.round((a.rate as number) * 1000), 333, "rate");
  eq(a.cloneName, "Alpha", "name");
  const b = r.perCreator.find((x) => x.cloneId === CLONE_B)!;
  eq(b.optedOut, 0, "beta none");
  eq(r.total.contacted, 4, "total contacted"); eq(r.total.optedOut, 1, "total opt-outs");
  eq(optOutReport([], [], []).total.rate, null, "no sends: rate unknown, not 0%");
});

acheck("L13 opted-out counts read opt_out events (fake db); a failed read is reported as unknown, not zero", async () => {
  const db = freshDb();
  const eps = [
    ep({ id: "a1", userId: "u1", state: "acked", tgMessageId: 1, sentAt: at(5) }),
    ep({ id: "a2", userId: "u2", state: "acked", tgMessageId: 2, sentAt: at(5) }),
  ];
  db.seed("reengage_events", [
    { id: 1, ts: at(4), clone_id: CLONE_A, user_id: "u1", event_type: "opt_out", detail: {} },
    { id: 2, ts: at(4), clone_id: CLONE_A, user_id: "u2", event_type: "fan_replied", detail: {} },
    { id: 3, ts: at(900), clone_id: CLONE_A, user_id: "u2", event_type: "opt_out", detail: {} }, // before the send
  ]);
  const rep = await computeOptOuts(eps, [{ id: CLONE_A, name: "Alpha" }]);
  eq(rep.total.optedOut, 1, "one opt-out"); eq(rep.total.contacted, 2, "two contacted"); eq(rep.total.rate, 0.5, "50%");
  db.fail("reengage_events", "select", { message: "events down" });
  const bad = await computeOptOuts(eps, [{ id: CLONE_A, name: "Alpha" }]);
  assert(bad.error && /events down/.test(bad.error), "error surfaced");
  const card = sourceCode("../../../components/mtproto/FunnelCard.tsx");
  assert(card.includes("Opted out") && card.includes("unknown, not zero"), "funnel card renders opted-out and the unknown state");
  assert(sourceCode("../../../app/mtproto-campaign/runs/[id]/page.tsx").includes("computeOptOuts") && sourceCode("../../../app/mtproto-campaign/page.tsx").includes("computeOptOuts"), "wired on run and overview pages");
});

// ── M. migration 163: a fan is (clone_id, telegram_id), user_id may be NULL ──

acheck("M1 an opt-out whose fan row was DELETED (user_id NULL) still excludes a re-created fan with the same telegram id", async () => {
  const db = freshDb();
  const RECREATED_TG = 2001;
  db.seed("users", [
    userRow(uid(50), { telegram_id: RECREATED_TG }), // re-created: new users.id, same telegram id
    userRow(uid(51), { telegram_id: RECREATED_TG }, CLONE_B), // same telegram id in ANOTHER creator: a different fan
    userRow(uid(52), { telegram_id: 2002 }), // unrelated clean fan
  ]);
  db.seed("reengage_optouts", [{ id: "1", clone_id: CLONE_A, user_id: null, telegram_id: RECREATED_TG }]);
  const p = await computeAudiencePreview({ cloneIds: [CLONE_A, CLONE_B] }, { dailyCap: 30, runCap: null, holdoutPct: 10 });
  eq(p.excluded.opt_out, 1, "exactly the re-created fan in creator A is opted out");
  eq(p.eligible + p.holdout + p.excluded.cap_reached, 2, "creator B's fan with the same telegram id and the unrelated fan stay in the audience");
  eq(p.eligible + p.excludedTotal, p.candidatePool, "numbers still add up");
  // an opt-out is never matched by users.id
  db.seed("reengage_optouts", [{ id: "2", clone_id: CLONE_A, user_id: uid(52), telegram_id: 9999 }]);
  const q = await computeAudiencePreview({ cloneIds: [CLONE_A] }, { dailyCap: 30, runCap: null, holdoutPct: 10 });
  eq(q.excluded.opt_out, 0, "an opt-out is matched by telegram id, not by users.id");
});

acheck("M2 already-contacted works by telegram id, also for an episode whose fan row was deleted, and only for the same silence stretch", async () => {
  const db = freshDb();
  const start = T(100);
  db.seed("users", [
    userRow(uid(60), { telegram_id: 3001, last_message_received: start }), // re-created fan, same silence stretch
    userRow(uid(61), { telegram_id: 3002, last_message_received: T(90) }), // same telegram id as an old episode, but a NEW stretch
    userRow(uid(62), { telegram_id: 3003, last_message_received: start }), // never contacted
  ]);
  db.seed("reengage_episodes", [
    { id: "x1", clone_id: CLONE_A, user_id: null, telegram_id: 3001, dry_run: false, episode_start_inbound_at: start.replace("Z", "+00:00") },
    { id: "x2", clone_id: CLONE_A, user_id: null, telegram_id: 3002, dry_run: false, episode_start_inbound_at: start },
  ]);
  const p = await computeAudiencePreview({ cloneIds: [CLONE_A] }, { dailyCap: 30, runCap: null, holdoutPct: 10 });
  eq(p.excluded.already_contacted, 1, "only the re-created fan of the SAME stretch is already contacted");
  eq(p.eligible + p.holdout, 2, "new stretch and never-contacted fans stay in");
  eq(p.eligible + p.excludedTotal, p.candidatePool, "adds up");
});

acheck("M3 rows with user_id NULL render: sends keep their row with a deleted-fan label, CSV and dry-run sample do not crash or leak a name", async () => {
  const db = freshDb();
  const id = await finishedDryRun(db);
  // fan 1 (Mike Smith) is deleted: the episode survives with user_id NULL
  Object.assign(db.rows("reengage_episodes").find((e) => e.id === "e1")!, { user_id: null });
  db.tables["users"] = db.rows("users").filter((u) => u.id !== uid(1));
  const sum = await computeDryRunSummary(id);
  eq(sum.wouldSendCount, 3, "the deleted fan's would-send still counts");
  assert(sum.sample.some((x) => /^deleted fan/.test(x.who)), `sample labels the deleted fan: ${JSON.stringify(sum.sample)}`);
  assert(!/Mike/i.test(JSON.stringify(sum.sample)), "the deleted fan's name never appears in the sample");
  eq(sum.sample.length, 3, "all three still in the sample");

  const sentAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  const eps = [
    episode({ id: "s1", userId: null, telegramId: 4001, cloneId: CLONE_A, state: "replied", sentAt: sentAgo(30), tgMessageId: 1, ackedText: "hi" }),
    episode({ id: "s2", userId: "user-2", telegramId: 4002, cloneId: CLONE_A, state: "acked", sentAt: sentAgo(30), tgMessageId: 2, ackedText: "hey" }),
  ];
  const rows = await buildSendRows(eps, [{ id: CLONE_A, name: "Alpha", slug: "a", status: "active", businessUsername: null }], { orders: [], truncated: false });
  eq(rows.length, 2, "the deleted fan's send still shows");
  const dr = rows.find((r) => r.episodeId === "s1")!;
  eq(dr.userId, null, "userId stays null");
  assert(/^deleted fan/.test(sendFanLabel(dr)) && sendFanLabel(dr).includes("4001"), "labelled deleted fan, telegram id kept");
  eq(sendFanLabel(rows.find((r) => r.episodeId === "s2")!), "4002", "a live fan shows its telegram id");
  assert(sendsToCsv(rows).includes(",,4001,"), "CSV keeps the row with an empty user_id");
  assert(sourceCode("../../../components/mtproto/SendsTable.tsx").includes("sendFanLabel"), "SendsTable uses the deleted-fan label");

  const read = await listEpisodesForRun(id);
  eq(read.episodes.find((e) => e.id === "e1")!.userId, null, "listEpisodesForRun maps a NULL user_id");
});

check("M4 funnel, lift and opt-out counts add up when user_id is NULL: fans are counted by telegram id", () => {
  const send = (over: Partial<ReengageEpisode>) => ep({ state: "acked", tgMessageId: 5, sentAt: at(30), createdAt: at(40), ...over });
  const eps = [
    send({ id: "n1", userId: null, telegramId: 5001 }), // two DIFFERENT deleted fans must not collapse into one
    send({ id: "n2", userId: null, telegramId: 5002, state: "replied" }),
    send({ id: "n3", userId: null, telegramId: 5003, episodeStartInboundAt: at(600) }), // deleted fan ...
    send({ id: "n4", userId: "u-new", telegramId: 5003, episodeStartInboundAt: at(500) }), // ... re-created, second silence stretch: one fan
    ep({ id: "n5", userId: null, telegramId: 5004, state: "holdout" }),
  ];
  const f = funnelFromEpisodes(eps);
  eq(f.eligible, 5, "eligible = every episode incl. hold-out");
  eq(f.holdout, 1, "holdout");
  eq(f.contacted, 3, "5001, 5002, 5003 (two episodes, one fan); NULL user ids are NOT one fan");
  eq(f.acknowledged, 3, "acknowledged");
  eq(f.replied, 1, "replied");
  assert(f.contacted >= f.acknowledged && f.acknowledged >= f.replied, "funnel still narrows");
  const lift = liftFromData(eps, { orders: [{ userId: "u-new", cloneId: CLONE_A, stars: 100, paidMs: NOWMS - 20 * H }], truncated: false }, NOWMS);
  const w = lift.find((l) => l.windowHours === 24)!;
  eq(w.contacted.fans, 3, "lift counts 3 contacted fans");
  eq(w.contacted.buyers, 1, "only the fan with a real user id can be a buyer; NULL user ids never join purchases");
  eq(w.holdout.fans, 1, "hold-out fan with a NULL user id is still a control fan");
  // the opt-out events have user_id NULL too: tied to the fan through episode_id
  const r = optOutReport(eps, [{ clone_id: CLONE_A, user_id: null, episode_id: "n1" }, { clone_id: CLONE_A, user_id: null, episode_id: null }, { clone_id: CLONE_A, user_id: "u-new", episode_id: null }], [{ id: CLONE_A, name: "Alpha" }]);
  eq(r.total.contacted, 3, "opt-out denominator counts fans by telegram id");
  eq(r.total.optedOut, 2, "n1 via episode_id, 5003 via user_id; the event with neither is ignored, not guessed");
});

// ── N. per-creator LIVE/DRY switch (migration 164) ──────────────────────────
//
// The switch that decides whether real messages reach real fans from ONE
// creator's account. It is an ADDITIONAL gate on top of the run's GO LIVE and
// the worker's REENGAGE_ALLOW_LIVE, never a replacement, and the worker proves
// that half (twin-userbot src/dev/check-clone-live-switch.ts). What is proven
// here is the dashboard half: the default is dry, turning it ON costs a typed
// phrase that names the creator, turning it OFF never does, and every flip is
// an audited config_change.

check("N1 go-live phrase: only 'GO LIVE <name>' or 'GO LIVE <short id>'; bare GO LIVE and the RESUME phrase never pass", () => {
  assert(goLivePhraseOk("GO LIVE Alpha", "Alpha", CLONE_A), "name");
  assert(goLivePhraseOk("  go   live   alpha ", "Alpha", CLONE_A), "case and spacing");
  assert(goLivePhraseOk("GO LIVE aaaaaaaa", "Alpha", CLONE_A), "short id");
  assert(goLivePhraseOk(`GO LIVE ${CLONE_A}`, "Alpha", CLONE_A), "full id");
  for (const bad of ["GO LIVE", "golive", "", "  ", "Alpha", "GO LIVE Beta", "RESUME Alpha", "LIVE Alpha", null, undefined]) {
    assert(!goLivePhraseOk(bad as never, "Alpha", CLONE_A), `must not pass: ${JSON.stringify(bad)}`);
  }
  // The two phrases are not interchangeable in either direction.
  assert(!resumePhraseOk("GO LIVE Alpha", "Alpha", CLONE_A), "the go-live phrase must not resume an auto-halt");
});

acheck("N2 switching a creator to LIVE is REFUSED server-side without the phrase; nothing is written", async () => {
  const db = freshDb();
  await rejects(setConnectionLiveEnabled(CLONE_A, true, "operator"), /Type "GO LIVE Alpha"/);
  await rejects(setConnectionLiveEnabled(CLONE_A, true, "operator", "GO LIVE"), /Type "GO LIVE Alpha"/);
  await rejects(setConnectionLiveEnabled(CLONE_A, true, "operator", "GO LIVE Beta"), /Type "GO LIVE Alpha"/);
  await rejects(setConnectionLiveEnabled(CLONE_A, true, "operator", "RESUME Alpha"), /Type "GO LIVE Alpha"/);
  eq(db.rows("userbot_connections").length, 0, "no row was written at all");
  eq(eventsOf(db, "config_change").length, 0, "no event either");
  await rejects(setConnectionLiveEnabled("not-a-uuid", true, "operator", "GO LIVE Alpha"));
});

acheck("N3 with the phrase it goes live and logs config_change with before/after; going back to DRY needs no phrase", async () => {
  const db = freshDb();
  await setConnectionLiveEnabled(CLONE_A, true, "operator", "  go live   alpha ");
  eq(db.rows("userbot_connections")[0].live_enabled, true, "stored live_enabled");
  const on = eventsOf(db, "config_change").find((e) => e.detail.action === "enable_live_sending");
  assert(on, "enable event written");
  eq(on!.clone_id, CLONE_A, "clone id on the event");
  eq(on!.actor, "operator", "actor");
  eq(on!.detail.before.liveEnabled, false, "before: a creator with no row reads DRY");
  eq(on!.detail.after.liveEnabled, true, "after");
  eq(on!.detail.confirmed, true, "the typed confirmation is recorded");
  eq(on!.detail.confirmText, "go live alpha", "the exact phrase is recorded, normalised");

  // OFF is never gated: going dry must always be one call away.
  await setConnectionLiveEnabled(CLONE_A, false, "operator");
  eq(db.rows("userbot_connections")[0].live_enabled, false, "back to dry");
  const off = eventsOf(db, "config_change").find((e) => e.detail.action === "disable_live_sending");
  assert(off, "disable event written");
  eq(off!.detail.before.liveEnabled, true, "before");
  eq(off!.detail.after.liveEnabled, false, "after");
  eq(off!.detail.confirmed, undefined, "no phrase is recorded for going dry, because none is asked for");
});

acheck("N4 a creator with no connection row reads DRY, and a write / audit failure surfaces loudly", async () => {
  const db = freshDb();
  eq(connectionFor(CLONE_B, await listConnections()).liveEnabled, false, "never connected reads DRY");
  db.seed("userbot_connections", [{ clone_id: CLONE_A, status: "connected", paused: false, paused_reason: null, daily_cap: 30, tg_user_id: 1, dc_id: 1, last_seen_at: null, session_ref: null, created_at: T(1), updated_at: T(1) }]);
  eq(connectionFor(CLONE_A, await listConnections()).liveEnabled, false, "a row from before migration 164 reads DRY, not live");
  db.fail("userbot_connections", "upsert", { message: "nope" });
  await rejects(setConnectionLiveEnabled(CLONE_A, false, "operator"), /could not switch connection to DRY/);
  db.fail("userbot_connections", "upsert", null);
  db.fail("reengage_events", "insert", { message: "events down" });
  await rejects(setConnectionLiveEnabled(CLONE_A, false, "operator"), /WAS switched to DRY, but the audit event failed/);
});

check("N5 the live switch is wired end to end (source): lib gate, server action, UI, and no UI em dash", () => {
  const c = sourceCode("../connections.ts");
  assert(/goLivePhraseOk\(/.test(c), "setConnectionLiveEnabled calls goLivePhraseOk");
  const fn = c.slice(c.indexOf("export async function setConnectionLiveEnabled"));
  assert(fn.indexOf("goLivePhraseOk(") < fn.indexOf('live_enabled: liveEnabled'), "the phrase is checked BEFORE the write");
  const actions = sourceCode("../../../app/mtproto-campaign/actions.ts");
  assert(/setConnectionLiveEnabled\(/.test(actions), "the server action calls the lib function");
  const table = sourceCode("../../../components/mtproto/ConnectionsTable.tsx");
  assert(table.includes("setConnectionLiveEnabledAction"), "the connections UI calls the action");
  assert(table.includes("goLivePhrase"), "the connections UI collects the typed phrase");
  assert(table.includes("LIVE") && table.includes("DRY RUN"), "the UI states which mode the creator is in");
  // UI convention (twin-dashboard/CLAUDE.md): no em dashes anywhere in copy.
  for (const f of ["../../../components/mtproto/ConnectionsTable.tsx", "../../../app/mtproto-campaign/connections/page.tsx"]) {
    assert(!sourceCode(f).includes("\u2014"), `${f} contains an em dash in UI copy`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
for (const c of asyncChecks) {
  try {
    await c.fn();
    passed++;
  } catch (e) {
    failures.push(`${c.name}\n      ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    __setMtDbForTest(null);
  }
}

const total = passed + failures.length;
if (failures.length) {
  console.error(`\n  ${failures.length} of ${total} CHECKS FAILED\n`);
  for (const f of failures) console.error(`  ✗ ${f}\n`);
  process.exit(1);
}
console.log(`\n  ALL ${total} CHECKS PASSED (lib/mtproto)\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
