import EarningsAutoRefresh from "./EarningsAutoRefresh";
import Link from "@/components/NavigationLink";
import { ArrowRight, ArrowUpRight, Banknote, CheckCheck, CircleAlert, RotateCcw, Users, Wallet } from "lucide-react";
import { CreatorPlatformHeading } from "./CreatorPlatformPage";
import CreatorPortrait from "./CreatorPortrait";
import { HealthPill, ModePill } from "./labels";
import { FreshnessLine } from "./PreviewChrome";
import { EARNINGS_REASONS } from "@/lib/onlyfans/earnings";
import { paymentLabel, recordedTime, type OverviewData } from "@/lib/onlyfans/overview";
import { formatRecordedMoney } from "@/lib/onlyfans/workspace";
import { workspaceHref } from "@/lib/onlyfans-preview/scope";

export default function OverviewView({ data }: { data: OverviewData }) {
  const earnings = data.earnings?.status === "current" ? data.earnings : null;
  const recorded = data.earnings?.recorded;
  const history = data.earnings?.history;
  const statistics = data.earnings?.statistics;
  const periodLabel = data.period === "all" ? "All time" : data.period === "90d" ? "Last 90 days" : data.period === "30d" ? "Last 30 days" : "Last 7 days";
  const creatorName = (id: string) => data.accounts.find(a => a.accountId === id)?.binding.creatorName ?? id;
  const money = (value: number | null | undefined) => value == null ? "Unavailable" : formatRecordedMoney(value, "USD");
  const count = (value: number | null | undefined) => value == null ? "Unavailable" : value.toLocaleString("en-US");
  const connected = data.accounts.filter(account => account.health === "connected").length;
  const metrics = [
    { label: "Recorded net earnings", value: money(recorded ? recorded.netCents : earnings?.clearedNetCents), Icon: Wallet, period: true },
    { label: "Recorded gross earnings", value: money(recorded ? recorded.grossCents : earnings?.clearedGrossCents), Icon: Banknote, period: true },
    { label: "Pending net", value: money(recorded?.pendingNetCents), Icon: Wallet, period: true },
    { label: "Pending gross", value: money(recorded?.pendingGrossCents), Icon: Banknote, period: true },
    { label: "Cleared net", value: money(earnings?.clearedNetCents), Icon: Wallet, period: true },
    { label: "Cleared payments", value: count(earnings?.clearedCount), Icon: CheckCheck, period: true },
    { label: "Refunded payments", value: count(earnings?.refundedCount), Icon: RotateCcw, period: true },
    { label: "Connected accounts", value: data.accountsError ? "Unavailable" : count(connected), Icon: Users, period: false },
    { label: "Need attention", value: data.accountsError ? "Unavailable" : count(data.accounts.length - connected), Icon: CircleAlert, period: false },
  ];
  const reasons = data.earnings?.reasons.map(reason => EARNINGS_REASONS[reason]).join(" ") || data.earningsError;
  return <div className="dashboard-page of-overview" data-of-surface="onlyfans-overview">
    <div className="of-page-intro"><CreatorPlatformHeading title="Overview" description="Your OnlyFans creators, earnings and activity." />
      <form className="of-period-form" action="/onlyfans/overview" method="get">
        {data.activityAccount ? <input type="hidden" name="account" value={data.activityAccount.accountId} /> : null}
        <label><span className="sr-only">Reporting period</span><select name="period" defaultValue={data.period}><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option><option value="all">All time</option></select></label>
        <button type="submit" className="of-secondary">Apply / refresh</button>
      </form>
    </div>
    <section className="of-creator-strip" aria-label="OnlyFans accounts">
      <div className="of-creator-strip-items">{data.accounts.slice(0, 8).map(account => <Link key={account.accountId}
        href={`/onlyfans/overview?period=${data.period}&account=${encodeURIComponent(account.accountId)}`} aria-current={data.activityAccount?.accountId === account.accountId ? "true" : undefined}>
        <CreatorPortrait creatorId={account.binding.creatorId} name={account.binding.creatorName} /><span>{account.binding.creatorName}</span>
      </Link>)}{!data.accounts.length ? <p role="status">{data.accountsError || "Your connected OnlyFans creators will appear here."}</p> : null}</div>
      <Link href="/onlyfans/accounts" className="of-text-link">View accounts <ArrowRight size={17} /></Link>
    </section>
    <div className="of-scope-line"><span>Workspace totals · All authorised OnlyFans accounts</span><span>USD · UTC · {periodLabel}</span></div>
    {reasons ? <p className="of-notice" role="status">{recorded ? "Sync delayed. Showing recorded payments; newer activity may be missing. " : ""}{reasons}</p> : null}
    {history ? <div className="of-panel" role="status" aria-label="Payment history import">
      <strong>{history.accountCount === 0 ? "No connected OnlyFans accounts" : history.completedAccountCount === history.accountCount ? "Full payment history imported" : "Importing full payment history"} · {history.completedAccountCount} of {history.accountCount} accounts</strong>
      <p>{history.accounts.map(a => creatorName(a.accountId) + ": " + (a.status === "complete" ? "history imported" : a.status === "held" ? "import needs review" : "importing") + " (" + a.importedPayments.toLocaleString("en-US") + " payments)").join(" · ")}</p>
      <EarningsAutoRefresh />
    </div> : <EarningsAutoRefresh />}
    <section className="of-metrics" aria-label="OnlyFans summary">{metrics.map(({ label, value, Icon, period }) => <article className="of-metric" key={label} data-of-overview-metric={label}>
      <span className="of-metric-label">{label}</span><span className="of-metric-icon"><Icon size={21} /></span><strong>{value}</strong><small>{period ? periodLabel : "Current account state"}</small>
    </article>)}</section>
    {statistics ? <div className="of-overview-panels" aria-label="Earnings breakdown">
      <section className="of-panel"><h2>Earnings by creator</h2>{statistics.byAccount.map(row => <div className="of-sale-row" key={row.accountId}><div><strong>{creatorName(row.accountId)}</strong><small>{count(row.paymentCount)} payments · {periodLabel}</small></div><div><strong>{money(row.netCents)} net</strong><small>{money(row.grossCents)} gross</small></div></div>)}</section>
      <section className="of-panel"><h2>Earnings by source</h2>{statistics.byKind.map(row => <div className="of-sale-row" key={row.kind}><div><strong>{row.kind.replaceAll("_", " ")}</strong><small>{count(row.paymentCount)} payments · {periodLabel}</small></div><div><strong>{money(row.netCents)} net</strong><small>{money(row.grossCents)} gross</small></div></div>)}</section>
    </div> : null}
    <div className="of-overview-panels">
      <section className="of-panel"><div className="of-section-heading"><h2>Account activity</h2><Link href="/onlyfans/accounts" className="of-text-link">View all <ArrowUpRight size={16} /></Link></div>
        {data.accounts.slice(0, 6).map(account => <Link className="of-activity-row" key={account.accountId} href={workspaceHref("/onlyfans/accounts", { creatorId: account.binding.creatorId, accountId: account.accountId })}>
          <CreatorPortrait creatorId={account.binding.creatorId} name={account.binding.creatorName} /><div className="of-activity-name"><strong>{account.binding.creatorName}</strong><small>@{account.binding.handle}</small><FreshnessLine freshness={account.syncFreshness} /></div><div className="of-activity-status"><HealthPill health={account.health} /><ModePill mode={account.automationMode} /></div>
        </Link>)}{!data.accounts.length ? <p className="of-empty-copy">{data.accountsError || "Connect an account to see its activity."}</p> : null}
      </section>
      <section className="of-panel"><div className="of-section-heading"><h2>Recent recorded sales</h2><Link href={data.activityAccount ? workspaceHref("/onlyfans/sales", { accountId: data.activityAccount.accountId, creatorId: data.activityAccount.binding.creatorId }) : "/onlyfans/sales"} className="of-text-link">View sales <ArrowRight size={16} /></Link></div>
        <p className="of-panel-description">{data.activityAccount ? `${data.activityAccount.binding.creatorName} · @${data.activityAccount.binding.handle} · Latest recorded page` : "Account activity"}</p>
        {data.salesError ? <p className="of-empty-copy" role="status">{data.salesError}</p> : data.sales?.transactions.slice(0, 5).map(transaction => <div className="of-sale-row" key={transaction.transactionId}>
          <div><strong>{transaction.kind.replaceAll("_", " ")}</strong><small>{recordedTime(transaction.occurredAt)} UTC · {transaction.fanId ? `Fan ${transaction.fanId}` : "No fan reference"}</small></div><div><strong>{formatRecordedMoney(transaction.grossCents, transaction.currency)}</strong><span className="of-payment-badge" data-status={transaction.status}>{paymentLabel(transaction.status)}</span></div>
        </div>)}{data.sales && !data.sales.transactions.length ? <p className="of-empty-copy">No transactions recorded on this page.</p> : null}
        {data.sales ? <p className="of-panel-footnote">Activity is account-specific and independent of the summary period. {data.sales.nextCursor ? "More records are available in Sales." : ""}</p> : null}
      </section>
    </div>
    <p className="of-panel-footnote">{data.earnings ? `Earnings checked ${recordedTime(data.earnings.asOf)} UTC. ${data.earnings.coveredAccountCount} of ${data.earnings.accountCount} accounts covered.` : "Earnings freshness is unavailable."} Recorded earnings include cleared and pending payments. Refunds, chargebacks and payments with a pending reversal are excluded. Pending earnings are not available to withdraw.{recorded ? ` Last successful payment sync: ${recordedTime(recorded.lastSuccessfulSyncAt)} UTC.` : ""}</p>
  </div>;
}
