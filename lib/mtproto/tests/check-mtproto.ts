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
import { classifyFan, isHoldout, type CandidateRow, type ClassifyContext } from "../audience";
import { funnelFromEpisodes } from "../episodes";
import { sendsToCsv } from "../sends";
import { validateCreateRunInput, RunValidationError } from "../runs";
import { HARD_MAX_DAILY_CAP, LEGACY_IMPORT_CUTOFF_ISO, MIN_SILENCE_HOURS, PREVIEW_EXCLUSION_REASONS } from "../types";
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
  first_seen_at: "2026-08-15T00:00:00Z", // after the cutoff, not a legacy import
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

check("A10 first_seen_at before the n8n cutover -> legacy_import", () => {
  const before = new Date(new Date(LEGACY_IMPORT_CUTOFF_ISO).getTime() - 86_400_000).toISOString();
  eq(classifyFan({ ...baseRow, first_seen_at: before }, baseCtx), "legacy_import", "verdict");
});

check("A11 first_seen_at after the cutover is NOT legacy_import", () => {
  const after = new Date(new Date(LEGACY_IMPORT_CUTOFF_ISO).getTime() + 86_400_000).toISOString();
  eq(classifyFan({ ...baseRow, first_seen_at: after }, baseCtx), "eligible", "verdict");
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
  const f = funnelFromEpisodes(episodes);
  eq(f.contacted, 3, "contacted");
  eq(f.delivered, 2, "delivered: acked + replied");
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

const validInput = { createdBy: "operator", cloneIds: ["clone-1"], filters: {}, dailyCap: 30, runCap: null, holdoutPct: 15 };

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

check("E4 holdoutPct above 50 is rejected", () => {
  assert(
    (() => {
      try {
        validateCreateRunInput({ ...validInput, holdoutPct: 51 });
        return false;
      } catch {
        return true;
      }
    })(),
    "expected a rejection",
  );
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

// ─────────────────────────────────────────────────────────────────────────────

const total = passed + failures.length;
if (failures.length) {
  console.error(`\n  ${failures.length} of ${total} CHECKS FAILED\n`);
  for (const f of failures) console.error(`  ✗ ${f}\n`);
  process.exit(1);
}
console.log(`\n  ALL ${total} CHECKS PASSED (lib/mtproto)\n`);
