import { NextResponse } from "next/server";
import { requireOnlyFansRead, requestId } from "@/lib/onlyfans/route";
import { loadOnlyFansOverview } from "@/lib/onlyfans/overview";
import OverviewView from "@/components/onlyfans-preview/OverviewView";
import { CreatorPlatformEmpty, CreatorPlatformHeading } from "@/components/onlyfans-preview/CreatorPlatformPage";

export const dynamic = "force-dynamic";
export default async function OnlyFansOverviewPage({ searchParams }: { searchParams: Promise<{ period?: string | string[]; account?: string | string[]; creator?: string | string[] }> }) {
  const ctx = await requireOnlyFansRead({ agency: true });
  if (ctx instanceof NextResponse) return <div className="dashboard-page"><CreatorPlatformHeading title="Today" description="All your OnlyFans creators: what was earned and what needs attention." /><CreatorPlatformEmpty title="Your workspace is unavailable." description="Your OnlyFans session could not be verified. Sign in again." /></div>;
  const query = await searchParams;
  const accountId = typeof query.account === "string" ? requestId(query.account) : null;
  const creatorId = typeof query.creator === "string" ? requestId(query.creator) : null;
  if ((query.creator !== undefined && !creatorId) || (query.period !== undefined && (typeof query.period !== "string" || !["7d", "30d", "90d", "all"].includes(query.period))) || (query.account !== undefined && !accountId)) return <div className="dashboard-page"><CreatorPlatformEmpty title="Choose a valid account and period." description="Choose Today in the OnlyFans menu to refresh your workspace." /></div>;
  return <OverviewView data={await loadOnlyFansOverview(ctx.backend, query.period === "7d" || query.period === "30d" || query.period === "90d" ? query.period : "all", accountId, new Date(), creatorId)} />;
}
