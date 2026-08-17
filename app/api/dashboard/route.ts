import { NextRequest, NextResponse } from "next/server";
import { type Period } from "@/lib/dashboard-data";
import { getRevenueRollup } from "@/lib/revenue-cache";
import { getStarBalance, type StarBalance } from "@/lib/star-balance";
import { supabaseAdmin } from "@/lib/supabase";

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

  // Custom range: two epoch-ms timestamps from the calendar picker override any
  // preset period entirely — the chart re-windows to exactly what was picked.
  const startParam = req.nextUrl.searchParams.get("start");
  const endParam = req.nextUrl.searchParams.get("end");
  const startMs = startParam ? Number(startParam) : NaN;
  const endMs = endParam ? Number(endParam) : NaN;
  const range = Number.isFinite(startMs) && Number.isFinite(endMs) ? { startMs, endMs } : undefined;

  const period: Period = range ? "CUSTOM" : VALID.includes(p as Period) ? (p as Period) : "1M";
  try {
    // The rollup is cached (lib/revenue-cache.ts) because it is tens of seconds
    // of Supabase on the real fleet. The balance is not: it is one live Telegram
    // call, it is already best-effort, and it is the only genuinely live number
    // on the page.
    const [rollup, balance] = await Promise.all([
      getRevenueRollup(period, clone, range),
      getScopedBalance(clone),
    ]);
    const { dashboard, analytics, cachedAt, ageSeconds, stale } = rollup;
    return NextResponse.json({ ...dashboard, analytics, balance, cachedAt, ageSeconds, stale });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 500 },
    );
  }
}
