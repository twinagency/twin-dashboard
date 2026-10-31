import EarningsAutoRefresh from "./EarningsAutoRefresh";
import Link from "@/components/NavigationLink";
import { ArrowRight, Banknote, CheckCheck, Wallet } from "lucide-react";
import { CreatorPlatformHeading } from "./CreatorPlatformPage";
import CreatorPortrait from "./CreatorPortrait";
import { recordedTime } from "@/lib/onlyfans/overview";
import type { RevenueData } from "@/lib/onlyfans/revenue";
import { formatRecordedMoney } from "@/lib/onlyfans/workspace";
import { workspaceHref } from "@/lib/onlyfans-preview/scope";

const PERIOD_LABEL = { "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days", all: "All time" } as const;

export default function RevenueView({ data }: { data: RevenueData }) {
  const f = data.figures;
  const currency = data.earnings?.currency ?? "USD";
  const periodLabel = PERIOD_LABEL[data.period];
  const money = (v: number | null | undefined) => v == null ? "Unavailable" : formatRecordedMoney(v, currency);
  const pct = (v: number | null) => v == null ? "–" : `${(v * 100).toFixed(1)}%`;
  const metrics = [
    { label: "Net revenue", value: money(f.netCents), Icon: Wallet },
    { label: "Gross revenue", value: money(f.grossCents), Icon: Banknote },
    { label: "Payments", value: f.paymentCount == null ? "Unavailable" : f.paymentCount.toLocaleString("en-US"), Icon: CheckCheck },
    { label: "Pending net", value: money(f.pendingNetCents), Icon: Wallet },
    { label: "Cleared net", value: money(f.clearedNetCents), Icon: Wallet },
  ];
  const creatorCount = data.creators?.length ?? 0;
  return <div className="dashboard-page of-overview" data-of-surface="onlyfans-revenue">
    <div className="of-page-intro"><CreatorPlatformHeading title="Revenue" description="All your OnlyFans creators: what each one earned and where it came from." />
      <form className="of-period-form" action="/onlyfans/revenue" method="get">
        <label><span className="sr-only">Reporting period</span><select name="period" defaultValue={data.period}>{(Object.keys(PERIOD_LABEL) as (keyof typeof PERIOD_LABEL)[]).map(p => <option key={p} value={p}>{PERIOD_LABEL[p]}</option>)}</select></label>
        <span className="of-panel-description" aria-label="Currency">All amounts in {currency}</span>
        <button type="submit" className="of-secondary">Apply / refresh</button>
      </form>
    </div>
    <div className="of-scope-line"><span>All creators · {data.accounts.length} {data.accounts.length === 1 ? "account" : "accounts"}</span><span>{currency} · UTC · {periodLabel}</span></div>
    {data.accountsError ? <p className="of-notice" role="alert">Could not load creators. {data.accountsError}</p> : null}
    {f.reason ? <p className="of-notice" role="status">{f.netCents !== null ? "Sync delayed. Showing recorded payments; newer activity may be missing. " : ""}{f.reason}</p> : null}
    {f.completeCount !== null ? <p className="of-panel-description" role="status">{f.completeCount} of {f.includedCount} accounts have a complete payment import.</p> : null}
    <EarningsAutoRefresh />
    <section className="of-metrics" aria-label="OnlyFans revenue summary">{metrics.map(({ label, value, Icon }) => <article className="of-metric" key={label} data-of-revenue-metric={label}>
      <span className="of-metric-label">{label}</span><span className="of-metric-icon"><Icon size={21} /></span><strong>{value}</strong><small>{periodLabel}</small>
    </article>)}</section>
    <section className="of-panel" aria-label="Revenue by creator" data-of-revenue-creators>
      <div className="of-section-heading"><h2>Revenue by creator</h2><Link href="/onlyfans/accounts" className="of-text-link">View creators <ArrowRight size={16} /></Link></div>
      <p className="of-panel-description">{creatorCount} {creatorCount === 1 ? "creator" : "creators"} · {periodLabel} · sorted by gross revenue. Select a creator for their detail.</p>
      {data.creators ? <div className="of-table-scroll"><table className="of-transaction-table"><thead><tr><th>Creator</th><th>Payments</th><th>Gross</th><th>Net</th><th>Share of gross</th><th></th></tr></thead><tbody>
        {data.creators.map(c => { const account = data.accounts.find(a => a.binding.creatorId === c.creatorId);
          return <tr key={c.creatorId} data-of-revenue-creator={c.creatorId}>
            <td><span className="of-sale-creator"><CreatorPortrait creatorId={c.creatorId} name={c.name} providerAvatarUrl={account?.creatorProfile?.avatarUrl} /><span><strong>{c.name}</strong><small> {c.handles.map(h => "@" + h).join(", ")}</small></span></span></td>
            <td>{c.paymentCount.toLocaleString("en-US")}</td><td className="of-money">{money(c.grossCents)}</td><td className="of-money">{c.netCents === null ? "Not recorded" : money(c.netCents)}</td><td>{pct(c.share)}</td>
            <td><Link href={workspaceHref("/onlyfans/overview", { creatorId: c.creatorId, accountId: c.accountIds[0] })} className="of-text-link">Detail <ArrowRight size={16} /></Link></td>
          </tr>; })}
        {data.creators.length ? <tr data-of-revenue-total><td><strong>All creators</strong></td><td>{(f.paymentCount ?? 0).toLocaleString("en-US")}</td><td className="of-money"><strong>{money(f.grossCents)}</strong></td><td className="of-money"><strong>{money(f.netCents)}</strong></td><td>100%</td><td></td></tr> : null}
      </tbody></table></div>
        : <p className="of-empty-copy" role="status">{data.accountsError || data.earningsError || f.reason || "Per-creator revenue is unavailable until payment history has synced."}</p>}
      {data.creators && !data.creators.length ? <p className="of-empty-copy" role="status">No creators connected yet.</p> : null}
      {data.unmatched.length ? <p className="of-notice" role="status">{data.unmatched.length} {data.unmatched.length === 1 ? "account has" : "accounts have"} revenue but no matching creator record, so {data.unmatched.length === 1 ? "it is" : "they are"} not listed above.</p> : null}
    </section>
    {f.byKind ? <section className="of-panel" aria-label="Revenue by source" data-of-revenue-sources><h2>Revenue by source</h2>
      {f.byKind.map(row => <div className="of-sale-row" key={row.id}><div><strong>{row.id.replaceAll("_", " ")}</strong><small>{row.paymentCount.toLocaleString("en-US")} payments · {periodLabel}</small></div><div><strong>{money(row.netCents)} net</strong><small>{money(row.grossCents)} gross</small></div></div>)}
    </section> : null}
    <p className="of-panel-footnote">{data.earnings ? `Earnings checked ${recordedTime(data.earnings.asOf)} UTC.` : "Earnings freshness is unavailable."} Recorded revenue includes cleared and pending payments. Refunds, chargebacks and payments with a pending reversal are excluded. Pending earnings are not available to withdraw. Net is shown only when recorded for every included payment. For individual transactions, open <Link href="/onlyfans/sales">Earnings</Link>.</p>
  </div>;
}
