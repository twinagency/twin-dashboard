// lib/mtproto/limits.ts
//
// The dashboard-tunable send limits (migration 169/171): one app_settings
// row, key 'mtproto_limits', value a JSON TEXT blob, same mechanism as
// ./global-stop.ts and ./global-live-arm.ts (app_settings.value is `text`,
// not a new table, not a jsonb column). Re-read by the worker on every pass.
//
// Precedence in the worker: DB value > env var > built-in default; any
// missing, unparseable or out-of-range field falls back field-by-field and
// every field is then clamped into the hard range in types.ts no matter
// which layer supplied it (twin-userbot/src/contract.ts resolveMtprotoLimits).
// This module clamps on the way IN too (setMtprotoLimits), so a bad write
// from this dashboard can never reach the DB in the first place, and clamps
// on the way OUT (getMtprotoLimits), so a row written by hand or by an older
// version of this code can never be shown or handed to the worker unclamped.
//
// getMtprotoLimits shows a missing row or bad JSON as the built-in defaults.
// A failed READ is different: readMtprotoLimits throws, and setMtprotoLimits
// refuses to save on it, because the defaults turn warm-up, min gap and the
// day-one cap OFF and a save would write them over the real values.

import { mtDb } from "./db";
import { insertEvent } from "./events";
import { RunValidationError } from "./validate";
import {
  HARD_MAX_FIRST_DAY_MAX_SENDS,
  HARD_MAX_FLOOD_WAIT_MULTIPLIER,
  HARD_MAX_HOURLY_CAP,
  HARD_MAX_JITTER_MS,
  HARD_MAX_DAILY_CAP,
  HARD_MAX_MIN_SEND_GAP_MINUTES,
  HARD_MAX_MIN_SILENCE_HOURS,
  HARD_MAX_WARMUP_HOURS,
  HARD_MIN_DAILY_CAP,
  HARD_MIN_FIRST_DAY_MAX_SENDS,
  HARD_MIN_FLOOD_WAIT_MULTIPLIER,
  HARD_MIN_HOURLY_CAP,
  HARD_MIN_MIN_SEND_GAP_MINUTES,
  HARD_MIN_MIN_SILENCE_HOURS,
  HARD_MIN_WARMUP_HOURS,
  MIN_SEND_SPACING_MS,
  MTPROTO_LIMITS_DEFAULTS,
  MTPROTO_LIMITS_KEY,
  type MtprotoLimits,
} from "./types";

function clampInt(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(v)));
}

function finite(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/** Same clamp the worker applies (contract.ts resolveMtprotoLimits), field by
 *  field: a missing/unparseable field falls back to the built-in default,
 *  then every field is clamped into its hard range regardless of source. */
export function clampMtprotoLimits(raw: unknown): MtprotoLimits {
  const r = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}) as Record<string, unknown>;
  const hourlyCap = clampInt(finite(r.hourlyCap) ?? MTPROTO_LIMITS_DEFAULTS.hourlyCap, HARD_MIN_HOURLY_CAP, HARD_MAX_HOURLY_CAP);
  const defaultDailyCap = clampInt(finite(r.defaultDailyCap) ?? MTPROTO_LIMITS_DEFAULTS.defaultDailyCap, HARD_MIN_DAILY_CAP, HARD_MAX_DAILY_CAP);
  const jitterMinMs = clampInt(finite(r.jitterMinMs) ?? MTPROTO_LIMITS_DEFAULTS.jitterMinMs, MIN_SEND_SPACING_MS, HARD_MAX_JITTER_MS);
  const jitterMaxMs = clampInt(Math.max(finite(r.jitterMaxMs) ?? MTPROTO_LIMITS_DEFAULTS.jitterMaxMs, jitterMinMs), jitterMinMs, HARD_MAX_JITTER_MS);
  const minSilenceHours = clampInt(finite(r.minSilenceHours) ?? MTPROTO_LIMITS_DEFAULTS.minSilenceHours, HARD_MIN_MIN_SILENCE_HOURS, HARD_MAX_MIN_SILENCE_HOURS);
  const floodWaitMultiplier = clampInt(finite(r.floodWaitMultiplier) ?? MTPROTO_LIMITS_DEFAULTS.floodWaitMultiplier, HARD_MIN_FLOOD_WAIT_MULTIPLIER, HARD_MAX_FLOOD_WAIT_MULTIPLIER);
  // 0 is a valid, meaningful value for these three (off, the default) — the
  // shared clampInt still applies since its floor here is 0, so a genuine 0
  // passes straight through unchanged, same as the worker's resolveMtprotoLimits.
  const warmupHours = clampInt(finite(r.warmupHours) ?? MTPROTO_LIMITS_DEFAULTS.warmupHours, HARD_MIN_WARMUP_HOURS, HARD_MAX_WARMUP_HOURS);
  const minSendGapMinutes = clampInt(finite(r.minSendGapMinutes) ?? MTPROTO_LIMITS_DEFAULTS.minSendGapMinutes, HARD_MIN_MIN_SEND_GAP_MINUTES, HARD_MAX_MIN_SEND_GAP_MINUTES);
  const firstDayMaxSends = clampInt(finite(r.firstDayMaxSends) ?? MTPROTO_LIMITS_DEFAULTS.firstDayMaxSends, HARD_MIN_FIRST_DAY_MAX_SENDS, HARD_MAX_FIRST_DAY_MAX_SENDS);
  return { hourlyCap, defaultDailyCap, jitterMinMs, jitterMaxMs, minSilenceHours, floodWaitMultiplier, warmupHours, minSendGapMinutes, firstDayMaxSends };
}

