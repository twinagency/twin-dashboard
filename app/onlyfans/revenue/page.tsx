import { NextResponse } from "next/server";
import { requireOnlyFansRead } from "@/lib/onlyfans/route";
import { loadOnlyFansRevenue, REVENUE_PERIODS } from "@/lib/onlyfans/revenue";
import type { OverviewPeriod } from "@/lib/onlyfans/overview";
import RevenueView from "@/components/onlyfans-preview/RevenueView";
import { CreatorPlatformEmpty, CreatorPlatformHeading } from "@/components/onlyfans-preview/CreatorPlatformPage";

export const dynamic = "force-dynamic";
export default async function OnlyFansRevenuePage({ searchParams }: { searchParams: Promise<{ period?: string | string[] }> }) {
  const ctx = await requireOnlyFansRead({ agency: true });
  if (ctx instanceof NextResponse) return <div className="dashboard-page"><CreatorPlatformHeading title="Revenue" description="Revenue across all your OnlyFans creators." /><CreatorPlatformEmpty title="Your workspace is unavailable." description="Your OnlyFans session could not be verified. Sign in again." /></div>;
  const query = await searchParams;
  if (query.period !== undefined && (typeof query.period !== "string" || !(REVENUE_PERIODS as string[]).includes(query.period)))
    return <div className="dashboard-page"><CreatorPlatformEmpty title="Choose a valid period." description="Choose Revenue in the OnlyFans menu to refresh this page." /></div>;
  return <RevenueView data={await loadOnlyFansRevenue(ctx.backend, (query.period as OverviewPeriod | undefined) ?? "30d")} />;
}
