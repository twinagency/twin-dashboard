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
import { classifyFan, computeAudiencePreview, isHoldout, type CandidateRow, type ClassifyContext } from "../audience";
import { funnelFromEpisodes } from "../episodes";
import { sendsToCsv } from "../sends";
import { validateCreateRunInput, RunValidationError, createDryRun, queueRun, confirmLive, stopRun, getRun, type CreateRunInput } from "../runs";
import { getGlobalStop, setGlobalStop } from "../global-stop";
import { setConnectionDailyCap, setConnectionPaused } from "../connections";
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

function episode(partial: Partial<ReengageEpisode>): ReengageEpisode {
  return {
    id: "ep-1",
    runId: "run-1",
    cloneId: "clone-1",
    userId: "user-1",
    telegramId: 1,
    episodeStartInboundAt: "2026-09-20T00:00:00Z",
    state: "eligible",
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

check("C2 contacted/delivered/replied climb monotonically down the funnel", () => {
  const episodes = [
    episode({ state: "sent", sentAt: "2026-09-21T00:00:00Z" }),
    episode({ state: "acked", sentAt: "2026-09-21T00:00:00Z", tgMessageId: 5 }),
    episode({ state: "replied", sentAt: "2026-09-21T00:00:00Z", tgMessageId: 6 }),
  ];
  const f = funnelFromEpisodes(
    episodes.map((e, i) => ({ ...e, userId: `u${i}`, state: i === 0 ? "acked" : e.state, tgMessageId: i === 0 ? 4 : e.tgMessageId })),
  );
  eq(f.contacted, 3, "contacted: acked + acked + replied (state sent is NOT contacted; the first was rewritten to acked)");
  eq(f.delivered, 3, "delivered: real sends carrying a message id");
  eq(f.replied, 1, "replied");
  assert(f.contacted >= f.delivered && f.delivered >= f.replied, "funnel must narrow, never widen");
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

acheck("H4 confirmLive: needs the typed phrase, a finished dry run, no stop, no global stop; then sets confirm_live_at once", async () => {
  const db = freshDb();
  const run = await createDryRun(RUN_OK);
  await queueRun(run.id, "operator");
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
  db.seed("reengage_optouts", [{ id: "1", clone_id: CLONE_A, user_id: uid(19) }]);
  // stored with a different spelling of the same instant
  db.seed("reengage_episodes", [{ id: "e1", clone_id: CLONE_A, user_id: uid(18), episode_start_inbound_at: contactedStart.replace("Z", "+00:00") }]);

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
    ep({ userId: "dry", state: "acked", sentAt: at(300), tgMessageId: null }),
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
  eq(f.delivered, 1, "a only: real message id");
  eq(f.replied, 1, "a");
  eq(f.holdout, 1, "f");
  assert(f.contacted >= f.delivered && f.delivered >= f.replied, "narrowing");
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

check("J7 column/table/event names used here match migration 158 and twin-userbot contract.ts exactly", () => {
  const mig = readFileSync(fileURLToPath(new URL("../../../../twin-bot/db/migrations/158_reengage_mtproto.sql", import.meta.url)), "utf8");
  const contract = readFileSync(fileURLToPath(new URL("../../../../twin-userbot/src/contract.ts", import.meta.url)), "utf8");
  const listOf = (src: string, name: string) => {
    const m = new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const`).exec(src);
    return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
  };
  const mine = readFileSync(fileURLToPath(new URL("../types.ts", import.meta.url)), "utf8");
  for (const name of ["EPISODE_STATES", "RUN_STATUSES", "EVENT_TYPES", "EXCLUSION_REASONS", "RUN_SEGMENTS", "CONNECTION_STATUSES"]) {
    const a = listOf(mine, name);
    assert(a.length > 0, `${name} not found in types.ts`);
    const b = listOf(contract, name);
    if (b.length) eq(JSON.stringify(a), JSON.stringify(b), `${name} drifted from twin-userbot/src/contract.ts`);
  }
  for (const v of listOf(mine, "EVENT_TYPES")) assert(mig.includes(`'${v}'`), `event type ${v} missing from the migration CHECK`);
  for (const v of listOf(mine, "EPISODE_STATES")) assert(mig.includes(`'${v}'`), `episode state ${v} missing from the migration CHECK`);
  for (const v of listOf(mine, "RUN_STATUSES")) assert(mig.includes(`'${v}'`), `run status ${v} missing from the migration CHECK`);
  for (const col of ["run_id", "clone_id", "user_id", "telegram_id", "episode_start_inbound_at", "tg_message_id", "sent_at", "confirm_live_at", "stop_requested", "holdout_pct", "daily_cap", "run_cap", "paused_reason", "dry_run", "prepared_text", "acked_text", "error_code", "skip_reason"]) {
    assert(new RegExp(`\\b${col}\\b`).test(mig), `column ${col} used by the dashboard is not in migration 158`);
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
