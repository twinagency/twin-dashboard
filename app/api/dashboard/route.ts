import { NextRequest, NextResponse } from "next/server";
import { getDashboard, type Period } from "@/lib/dashboard-data";
import { getAnalytics } from "@/lib/analytics-data";

export const dynamic = "force-dynamic";

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

  // Custom range: two epoch-ms timestamps from the calendar picker override any
  // preset period entirely — the chart re-windows to exactly what was picked.
  const startParam = req.nextUrl.searchParams.get("start");
  const endParam = req.nextUrl.searchParams.get("end");
  const startMs = startParam ? Number(startParam) : NaN;
  const endMs = endParam ? Number(endParam) : NaN;
  const range = Number.isFinite(startMs) && Number.isFinite(endMs) ? { startMs, endMs } : undefined;

  const period: Period = range ? "CUSTOM" : VALID.includes(p as Period) ? (p as Period) : "1M";
  try {
    const [dashboard, analytics] = await Promise.all([
      getDashboard(period, range),
      getAnalytics(period, clone, range),
    ]);
    return NextResponse.json({ ...dashboard, analytics });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 500 },
    );
  }
}
