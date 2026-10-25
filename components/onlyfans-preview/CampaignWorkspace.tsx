import Link from "next/link";
import { CreatorPlatformHeading, CreatorPlatformEmpty } from "./CreatorPlatformPage";
import { NextResponse } from "next/server";
import { requireOnlyFansRead, requestId } from "@/lib/onlyfans/route";
import { configuredCampaignBackend } from "@/lib/onlyfans/campaigns-backend";
import { workspaceHref } from "@/lib/onlyfans-preview/scope";
import CampaignManager from "./CampaignManager";

export default async function CampaignWorkspace({ searchParams }: { searchParams: Promise<{ account?: string | string[]; creator?: string | string[] }> }) {
  const description = "Plan a message for your fans and see how it performs.";
  const unavailable = (message: string, connect = false) => <div className="dashboard-page"><CreatorPlatformHeading title="Campaigns" description={description} /><CreatorPlatformEmpty title={connect ? "Start with your creator account." : "Let’s get this ready."} description={message} actionHref={connect ? "/onlyfans/accounts" : undefined} /></div>;
  const ctx = await requireOnlyFansRead({ agency: true }); if (ctx instanceof NextResponse) return unavailable("Sign in to read campaigns.");
  if (!ctx.backend) return unavailable("The OnlyFans backend is not configured.");
  const query = await searchParams;
  const requested = typeof query.account === "string" ? requestId(query.account) : null;
  const creatorId = typeof query.creator === "string" ? requestId(query.creator) : null;
  if ((query.account !== undefined && !requested) || (query.creator !== undefined && !creatorId)) return unavailable("That account reference is invalid.");
  const accounts = await ctx.backend.listAccounts({ creatorId }); if (!accounts.ok) return unavailable(accounts.error);
  const account = requested ? accounts.data.find(item => item.accountId === requested) : accounts.data[0];
  if (!account) return unavailable("Connect an OnlyFans account to plan messages for your fans.", !requested);
  return <div className="dashboard-page min-w-0 text-ink" data-of-campaigns>
    <CreatorPlatformHeading title="Campaigns" description={description} />
    <nav aria-label="Campaign account" className="my-5 flex flex-wrap gap-2">{accounts.data.map(item => <Link key={item.accountId}
      aria-current={item.accountId === account.accountId ? "page" : undefined}
      className={`rounded-lg border px-3 py-2 text-sm ${item.accountId === account.accountId ? "border-accent text-accent" : "border-line text-muted"}`}
      href={workspaceHref("/onlyfans/campaigns", { creatorId, accountId: item.accountId })}>{item.binding.creatorName} · @{item.binding.handle}</Link>)}</nav>
    {configuredCampaignBackend(ctx.fetch) ? <CampaignManager key={account.accountId} accountId={account.accountId} readOnly={!ctx.canManage} /> : <p role="status" className="text-sm text-muted">Campaign management is not configured for this environment.</p>}
    <Link className="mt-6 inline-block text-sm font-semibold text-accent" href={workspaceHref("/onlyfans/inbox", { creatorId, accountId: account.accountId })}>Open inbox →</Link>
  </div>;
}
