import OperationsView from "@/components/onlyfans-preview/OperationsView";
import { CreatorPlatformHeading, CreatorPlatformEmpty } from "@/components/onlyfans-preview/CreatorPlatformPage";
import { NextResponse } from "next/server";
import { requireOnlyFansRead, requestId } from "@/lib/onlyfans/route";

export const dynamic = "force-dynamic";

export default async function OperationsPage({ searchParams }: { searchParams: Promise<{ account?: string | string[]; creator?: string | string[] }> }) {
  const ctx = await requireOnlyFansRead();
  const description = "Check your connection, message activity and anything that needs attention.";
  const unavailable = (message: string, connect = false) => <div className="dashboard-page"><CreatorPlatformHeading title="Operations" description={description} /><CreatorPlatformEmpty title={connect ? "Your account activity starts here." : "Let’s get this ready."} description={message} actionHref={connect ? "/onlyfans/accounts" : undefined} /></div>;
  if (ctx instanceof NextResponse) return unavailable("Your session cannot read operational status. Sign in again.");
  if (!ctx.backend?.getOperations) return unavailable("Operational status is not configured.");
  const requested = await searchParams;
  const accountId = typeof requested.account === "string" ? requestId(requested.account) : null;
  const creatorId = typeof requested.creator === "string" ? requestId(requested.creator) : null;
  if (requested.account !== undefined && !accountId) return unavailable("That account reference is not valid.");
  if (requested.creator !== undefined && !creatorId) return unavailable("That creator reference is not valid.");
  const accounts = await ctx.backend.listAccounts({ creatorId });
  if (!accounts.ok) return unavailable(accounts.error);
  const account = accountId ? accounts.data.find((item) => item.accountId === accountId) : accounts.data[0];
  if (!account) return unavailable(accountId ? "That account is not available to this session." : "Connect an OnlyFans account to see its activity and connection status.", !accountId);
  const result = await ctx.backend.getOperations(account.accountId);
  if (!result.ok) return unavailable(result.error);
  const data = result.data;
  return <OperationsView data={data} account={account} accounts={accounts.data} creatorId={creatorId} />;
}
