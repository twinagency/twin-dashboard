"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDownLeft, CalendarDays, Check, ChevronLeft, ChevronRight, CreditCard, Plus, RefreshCw, Search, X } from "lucide-react";
import { Field, FieldLabel, selectCls } from "@/components/clone/fields";
import { AUD_PER_USD } from "@/lib/money";
import { type PayoutCurrency, type PayoutRecord, type PayoutSnapshot, type PayoutTotals } from "@/lib/payouts/model";
import styles from "./PayoutDashboard.module.css";

function money(cents: number, currency: PayoutCurrency): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "narrowSymbol", minimumFractionDigits: 2 }).format(cents / 100);
}
function date(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)) : "No payouts yet";
}
function PaidAmount({ totals, currency }: { totals: PayoutTotals; currency: PayoutCurrency }) {
  const other = currency === "USD" ? "AUD" : "USD";
  return <span className={styles.paidAmount}><span>{money(totals[currency], currency)}<small>{currency}</small></span>{totals[other] > 0 && <span className={styles.otherCurrency}>{money(totals[other], other)} {other}</span>}</span>;
}

export default function PayoutDashboard({ audience, brand }: { audience: "admin" | "creator"; brand: PayoutSnapshot["brand"] }) {
  const [snapshot, setSnapshot] = useState<PayoutSnapshot | null>(null);
  const [currency, setCurrency] = useState<PayoutCurrency>("USD");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [historyCreator, setHistoryCreator] = useState("");
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [entryOpen, setEntryOpen] = useState(true);
  const [voiding, setVoiding] = useState<PayoutRecord | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidError, setVoidError] = useState("");
  const [correcting, setCorrecting] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const creatorSelect = useRef<HTMLSelectElement>(null);
  const entry = useRef<HTMLElement>(null);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const inFlight = useRef(false);
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let live = true, busy = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (busy) return;
      busy = true;
      try {
        const params = new URLSearchParams({ page: String(page) });
        if (historyCreator) params.set("cloneId", historyCreator);
        const response = await fetch(`/api/payouts?${params}`, { cache: "no-store", signal: controller.signal });
        if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Your session has expired. Please sign in again.");
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Payouts could not be loaded.");
        if (live) { setSnapshot(result); setError(""); }
      } catch (failure) {
        if (live && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Payouts could not be loaded.");
      } finally { busy = false; }
    };
    refreshRef.current = refresh;
    void refresh();
    const visibleRefresh = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = window.setInterval(visibleRefresh, 5000);
    document.addEventListener("visibilitychange", visibleRefresh);
    window.addEventListener("focus", visibleRefresh);
    return () => { live = false; controller.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", visibleRefresh); window.removeEventListener("focus", visibleRefresh); };
  }, [page, historyCreator]);

  const refresh = useCallback(() => refreshRef.current(), []);
  const creators = snapshot?.creators || [];
  const canManage = audience === "admin" && snapshot?.canManage === true;
  const totalEarned = creators.some(creator => creator.earnedUsdCents == null) ? null : creators.reduce((sum, creator) => sum + (creator.earnedUsdCents || 0), 0);
  const earnedInCurrency = (value: number) => currency === "USD" ? value : Math.round(value * AUD_PER_USD);
  const totalPaid = creators.reduce((totals, creator) => ({ USD: totals.USD + creator.paid.USD, AUD: totals.AUD + creator.paid.AUD }), { USD: 0, AUD: 0 });
  const filtered = creators.filter(creator => creator.name.toLowerCase().includes(search.toLowerCase()));
  const startPayout = (id = "") => {
    setSelected(id); setEntryOpen(true); setFormError(""); setSuccess("");
    window.setTimeout(() => { entry.current?.scrollIntoView({ behavior: "smooth", block: "center" }); creatorSelect.current?.focus({ preventScroll: true }); }, 0);
  };
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || inFlight.current) return;
    inFlight.current = true; setSaving(true); setFormError(""); setSuccess("");
    const fields = new FormData(event.currentTarget);
    const payload = { cloneId: selected, amount: String(fields.get("amount") || ""), currency: String(fields.get("currency") || "USD"), paidOn: String(fields.get("paidOn") || ""), reference: String(fields.get("reference") || ""), method: String(fields.get("method") || "") };
    const fingerprint = JSON.stringify(payload);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    try {
      const response = await fetch("/api/payouts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, requestId: request.current!.id }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The payout could not be saved.");
      form.current?.reset(); setSelected(""); request.current = null; setSuccess("Payout recorded. The creator's payment history will update automatically.");
      await refresh();
    } catch (failure) { setFormError(failure instanceof Error ? failure.message : "The payout could not be saved. Your entry is still in the form."); }
    finally { inFlight.current = false; setSaving(false); }
  }
  async function correct(event: FormEvent) {
    event.preventDefault();
    if (!voiding || correcting) return;
    setCorrecting(true); setVoidError("");
    try {
      const response = await fetch("/api/payouts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: voiding.id, reason: voidReason }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The correction could not be saved.");
      setVoiding(null); setVoidReason(""); await refresh();
    } catch (failure) { setVoidError(failure instanceof Error ? failure.message : "The correction could not be saved."); }
    finally { setCorrecting(false); }
  }

  return <div className={styles.root} data-payout-dashboard={audience} data-payout-brand={brand}>
    <div className={styles.heading}>
      <div><span className={styles.eyebrow}><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m21.6 3.4-3.2 16c-.2 1.1-.9 1.4-1.8.9l-4.9-3.6-2.4 2.3c-.3.3-.6.6-1.2.6l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.3L5.8 13.2l-4.7-1.5c-1-.3-1-1 .2-1.5L19.7 3c.9-.3 1.7.2 1.9.4Z"/></svg>Telegram</span><h1>Withdrawals / Payouts</h1><p>{audience === "admin" ? "Track creator earnings and record payments." : "Your earnings and payment history."}</p></div>
      <div className={styles.headingActions}><label className={styles.currency}><span className={styles.srOnly}>Display currency</span><select value={currency} onChange={event => setCurrency(event.target.value as PayoutCurrency)}><option value="USD">USD</option><option value="AUD">AUD</option></select></label>{canManage ? <button type="button" className={styles.primary} onClick={() => startPayout()}><Plus size={18} />Add payout</button> : snapshot && <span className={styles.live}><i className={error ? styles.offline : undefined}/>{error ? "Update delayed" : "Up to date"}</span>}</div>
    </div>
    {error && <div className={styles.error} role="alert">{error}<button type="button" onClick={() => void refresh()}>Try again</button></div>}
    <section className={styles.totals} aria-label="Earnings and payout totals">
      <article className={styles.totalCard}><span>Total earned</span><strong>{!snapshot ? <span className={styles.skeleton}/> : totalEarned == null ? "Unavailable" : money(earnedInCurrency(totalEarned), currency)}</strong><small>Lifetime {audience === "admin" ? "creator " : ""}earnings{currency === "AUD" ? " · AUD estimate" : ""}</small></article>
      <article className={styles.totalCard}><span>Total paid out</span><strong>{snapshot ? <PaidAmount totals={totalPaid} currency={currency}/> : <span className={styles.skeleton}/>}</strong><small>Recorded payments</small></article>
    </section>

    {audience === "admin" && <section className={styles.panel} aria-labelledby="payout-creators-title"><div className={styles.panelHeading}><h2 id="payout-creators-title">Creators</h2><label className={styles.search}><Search size={16}/><span className={styles.srOnly}>Search creators</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search creators"/></label></div><div className={styles.tableScroll}><table className={styles.creatorTable}><thead><tr><th>Creator</th><th>Total earned</th><th>Total paid out</th><th>Last payout</th>{canManage && <th><span className={styles.srOnly}>Actions</span></th>}</tr></thead><tbody>{!snapshot ? <tr><td colSpan={canManage ? 5 : 4} className={styles.empty}>Loading creators…</td></tr> : filtered.length ? filtered.map((creator, index) => <tr key={creator.id}><td><button type="button" className={styles.creator} onClick={() => { setHistoryCreator(creator.id); setPage(0); document.getElementById("payout-history")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}><span className={styles.avatar} data-tone={index % 3}>{creator.name.trim().split(/\s+/).slice(0,2).map(part => part[0]).join("")}</span><span>{creator.name}</span></button></td><td>{creator.earnedUsdCents == null ? "Unavailable" : money(earnedInCurrency(creator.earnedUsdCents), currency)}</td><td><PaidAmount totals={creator.paid} currency={currency}/></td><td className={styles.date}>{date(creator.lastPaidOn)}</td>{canManage && <td><button type="button" className={styles.outline} onClick={() => startPayout(creator.id)}><Plus size={15}/>Add payout</button></td>}</tr>) : <tr><td colSpan={canManage ? 5 : 4} className={styles.empty}>{search ? "No creators match your search." : "No Telegram creators are connected yet."}</td></tr>}</tbody></table></div></section>}

    {canManage && entryOpen && <section ref={entry} className={`${styles.panel} ${styles.entry}`} aria-labelledby="record-payout-title"><div className={styles.panelHeading}><h2 id="record-payout-title">Record a payout</h2><button type="button" className={styles.iconButton} aria-label="Close payout form" onClick={() => setEntryOpen(false)}><X size={18}/></button></div><form ref={form} onSubmit={save}><fieldset disabled={saving} className={styles.formFields}><label><FieldLabel label="Creator" required/><select ref={creatorSelect} name="cloneId" value={selected} onChange={event => setSelected(event.target.value)} className={selectCls} required><option value="">Choose a creator</option>{creators.map(creator => <option key={creator.id} value={creator.id}>{creator.name}</option>)}</select></label><div className={styles.amountField}><Field label="Amount" name="amount" type="number" placeholder="0.00" min={0.01} max={999999999.99} step={0.01} required/><label><span className={styles.srOnly}>Payment currency</span><select name="currency" defaultValue="USD" className={selectCls}><option>USD</option><option>AUD</option></select></label></div><Field label="Date paid" name="paidOn" type="date" required/><Field label="Reference" name="reference" placeholder="Optional"/></fieldset>{formError && <div role="alert" className={styles.formError}>{formError}</div>}{success && <div role="status" className={styles.success}><Check size={16}/>{success}</div>}<div className={styles.formFooter}><span><CreditCard size={15}/>Record a payment you have already made.</span><button type="submit" disabled={saving || !selected} className={styles.primary}>{saving ? <RefreshCw size={16} className={styles.spin}/> : <Check size={16}/>} {saving ? "Saving…" : "Save payout"}</button></div></form></section>}

    <section id="payout-history" className={styles.panel} aria-labelledby="payout-history-title"><div className={styles.panelHeading}><h2 id="payout-history-title">Payment history</h2>{audience === "admin" ? <label className={styles.historyFilter}><span className={styles.srOnly}>Filter payment history by creator</span><select value={historyCreator} onChange={event => { setHistoryCreator(event.target.value); setPage(0); }}><option value="">All creators</option>{creators.map(creator => <option key={creator.id} value={creator.id}>{creator.name}</option>)}</select></label> : <span className={styles.allTime}>All time</span>}</div><div className={styles.tableScroll}><table><thead><tr><th>Date paid</th>{audience === "admin" && <th>Creator</th>}<th>Amount</th><th>Reference</th><th>Status</th>{canManage && <th><span className={styles.srOnly}>Corrections</span></th>}</tr></thead><tbody>{!snapshot ? <tr><td colSpan={audience === "admin" ? canManage ? 6 : 5 : 4} className={styles.empty}>Loading payment history…</td></tr> : snapshot.history.length ? snapshot.history.map(row => <tr key={row.id}><td className={styles.date}>{date(row.paidOn)}</td>{audience === "admin" && <td>{row.creatorName}</td>}<td className={styles.amount}>{money(row.amountCents, row.currency)}<small>{row.currency}</small></td><td className={styles.reference}>{row.reference || row.method || "No reference"}</td><td><span className={row.voided ? styles.voided : styles.paid}>{row.voided ? "Voided" : "Paid"}</span></td>{canManage && <td>{!row.voided && <button type="button" className={styles.correct} aria-label={`Correct payout for ${row.creatorName} on ${date(row.paidOn)}`} onClick={() => { setVoiding(row); setVoidReason(""); setVoidError(""); }}>Correct</button>}</td>}</tr>) : <tr><td colSpan={audience === "admin" ? canManage ? 6 : 5 : 4}><div className={styles.emptyHistory}><span><ArrowDownLeft size={23}/></span><strong>No payouts recorded yet</strong><p>{audience === "admin" ? "Payments you record will appear here." : "Payments appear here when your team records them."}</p></div></td></tr>}</tbody></table></div>{snapshot && snapshot.historyCount > snapshot.pageSize && <div className={styles.pagination}><span>{page * snapshot.pageSize + 1}–{Math.min((page + 1) * snapshot.pageSize, snapshot.historyCount)} of {snapshot.historyCount}</span><div><button aria-label="Previous payments" type="button" disabled={page === 0} onClick={() => setPage(value => value - 1)}><ChevronLeft size={17}/></button><button aria-label="Next payments" type="button" disabled={(page + 1) * snapshot.pageSize >= snapshot.historyCount} onClick={() => setPage(value => value + 1)}><ChevronRight size={17}/></button></div></div>}{audience === "creator" && !!snapshot?.history.length && <p className={styles.historyHint}>Payments appear here when your team records them.</p>}</section>
    {audience === "creator" && <div className={styles.syncNote}><span><RefreshCw size={24}/></span><div><strong>Your payout history stays in sync</strong><p>New payments appear automatically.</p></div></div>}

    {voiding && <div className={styles.modalBackdrop}><section role="dialog" aria-modal="true" aria-labelledby="correct-payout-title" className={styles.modal}><h2 id="correct-payout-title">Correct payout entry</h2><p>Void this entry to remove it from payout totals. The original record stays in the history. You can then record the correct payment.</p><form onSubmit={correct}><label><FieldLabel label="Reason" required/><input className={selectCls} value={voidReason} onChange={event => setVoidReason(event.target.value)} maxLength={240} required autoFocus/></label>{voidError && <div role="alert" className={styles.formError}>{voidError}</div>}<div className={styles.modalActions}><button type="button" disabled={correcting} className={styles.outline} onClick={() => setVoiding(null)}>Cancel</button><button type="submit" disabled={correcting || !voidReason.trim()} className={styles.primary}>{correcting ? "Saving…" : "Void entry"}</button></div></form></section></div>}
  </div>;
}
