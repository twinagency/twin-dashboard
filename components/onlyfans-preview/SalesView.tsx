import CreatorPortrait from "./CreatorPortrait";
import { StudioTabs, StudioTabPanel } from "./StudioTabs";
import { formatRecordedMoney, type SalesRead } from "@/lib/onlyfans/workspace";
import { paymentLabel, recordedTime } from "@/lib/onlyfans/overview";

export default function SalesView({ data, creatorName, creatorId }: { data: SalesRead; creatorName: string; creatorId?: string }) {
  const times = data.transactions.map(item => Date.parse(item.occurredAt)).filter(Number.isFinite);
  const range = times.length ? `${recordedTime(new Date(Math.min(...times)).toISOString())} to ${recordedTime(new Date(Math.max(...times)).toISOString())} UTC` : "No records on this page";
  const currencies = [...new Set([...data.transactions.map(item => item.currency), ...data.totals.map(total => total.currency)])].join(", ") || "None recorded";
  const partial = [data.historyRecoveryRequired ? "Payment history for this account is not fully recovered." : "", data.nextCursor ? "More records exist beyond this page." : "", data.lastCompleteSyncAt === null ? "No complete sync has been recorded." : ""].filter(Boolean).join(" ");
  return <div data-of-sales className="of-sales"><StudioTabs label="Sales records" tabs={[{ value: "transactions", label: "Transactions" }, { value: "offers", label: `Open offers (${data.openOfferCount})` }]}>
    <StudioTabPanel value="transactions"><div className="of-panel of-table-panel"><div className="of-section-heading"><h2>Recorded transactions</h2><span className="of-panel-description">{data.transactions.length} records on this page · UTC</span></div>
      <p className="of-panel-description">{creatorName}. Amounts keep their recorded currency and payment status. Currencies are never added together.</p>
      <p className="of-panel-description" data-of-sales-range>Records shown: {range} · Currency: {currencies}</p>
      {partial ? <p className="of-notice" role="status">Partial coverage. {partial} Totals below may be incomplete.</p> : null}
      <div className="of-table-scroll"><table className="of-transaction-table"><thead><tr><th>Date & time (UTC)</th><th>Fan</th><th>Creator</th><th>Type</th><th>Gross amount</th><th>Recorded net</th><th>Status</th></tr></thead><tbody>
        {data.transactions.map(item => <tr key={item.transactionId} data-of-sale={item.transactionId}><td>{recordedTime(item.occurredAt)}</td><td><span className="of-sale-fan"><span aria-hidden="true">{item.fanId ? String(item.fanId).slice(-2) : "?"}</span>{item.fanId ? `Fan ${item.fanId}` : "No fan reference"}</span></td><td><span className="of-sale-creator"><CreatorPortrait creatorId={creatorId ?? ""} name={creatorName} />{creatorName}</span></td><td>{item.kind.replaceAll("_", " ")}</td><td className="of-money">{formatRecordedMoney(item.grossCents, item.currency)}</td><td>{item.netCents === null ? "Not recorded" : formatRecordedMoney(item.netCents, item.currency)}</td><td><span className="of-payment-badge" data-status={item.status}>{paymentLabel(item.status)}</span></td></tr>)}
      </tbody></table></div>{!data.transactions.length ? <p className="of-empty-copy">No transactions are recorded on this page.</p> : null}
    </div>
    <details className="of-panel of-sales-totals"><summary>Recorded totals by currency and status</summary><div className="of-compact-totals">{data.totals.map(total => <div key={`${total.currency}:${total.status}`} data-of-sales-total={`${total.currency}:${total.status}`}><span>{paymentLabel(total.status)} gross</span><strong>{formatRecordedMoney(total.grossCents, total.currency)}</strong><small>{total.count} recorded transactions</small></div>)}{!data.totals.length ? <p className="of-empty-copy">No totals are recorded for this account.</p> : null}</div></details>
    </StudioTabPanel>
    <StudioTabPanel value="offers"><section className="of-panel" data-of-open-offers><h2>Open offers: {data.openOfferCount}</h2><p className="of-panel-description">Recorded offers, not payments. A message reference alone does not confirm delivery.</p>
      {data.openOffers.map(offer => <div className="of-sale-row" key={offer.offerId}><div><strong>Fan {offer.fanId} · {offer.mode}</strong><small>{recordedTime(offer.offeredAt)} UTC · {offer.messageId === null ? "No message reference" : "Message reference recorded"}</small></div><strong>{offer.mode === "ppv" && offer.priceCents > 0 ? formatRecordedMoney(offer.priceCents, offer.currency) : offer.mode === "tip" && offer.tipUnlockCents > 0 ? `Tip threshold: ${formatRecordedMoney(offer.tipUnlockCents, offer.currency)}` : offer.mode === "both" && offer.priceCents > 0 && offer.tipUnlockCents > 0 ? `${formatRecordedMoney(offer.priceCents, offer.currency)} / tip ${formatRecordedMoney(offer.tipUnlockCents, offer.currency)}` : "Review saved terms"}</strong></div>)}
      {!data.openOffers.length ? <p className="of-empty-copy">No open offers recorded on this page.</p> : null}
      {data.moreOpenOffers ? <p className="of-panel-footnote">Showing the latest {data.openOffers.length} of {data.openOfferCount} open offers.</p> : null}
    </section></StudioTabPanel>
  </StudioTabs></div>;
}
