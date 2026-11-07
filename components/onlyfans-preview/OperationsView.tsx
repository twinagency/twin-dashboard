import Link from "next/link";
import { CreatorPlatformHeading } from "./CreatorPlatformPage";
import { Card } from "@/components/ui/card";
import type { OfAccount } from "@/lib/onlyfans-preview/types";
import { OPERATION_REASONS, formatModelUsd, type OperationsSnapshot } from "@/lib/onlyfans/operations";
import { workspaceHref } from "@/lib/onlyfans-preview/scope";
import { GROUP_NEXT, groupReasons, operationRows } from "@/lib/onlyfans/section8";
import EngineUnresolvedPanel from "./EngineUnresolved";
export default function OperationsView({ data, account, accounts, creatorId, canAct = false }: { data: OperationsSnapshot; account: OfAccount; accounts: OfAccount[]; creatorId: string | null; canAct?: boolean }) {
  const description = "Check your connection, message activity and anything that needs attention.";
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
      {accounts.map((item) => <Link key={item.accountId} aria-current={item.accountId === account.accountId ? "page" : undefined}
        className={`rounded-lg border px-3 py-2 text-sm ${item.accountId === account.accountId ? "border-accent text-accent" : "border-line text-muted"}`}
        href={workspaceHref("/onlyfans/operations", { creatorId, accountId: item.accountId })}>{item.binding.creatorName} · @{item.binding.handle}</Link>)}
    </nav>
    <div className="mb-5 rounded-xl border border-line p-4" role="status">
      <p className="font-semibold">{data.providerConnectionVerified ? "Provider connection is verified." : "Provider connection has not been verified."}</p>
      <p className="mt-1 text-sm text-muted">These counters show recorded processing state. Account permissions and delivery holds are checked before every send.</p>
    </div>
    <div className="of-operations-groups">{[{ title: "Processing", values: metrics.slice(0, 4) }, { title: "Delivery", values: metrics.slice(4, 8) }, { title: "Generation", values: metrics.slice(8) }].map(group => <section key={group.title} className="of-panel"><h2>{group.title}</h2><div className="mt-4 grid grid-cols-2 gap-3">{group.values.map(([label, value]) => <Card key={label} className="p-4"><div className="text-xs text-muted">{label}</div><div className="mt-1 font-mono text-2xl font-semibold" data-of-metric={label}>{value}</div></Card>)}</div></section>)}</div>
    <Card className="mt-5 p-4" data-of-readiness-rows>
      <h2 className="font-semibold">Readiness</h2>
      {operationRows(data).map(row => <div key={row.key} className="of-ops-row" data-of-readiness={row.key}>
        <div className="flex flex-wrap justify-between gap-2 text-sm"><strong>{row.title}</strong><span>{row.status}</span></div>
        <p className="text-xs text-muted">Last success: {row.lastSuccess}</p>
        <Link className="text-xs font-semibold text-accent" href={workspaceHref(row.path, { creatorId, accountId: account.accountId })}>{row.action} →</Link>
      </div>)}
    </Card>
    <Card className="mt-5 p-4" data-of-engine-unresolved><EngineUnresolvedPanel key={account.accountId} accountId={account.accountId} canAct={canAct} /></Card>
    <Card className="mt-5 p-4">
      <h2 className="font-semibold">Current holds</h2>
      {data.reasons.length ? <div className="mt-2" data-of-hold-groups>{groupReasons(data.reasons).map(group => <section key={group.key} className="of-ops-row" data-of-hold-group={group.key}>
        <h3 className="text-sm font-semibold">{group.title} <span className="font-mono text-xs text-muted" title="Number of distinct holds in this group.">({group.reasons.length})</span></h3>
        <ul className="list-disc space-y-1 pl-5 text-sm">{group.reasons.map(reason => <li key={reason}>{OPERATION_REASONS[reason as keyof typeof OPERATION_REASONS]}</li>)}</ul>
        <p className="text-xs text-muted" title="The snapshot counts blocked work in total, not per reason.">Affected records: Not reported by reason. Blocked work in total: {data.work.blocked}. Last success: {group.key === "history" ? data.runtime.lastCompleteSyncAt ?? "Not reported" : "Not reported"}.</p>
        <Link className="text-xs font-semibold text-accent" href={workspaceHref(GROUP_NEXT[group.key].path, { creatorId, accountId: account.accountId })}>{GROUP_NEXT[group.key].label} →</Link>
      </section>)}</div> : <p className="mt-2 text-sm text-muted">No processing hold is recorded. {data.providerConnectionVerified ? "A verified connection does not confirm an individual delivery." : "This does not verify the provider connection."}</p>}
      <p className="mt-4 text-sm">Recorded allowance: <strong data-of-cap>{data.policy ? `${data.policy.usedUnits} / ${data.policy.limitUnits}` : "Not configured"}</strong></p>
      <p className="mt-4 text-sm">Model cost and reservations today: <strong className="whitespace-nowrap" data-of-model-cost>{formatModelUsd(data.modelCosts.spentMillicents)}</strong></p>
      <p className="mt-1 text-xs text-muted">Per-provider daily model cap: {data.modelCosts.capPerProviderMillicents === null ? "Not configured" : formatModelUsd(data.modelCosts.capPerProviderMillicents)}. Calls today: {data.modelCosts.calls}. Providers: {data.modelCosts.providers}. Calls with uncertain cost across all days: {data.modelCosts.unresolvedCalls}. Day: {data.modelCosts.day} UTC.</p>
      <p className="mt-2 text-xs text-muted">Oldest waiting work: {data.work.oldestWaitingAgeSeconds === null ? "None" : `${data.work.oldestWaitingAgeSeconds} seconds`}. Last complete history sync: {data.runtime.lastCompleteSyncAt ?? "Not completed"}.</p>
      <p className="mt-1 text-xs text-muted">Status recorded at {data.asOf}.</p>
    </Card>
    <Link href={workspaceHref("/onlyfans/inbox", { creatorId: account.binding.creatorId, accountId: account.accountId })} className="mt-5 inline-block text-sm font-semibold text-accent">Open inbox →</Link>
  </div>;
}
