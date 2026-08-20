// ── The clock the revenue report is drawn on ─────────────────────────────────
//
// Every "peak hour", "best day" and daily bar on the Revenue page used to be
// computed with `new Date(paid_at).getHours()` / `.getDay()` / `.getFullYear()`,
// which reads the clock of whatever machine happens to be running the code. The
// comment beside it said "(local)". It was not local to anyone: the dashboard
// runs in a container with no TZ set, so V8 falls back to UTC.
//
// On AEST that is ten hours out, and the error is not cosmetic:
//
//   - "Peak hour 3 AM" is really 1 PM. Read literally it says the fans are
//     insomniacs; the truth is they buy over lunch.
//   - A sale at 9 PM Sydney is 11 AM UTC the SAME day, but a sale at 11 AM
//     Sydney is midnight UTC the PREVIOUS day. So late-evening sales — the
//     busiest part of the day — were being filed under the wrong weekday, and
//     "best day: Tuesday" could be Monday's takings.
//
// Fixing it needs a zone, and there is no operator-timezone setting in this
// database. `clones.timezone` exists but is HERS, the persona's, and there are
// ten of them, so it cannot answer "when do MY fans buy" for the fleet view.
// Rather than invent a config column nobody asked for, the zone is a constant
// with an env override, and — the part that actually matters — the UI prints
// the zone next to the number. A stated zone is a fact an operator can check.
// An unstated one is the bug above, silently.
//
// NEXT_PUBLIC_ prefix is load-bearing, not decoration. analytics-data.ts buckets
// the hours on the server; RevenueDashboard.tsx ("use client") prints the zone
// label beside them in the browser. A bare `process.env.REPORT_TIMEZONE` is
// inlined only in the server bundle and reads `undefined` in the client one, so
// setting it would have the server bucket in one zone while the browser labelled
// the result with another. NEXT_PUBLIC_ is inlined into both at build time.
export const REPORT_TZ = process.env.NEXT_PUBLIC_REPORT_TIMEZONE || "Australia/Sydney";

// Intl gives the only correct answer here. Manual offset arithmetic gets DST
// wrong twice a year and this data spans October, when Sydney jumps to +11.
const parts = new Intl.DateTimeFormat("en-CA", {
  timeZone: REPORT_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  weekday: "short",
});

const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export type ReportInstant = {
  /** `YYYY-MM-DD` in REPORT_TZ. The key the daily chart buckets on. */
  dayKey: string;
  /** 0-23 in REPORT_TZ. */
  hour: number;
  /** 0-6, Sunday = 0, matching Date#getDay so existing label arrays still line up. */
  dow: number;
};

// `hour: "2-digit"` with hour12:false emits "24" for midnight on some ICU
// builds and "00" on others. Unhandled, "24" writes past the end of the
// 24-slot hourStars array and the midnight hour vanishes from the chart with
// no error at all.
//
// Exported, and separate from reportInstant, ON PURPOSE. This machine's ICU
// returns "00", so a test that goes through reportInstant cannot exercise the
// wrap at all — deleting the `% 24` left every assertion green. A check that
// cannot fail on the machine running it is not a check, so the normalisation
// is a pure function fed a raw string instead.
export function normaliseHour(raw: string | number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return ((n % 24) + 24) % 24;
}

export function reportInstant(iso: string | Date): ReportInstant {
  const d = iso instanceof Date ? iso : new Date(iso);
  const f: Record<string, string> = {};
  for (const p of parts.formatToParts(d)) f[p.type] = p.value;
  return {
    dayKey: `${f.year}-${f.month}-${f.day}`,
    hour: normaliseHour(f.hour),
    dow: DOW[f.weekday] ?? 0,
  };
}

// Short zone label for the UI, e.g. "AEST" / "AEDT". Printed beside peak hour
// and best day so the number is never again a mystery measurement.
export function reportTzLabel(at: Date = new Date()): string {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: REPORT_TZ, timeZoneName: "short" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value;
  // Zones without an abbreviation format as "GMT+11"; that is still a usable
  // label, so it is returned as-is rather than swallowed.
  return name || REPORT_TZ;
}
