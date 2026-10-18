import Link from "next/link";
import { CreatorPlatformHeading, CreatorPlatformEmpty } from "@/components/onlyfans-preview/CreatorPlatformPage";
import { NextResponse } from "next/server";
import { Card } from "@/components/ui/card";
import { requireOnlyFansRead, requestId } from "@/lib/onlyfans/route";
import { OPERATION_REASONS, formatModelUsd } from "@/lib/onlyfans/operations";
import { workspaceHref } from "@/lib/onlyfans-preview/scope";

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
  const metrics = [
    ["Waiting work", data.work.waiting], ["Blocked work", data.work.blocked],
    ["Intake backlog", data.intake.pending], ["Conflicting history", data.intake.quarantined],
    ["Queued deliveries", data.delivery.queued], ["In progress", data.delivery.dispatching],
    ["Unknown deliveries", data.delivery.unknown], ["Receipts awaiting history", data.delivery.acceptedAwaitingProjection],
    ["Reply drafts ready", data.planning.ready], ["Generation needs review", data.planning.unknown],
  ] as const;
  return <div className="dashboard-page text-ink" data-of-surface="onlyfans-operations">
    <CreatorPlatformHeading title="Operations" description={description} />
    <nav aria-label="OnlyFans operational account" className="my-5 flex flex-wrap gap-2">
      {accounts.data.map((item) => <Link key={item.accountId} aria-current={item.accountId === account.accountId ? "page" : undefined}
        className={`rounded-lg border px-3 py-2 text-sm ${item.accountId === account.accountId ? "border-accent text-accent" : "border-line text-muted"}`}
        href={workspaceHref("/onlyfans/operations", { creatorId, accountId: item.accountId })}>{item.binding.creatorName} · @{item.binding.handle}</Link>)}
    </nav>
    <div className="mb-5 rounded-xl border border-line p-4" role="status">
      <p className="font-semibold">{data.providerConnectionVerified ? "Provider connection is verified." : "Provider connection has not been verified."}</p>
      <p className="mt-1 text-sm text-muted">These counters show recorded processing state. Account permissions and delivery holds are checked before every send.</p>
    </div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{metrics.map(([label, value]) => <Card key={label} className="p-4"><div className="text-xs text-muted">{label}</div><div className="mt-1 font-mono text-2xl font-semibold" data-of-metric={label}>{value}</div></Card>)}</div>
    <Card className="mt-5 p-4">
      <h2 className="font-semibold">Current holds</h2>
      {data.reasons.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{data.reasons.map((reason) => <li key={reason}>{OPERATION_REASONS[reason]}</li>)}</ul> : <p className="mt-2 text-sm text-muted">No processing hold is recorded. {data.providerConnectionVerified ? "A verified connection does not confirm an individual delivery." : "This does not verify the provider connection."}</p>}
      <p className="mt-4 text-sm">Recorded allowance: <strong data-of-cap>{data.policy ? `${data.policy.usedUnits} / ${data.policy.limitUnits}` : "Not configured"}</strong></p>
      <p className="mt-4 text-sm">Model cost and reservations today: <strong className="whitespace-nowrap" data-of-model-cost>{formatModelUsd(data.modelCosts.spentMillicents)}</strong></p>
      <p className="mt-1 text-xs text-muted">Per-provider daily model cap: {data.modelCosts.capPerProviderMillicents === null ? "Not configured" : formatModelUsd(data.modelCosts.capPerProviderMillicents)}. Calls today: {data.modelCosts.calls}. Providers: {data.modelCosts.providers}. Calls with uncertain cost across all days: {data.modelCosts.unresolvedCalls}. Day: {data.modelCosts.day} UTC.</p>
      <p className="mt-2 text-xs text-muted">Oldest waiting work: {data.work.oldestWaitingAgeSeconds === null ? "None" : `${data.work.oldestWaitingAgeSeconds} seconds`}. Last complete history sync: {data.runtime.lastCompleteSyncAt ?? "Not completed"}.</p>
      <p className="mt-1 text-xs text-muted">Status recorded at {data.asOf}.</p>
    </Card>
    <Link href={workspaceHref("/onlyfans/inbox", { creatorId: account.binding.creatorId, accountId: account.accountId })} className="mt-5 inline-block text-sm font-semibold text-accent">Open inbox →</Link>
  </div>;
}
