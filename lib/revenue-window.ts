import { supabaseAdmin } from "./supabase";
import { reportDayStartMs, shiftReportDay } from "./revenue-why-changed";
import { reportInstant } from "./report-time";
import type { DateRange, Period } from "./dashboard-data";

const MS_DAY = 86_400_000;

const PERIOD_DAYS: Record<Period, number | null> = {
  "1D": 1,
  "1W": 7,
  "2W": 14,
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1Y": 365,
  ALL: null,
  CUSTOM: null,
};

/**
 * One window definition for every revenue surface.
 *
 * Multi-day presets are Sydney calendar days, including the current partial
 * day. A report's chart, headline tiles, conversion, and deep analytics must
 * all read this exact same pair of timestamps; otherwise a 1M dashboard can
 * compare calendar-day revenue with a rolling-24-hour audience count.
 */
export function resolvePresetRevenueWindow(
  period: Period,
  nowMs: number,
  explicitRange?: DateRange,
): DateRange | null {
  if (explicitRange) return explicitRange;

  const days = PERIOD_DAYS[period];
  if (days === null) return null;
  if (period === "1D") return { startMs: nowMs - MS_DAY, endMs: nowMs };

  const today = reportInstant(new Date(nowMs)).dayKey;
  return {
    startMs: reportDayStartMs(shiftReportDay(today, -(days - 1))),
    endMs: nowMs,
  };
}

/** Resolve the exact report window, including the one all-time ledger lookup. */
export async function resolveRevenueWindow(
  period: Period,
  explicitRange?: DateRange,
  nowMs = Date.now(),
): Promise<DateRange> {
  const preset = resolvePresetRevenueWindow(period, nowMs, explicitRange);
  if (preset) return preset;
  // Without this, a rangeless CUSTOM fell through to the all-time lookup and was served as ALL.
  if (period === "CUSTOM") throw new Error("A custom revenue window needs a start and an end");

  const { data: earliest, error } = await supabaseAdmin
    .from("star_transactions")
    .select("paid_at")
    .order("paid_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  // A failed lookup must not pass for an empty ledger: that would label a 180-day window as all time.
  if (error) throw new Error("Could not read the earliest payment for the all-time window", { cause: error });

  return {
    startMs: earliest?.paid_at ? new Date(earliest.paid_at).getTime() : nowMs - 180 * MS_DAY,
    endMs: nowMs,
  };
}