/** Reads the current limits, clamped. A missing row or bad JSON reads as the
 *  built-in defaults; a failed read THROWS (never "defaults" for a row that
 *  may hold real caps). */
export async function readMtprotoLimits(): Promise<MtprotoLimits> {
  const { data, error } = await mtDb().from("app_settings").select("value").eq("key", MTPROTO_LIMITS_KEY).maybeSingle();
  if (error) throw new Error(`could not read the current limits: ${error.message}`);
  if (!data?.value) return { ...MTPROTO_LIMITS_DEFAULTS };
  try {
    return clampMtprotoLimits(JSON.parse(data.value as string));
  } catch {
    return { ...MTPROTO_LIMITS_DEFAULTS };
  }
}

/** Display-only variant: never throws, a failed read shows the defaults. Never
 *  feed it into a save; setMtprotoLimits uses readMtprotoLimits. */
export async function getMtprotoLimits(): Promise<MtprotoLimits> {
  return readMtprotoLimits().catch(() => ({ ...MTPROTO_LIMITS_DEFAULTS }));
}

/** Validates each field is a finite number, clamps into range (never silently
 *  drops an out-of-range value without telling the operator), writes the JSON
 *  blob, and logs a config_change event with before/after. Unlike the global
 *  stop/arm this needs no typed confirmation: every field is already bounded
 *  by a hard safety rail the worker enforces regardless of this write. */
export async function setMtprotoLimits(input: Partial<MtprotoLimits>, actor: string): Promise<MtprotoLimits> {
  let before: MtprotoLimits;
  try {
    before = await readMtprotoLimits();
  } catch (e) {
    throw new Error(`${e instanceof Error ? e.message : e}. Nothing was saved, so the stored limits are unchanged; reload and try again`);
  }
  const merged: Record<string, unknown> = { ...before, ...input };
  for (const [key, min, max] of [
    ["hourlyCap", HARD_MIN_HOURLY_CAP, HARD_MAX_HOURLY_CAP],
    ["defaultDailyCap", HARD_MIN_DAILY_CAP, HARD_MAX_DAILY_CAP],
    ["jitterMinMs", MIN_SEND_SPACING_MS, HARD_MAX_JITTER_MS],
    ["jitterMaxMs", MIN_SEND_SPACING_MS, HARD_MAX_JITTER_MS],
    ["minSilenceHours", HARD_MIN_MIN_SILENCE_HOURS, HARD_MAX_MIN_SILENCE_HOURS],
    ["floodWaitMultiplier", HARD_MIN_FLOOD_WAIT_MULTIPLIER, HARD_MAX_FLOOD_WAIT_MULTIPLIER],
    ["warmupHours", HARD_MIN_WARMUP_HOURS, HARD_MAX_WARMUP_HOURS],
    ["minSendGapMinutes", HARD_MIN_MIN_SEND_GAP_MINUTES, HARD_MAX_MIN_SEND_GAP_MINUTES],
    ["firstDayMaxSends", HARD_MIN_FIRST_DAY_MAX_SENDS, HARD_MAX_FIRST_DAY_MAX_SENDS],
  ] as const) {
    if (input[key] === undefined) continue;
    const n = finite(merged[key]);
    if (n === undefined || !Number.isFinite(n)) throw new RunValidationError(`${key} must be a number`);
    if (n < min || n > max) throw new RunValidationError(`${key} must be between ${min} and ${max}`);
  }
  if (input.jitterMaxMs !== undefined || input.jitterMinMs !== undefined) {
    const jitterMin = finite(merged.jitterMinMs) ?? before.jitterMinMs;
    const jitterMax = finite(merged.jitterMaxMs) ?? before.jitterMaxMs;
    if (jitterMax < jitterMin) throw new RunValidationError("jitterMaxMs must not be smaller than jitterMinMs");
  }
  const after = clampMtprotoLimits(merged);
  const { error } = await mtDb()
    .from("app_settings")
    .upsert({ key: MTPROTO_LIMITS_KEY, value: JSON.stringify(after), updated_at: new Date().toISOString() });
  if (error) throw new Error(`could not save limits: ${error.message}`);
  try {
    await insertEvent({
      runId: null,
      episodeId: null,
      cloneId: null,
      userId: null,
      eventType: "config_change",
      actor,
      detail: { action: "set_mtproto_limits", before, after },
    });
  } catch (e) {
    throw new Error(`limits WERE saved, but the audit event failed: ${e instanceof Error ? e.message : e}`);
  }
  return after;
}
