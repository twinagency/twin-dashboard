import { NextResponse } from "next/server";
import { requireOnlyFansRead, requestId } from "@/lib/onlyfans/route";
import { loadOnlyFansOverview } from "@/lib/onlyfans/overview";
import OverviewView from "@/components/onlyfans-preview/OverviewView";
import { CreatorPlatformEmpty, CreatorPlatformHeading } from "@/components/onlyfans-preview/CreatorPlatformPage";

export const dynamic = "force-dynamic";
export default async function OnlyFansOverviewPage({ searchParams }: { searchParams: Promise<{ period?: string | string[]; account?: string | string[] }> }) {
  const ctx = await requireOnlyFansRead({ agency: true });
  if (ctx instanceof NextResponse) return <div className="dashboard-page"><CreatorPlatformHeading title="Overview" description="Your OnlyFans creators, earnings and activity." /><CreatorPlatformEmpty title="Your workspace is unavailable." description="Your OnlyFans session could not be verified. Sign in again." /></div>;
  const query = await searchParams;
  const accountId = typeof query.account === "string" ? requestId(query.account) : null;
  if ((query.period !== undefined && (typeof query.period !== "string" || !["7d", "30d"].includes(query.period))) || (query.account !== undefined && !accountId)) return <div className="dashboard-page"><CreatorPlatformEmpty title="Choose a valid account and period." description="Choose Overview in the OnlyFans menu to refresh your workspace." /></div>;
  return <OverviewView data={await loadOnlyFansOverview(ctx.backend, query.period === "30d" ? "30d" : "7d", accountId)} />;
}
