import { NextResponse } from "next/server";
import PlanCConsole from "@/components/onlyfans-preview/PlanCConsole";
import { CreatorPlatformEmpty, CreatorPlatformHeading } from "@/components/onlyfans-preview/CreatorPlatformPage";
import { requireOnlyFansRead, requestId } from "@/lib/onlyfans/route";
import { planCOperatorOnly } from "@/lib/onlyfans/plan-c-route";

export const dynamic = "force-dynamic";

/** Plan C supervised approvals. Operator only: agency, view-as and read-only sessions get no controls. */
export default async function PlanCPage({ searchParams }: { searchParams: Promise<{ account?: string | string[] }> }) {
  const description = "Review each drafted reply or offer exactly as it would be sent. Nothing is sent until you approve it.";
  const unavailable = (message: string) => <div className="dashboard-page"><CreatorPlatformHeading title="Plan C approvals" description={description} /><CreatorPlatformEmpty title="Plan C approvals are unavailable." description={message} /></div>;
  const ctx = await requireOnlyFansRead({ agency: false, pilotIdentity: true });
  if (ctx instanceof NextResponse) return unavailable("Your session cannot open this page. Sign in as the operator.");
  if (!planCOperatorOnly(ctx).ok) return unavailable("Plan C approvals are available to the operator only.");
  if (!ctx.backend) return unavailable("The OnlyFans backend is not configured.");
  const requested = await searchParams;
  const accountId = typeof requested.account === "string" ? requestId(requested.account) : null;
  if (requested.account !== undefined && !accountId) return unavailable("That account reference is not valid.");
  const accounts = await ctx.backend.listAccounts({ creatorId: null });
  if (!accounts.ok) return unavailable(accounts.error);
  const account = accountId ? accounts.data.find(item => item.accountId === accountId) : accounts.data[0];
  if (!account) return unavailable(accountId ? "That account is not available to this session." : "Connect an OnlyFans account first.");
  return <div className="dashboard-page">
    <CreatorPlatformHeading title="Plan C approvals" description={description} />
    {accounts.data.length > 1 ? <nav aria-label="Account" className="mb-3 flex flex-wrap gap-2 text-sm">{accounts.data.map(item =>
      <a key={item.accountId} className={item.accountId === account.accountId ? "font-semibold underline" : "underline"} href={`/onlyfans/plan-c?account=${encodeURIComponent(item.accountId)}`}>{item.accountId}</a>)}</nav> : null}
    <p className="mb-3 text-sm text-muted" data-plan-c-account>Account {account.accountId}</p>
    <PlanCConsole accountId={account.accountId} canAct={ctx.canManage} />
  </div>;
}
