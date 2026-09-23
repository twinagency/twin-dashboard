// lib/mtproto/validate.ts
//
// Server-side input validation for everything a run or a control action takes
// from the outside (form, admin API body). The stored `filters` jsonb is later
// re-read by the worker and interpolated into PostgREST filter strings, so an
// unvalidated value here is an injection vector into the worker's queries, not
// just a bad number. Everything is rebuilt from scratch: unknown keys are
// dropped, never passed through.

import {
  HOLDOUT_MAX_PCT,
  HOLDOUT_MIN_PCT,
  HARD_MAX_DAILY_CAP,
  MAX_MESSAGE_VARIANTS,
  MAX_REENGAGEMENT_MESSAGE_CHARS,
  DEFAULT_REENGAGEMENT_VARIANTS,
  MAX_RUN_CAP,
  RUN_SEGMENTS,
  type RunFilters,
  type RunSegment,
} from "./types";

export class RunValidationError extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

export function requireUuid(v: unknown, what: string): string {
  if (!isUuid(v)) throw new RunValidationError(`${what} must be a valid id`);
  return v.toLowerCase();
}

export function uuidList(v: unknown, what: string, max: number): string[] {
  if (v == null) return [];
  if (!Array.isArray(v)) throw new RunValidationError(`${what} must be a list`);
  if (v.length > max) throw new RunValidationError(`${what} has too many entries (max ${max})`);
  return [...new Set(v.map((x) => requireUuid(x, what)))];
}

function optNumber(v: unknown, what: string, opts: { min: number; max: number; int?: boolean }): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < opts.min || n > opts.max || (opts.int && !Number.isInteger(n))) {
    throw new RunValidationError(`${what} must be ${opts.int ? "a whole number " : "a number "}between ${opts.min} and ${opts.max}`);
  }
  return n;
}

const LANGUAGE = /^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})?$/;

/** Rebuilds a RunFilters from untrusted input. Throws RunValidationError. */
export function sanitizeFilters(raw: unknown, cloneIds: string[]): RunFilters {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const segmentRaw = r.segment ?? "all_silent";
  if (!(RUN_SEGMENTS as readonly string[]).includes(String(segmentRaw))) {
    throw new RunValidationError(`segment must be one of ${RUN_SEGMENTS.join(", ")}`);
  }
  const out: RunFilters = { cloneIds, segment: segmentRaw as RunSegment };
  const minSpend = optNumber(r.minSpendStars, "minSpendStars", { min: 0, max: 10_000_000, int: true });
  const from = optNumber(r.lastActiveFromDays, "lastActiveFromDays", { min: 0, max: 3650 });
  const to = optNumber(r.lastActiveToDays, "lastActiveToDays", { min: 0, max: 3650 });
  if (minSpend !== undefined) out.minSpendStars = minSpend;
  if (from !== undefined) out.lastActiveFromDays = from;
  if (to !== undefined) out.lastActiveToDays = to;
  if (from !== undefined && to !== undefined && to < from) {
    throw new RunValidationError("lastActiveToDays must not be smaller than lastActiveFromDays");
  }
  if (r.language !== undefined && r.language !== null && String(r.language).trim() !== "") {
    const lang = String(r.language).trim();
    if (!LANGUAGE.test(lang)) throw new RunValidationError("language must look like a language code, e.g. en or pt-br");
    out.language = lang;
  }
  if (r.includeLegacy === true || r.includeLegacy === "true") out.includeLegacy = true;
  const exclude = uuidList(r.excludeIds, "excludeIds", 5000);
  if (exclude.length) out.excludeIds = exclude;
  return out;
}

export type Caps = { dailyCap: number; runCap: number | null; holdoutPct: number };

/** The bounds the migration and the policy both promise: daily cap 1-100 whole
 *  numbers, run cap a bounded whole number, hold-out a 10-20% whole number. */
export function validateCaps(c: Caps): void {
  if (!Number.isInteger(c.dailyCap) || c.dailyCap < 1 || c.dailyCap > HARD_MAX_DAILY_CAP) {
    throw new RunValidationError(`dailyCap must be a whole number between 1 and ${HARD_MAX_DAILY_CAP}`);
  }
  if (c.runCap != null && (!Number.isInteger(c.runCap) || c.runCap < 1 || c.runCap > MAX_RUN_CAP)) {
    throw new RunValidationError(`runCap must be a whole number between 1 and ${MAX_RUN_CAP}, or unset`);
  }
  if (!Number.isInteger(c.holdoutPct) || c.holdoutPct < HOLDOUT_MIN_PCT || c.holdoutPct > HOLDOUT_MAX_PCT) {
    throw new RunValidationError(`holdoutPct must be a whole number between ${HOLDOUT_MIN_PCT} and ${HOLDOUT_MAX_PCT}`);
  }
}

/** True when a read failed only because migration 158 is not applied yet. */
export function isMissingTable(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null;
  const msg = String(err?.message ?? e ?? "");
  // A missing COLUMN (42703 / PGRST204) is not a missing table: treating it as
  // one would let a safety read fall back to "empty" (fail open).
  if (err?.code === "42703" || err?.code === "PGRST204" || /column/i.test(msg)) return false;
  return err?.code === "42P01" || err?.code === "PGRST205" || /does not exist|could not find the table|schema cache/i.test(msg);
}


export function sanitizeMessageVariants(raw: unknown): string[] {
  const source = raw == null ? [...DEFAULT_REENGAGEMENT_VARIANTS] : raw;
  if (!Array.isArray(source)) throw new RunValidationError("messageVariants must be a list");
  const cleaned: string[] = [];
  for (const value of source) {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (text.length > MAX_REENGAGEMENT_MESSAGE_CHARS) {
      throw new RunValidationError(`each re-engagement message must be at most ${MAX_REENGAGEMENT_MESSAGE_CHARS} characters`);
    }
    if (!cleaned.includes(text)) cleaned.push(text);
  }
  if (cleaned.length < 1) throw new RunValidationError("add at least one re-engagement message");
  if (cleaned.length > MAX_MESSAGE_VARIANTS) {
    throw new RunValidationError(`messageVariants has too many entries (max ${MAX_MESSAGE_VARIANTS})`);
  }
  return cleaned;
}
