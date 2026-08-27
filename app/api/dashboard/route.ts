import { NextRequest, NextResponse } from "next/server";
import { type Period } from "@/lib/dashboard-data";
import { getRevenueRollup } from "@/lib/revenue-cache";
import { getStarBalance, type StarBalance } from "@/lib/star-balance";
import { supabaseAdmin } from "@/lib/supabase";
import { reportDayStartMs, shiftReportDay } from "@/lib/revenue-why-changed";

export const dynamic = "force-dynamic";

// Total/available/pending balance requires a live call to Telegram
// (getMyStarBalance) against ONE bot's token, so it's only computed when the
// page is scoped to a single clone — not summed across the fleet on every
// load. Best-effort: a Telegram hiccup must never break the rest of the page.
async function getScopedBalance(cloneId: string | null): Promise<StarBalance | null> {
  if (!cloneId) return null;
  try {
    const { data: clone } = await supabaseAdmin.from("clones").select("bot_token").eq("id", cloneId).maybeSingle();
    if (!clone?.bot_token) return null;
    return await getStarBalance(cloneId, clone.bot_token);
  } catch {
    return null;
  }
}

const VALID: Period[] = ["ALL", "1Y", "6M", "3M", "1M", "2W", "1W", "1D", "CUSTOM"];

// Single money endpoint — the Revenue page used to split this across
// /api/dashboard (chart + headline) and /api/analytics (deeper cuts, behind an
// "Analytics" tab). Both now render on one page, so both queries run here and
// ship as one payload. `clone` scopes the deeper cuts (analytics) to one clone;
// the chart/headline (dashboard) always carries every clone so the stacked bar
// and per-clone drill-in keep working regardless of scope.
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams.get("period");
  const clone = req.nextUrl.searchParams.get("clone") || null;
  const freshness = req.nextUrl.searchParams.get("fresh");

  // Custom range: the UI sends report-calendar dates so a person in Brisbane
  // does not cut an AEDT day at 1 AM. Epoch-ms bounds remain supported for
  // callers that already use this internal endpoint programmatically.
  const startDate = req.nextUrl.searchParams.get("startDate");
  const endDate = req.nextUrl.searchParams.get("endDate");
  const startParam = req.nextUrl.searchParams.get("start");
  const endParam = req.nextUrl.searchParams.get("end");
  let range: { startMs: number; endMs: number } | undefined;
  if (startDate !== null || endDate !== null) {
    if (!startDate || !endDate) {
      return NextResponse.json({ error: "startDate and endDate must both be YYYY-MM-DD dates" }, { status: 400 });
    }
    try {
      const rangeStartMs = reportDayStartMs(startDate);
      const rangeEndMs = reportDayStartMs(shiftReportDay(endDate, 1)) - 1;
      if (rangeEndMs < rangeStartMs) {
        return NextResponse.json({ error: "endDate must not be before startDate" }, { status: 400 });
      }
      range = {
        startMs: rangeStartMs,
        // getDashboard's existing bounds are inclusive, so preserve the final
        // millisecond of the selected report date.
        endMs: rangeEndMs,
      };
    } catch {
      return NextResponse.json({ error: "startDate and endDate must be real YYYY-MM-DD dates" }, { status: 400 });
    }
  } else {
    const startMs = startParam ? Number(startParam) : NaN;
    const endMs = endParam ? Number(endParam) : NaN;
    range = Number.isFinite(startMs) && Number.isFinite(endMs) ? { startMs, endMs } : undefined;
  }

  const period: Period = range ? "CUSTOM" : VALID.includes(p as Period) ? (p as Period) : "1M";
  try {
    // The rollup has a one-minute single-flight cache because it is expensive
    // across the real fleet; the dashboard waits for an expired entry to refresh.
    // The balance is still a separate best-effort live Telegram call.
    const [rollup, balance] = await Promise.all([
      getRevenueRollup(period, clone, range, {
        // `fresh=1` waits for an expired snapshot to finish refreshing; the
        // dashboard uses it for its once-a-minute update. `force` is the
        // operator's explicit Refresh action, even if the one-minute cache is
        // still warm.
        awaitFresh: freshness === "1" || freshness === "force",
        force: freshness === "force",
      }),
      getScopedBalance(clone),
    ]);
    const { dashboard, analytics, cachedAt, ageSeconds, stale } = rollup;
    return NextResponse.json(
      { ...dashboard, analytics, balance, cachedAt, ageSeconds, stale },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 500 },
    );
  }
}
