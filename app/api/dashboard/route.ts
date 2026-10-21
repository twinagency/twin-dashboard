import { cloneBotToken } from "@/lib/clone-credentials";
import { dashboardReader } from "@/lib/dashboard-reader";
import { NextRequest, NextResponse } from "next/server";
import { type Period } from "@/lib/dashboard-data";
import { applyCreatorShare, creatorShare } from "@/lib/creator-share";
import { withoutCreatorPurchaseHistory } from "@/lib/creator-dashboard-privacy";
import { getRevenueRollup } from "@/lib/revenue-cache";
import { getStarBalance, type StarBalance } from "@/lib/star-balance";
import { reportDayStartMs, shiftReportDay } from "@/lib/revenue-why-changed";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { isZaneDemo, DEMO_CLONE_ID, creatorDemoQueryIds } from "@/lib/creator-demo-policy";
import { assertCreatorQuery } from "@/lib/creator-dashboard-policy";
import { creatorDemoData } from "@/lib/creator-demo-data";
export const dynamic = "force-dynamic";
async function getScopedBalance(cloneId: string | null): Promise<StarBalance | null> {
  if (!cloneId) return null;
  try { const token = await cloneBotToken(cloneId); if (!token) return null; return await getStarBalance(cloneId, token); } catch { return null; }
}
const VALID: Period[] = ["ALL", "1Y", "6M", "3M", "1M", "2W", "1W", "1D", "CUSTOM"];
async function read(req: NextRequest) {
  const p = req.nextUrl.searchParams.get("period");
  const clone = req.nextUrl.searchParams.get("clone") || null;
  const freshness = req.nextUrl.searchParams.get("fresh");
  const startDate = req.nextUrl.searchParams.get("startDate"), endDate = req.nextUrl.searchParams.get("endDate");
  const startParam = req.nextUrl.searchParams.get("start"), endParam = req.nextUrl.searchParams.get("end");
  let range: { startMs: number; endMs: number } | undefined;
  if (startDate !== null || endDate !== null) {
    if (!startDate || !endDate) return NextResponse.json({ error: "startDate and endDate must both be YYYY-MM-DD dates" }, { status: 400 });
    try {
      const rangeStartMs = reportDayStartMs(startDate), rangeEndMs = reportDayStartMs(shiftReportDay(endDate, 1)) - 1;
      if (rangeEndMs < rangeStartMs) return NextResponse.json({ error: "endDate must not be before startDate" }, { status: 400 });
      range = { startMs: rangeStartMs, endMs: rangeEndMs };
    } catch { return NextResponse.json({ error: "startDate and endDate must be real YYYY-MM-DD dates" }, { status: 400 }); }
  } else {
    const startMs = startParam ? Number(startParam) : NaN, endMs = endParam ? Number(endParam) : NaN;
    range = Number.isFinite(startMs) && Number.isFinite(endMs) ? { startMs, endMs } : undefined;
  }
  const period: Period = range ? "CUSTOM" : VALID.includes(p as Period) ? (p as Period) : "1M";
  try {
    const access = await getDashboardAccess();
    if (isZaneDemo(access)) {
      assertCreatorQuery(req.nextUrl.searchParams, creatorDemoQueryIds("/api/dashboard", access!));
      // Return before live rollups, Telegram reads or shared financial caches.
      return NextResponse.json(withoutCreatorPurchaseHistory(creatorDemoData(period, range), access), { headers: { "Cache-Control": "private, no-store", "X-Data-Mode": "synthetic-demo" } });
    }
    if (clone === DEMO_CLONE_ID) return NextResponse.json({ error: "Demo data is unavailable for this account" }, { status: 403 });
    const [rollup, balance] = await Promise.all([getRevenueRollup(period, clone, range, { awaitFresh: freshness === "1" || freshness === "force", force: freshness === "force", summary: req.nextUrl.searchParams.get("summary") === "1" }), getScopedBalance(clone)]);
    const { dashboard, analytics, cachedAt, ageSeconds, stale } = rollup;
    const outDashboard = req.nextUrl.searchParams.get("summary") === "1"
      ? { ...dashboard, recent: dashboard.recent.filter(row => !clone || row.cloneId === clone).slice(0, 5) }
      : dashboard;
    return NextResponse.json(withoutCreatorPurchaseHistory(applyCreatorShare({ ...outDashboard, analytics, balance, cachedAt, ageSeconds, stale }, creatorShare(access)), access), { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 }); }
}
export const GET = dashboardReader(read);
