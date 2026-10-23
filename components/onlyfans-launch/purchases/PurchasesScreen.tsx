"use client";
import { useState } from "react";
import { FIXTURES } from "@/lib/onlyfans/launch/a-fixtures";
import { parsePurchases, RESOLUTIONS, type PurchaseItem, type PurchaseKind, type Purchases, type Resolution } from "@/lib/onlyfans/launch/a-types";
import { FixtureBanner, Pending, Section, StateLine, StatusPill, buttonClass, formatCents, postCommand, useCanManage, useLaunchResource, when, type Post } from "../a-shared";

const KIND_LABEL: Record<PurchaseKind, string> = { failed_import: "Failed import", unmatched: "Unmatched purchase", reversal: "Reversal" };
const RES_LABEL: Record<Resolution, string> = { confirmed_owned: "Confirm owned (needs evidence)", not_owned: "Not owned", leave_unmatched: "Leave unmatched" };
const SCAN_LABEL = { complete: "Complete", running: "Running", held: "HELD", never_started: "Never started", unknown: "Unknown" } as const;

function ItemCard({ item, accountId, canManage, live, onChanged }: { item: PurchaseItem; accountId: string; canManage: boolean; live: boolean; onChanged: () => void }) {
  const [resolution, setResolution] = useState<Resolution>("not_owned"), [reason, setReason] = useState(""), [evidenceId, setEvidenceId] = useState("");
  const [busy, setBusy] = useState(false), [result, setResult] = useState<Post | null>(null);
  const can = canManage && live && item.status !== "resolved";
  const needsEvidence = resolution === "confirmed_owned";
  const formOk = reason.trim().length > 0 && (!needsEvidence || evidenceId !== "");
  async function send(command: unknown) {
    if (busy) return; setBusy(true); setResult(null);
    const r = await postCommand(accountId, command); setResult(r); setBusy(false);
    if (r.ok) onChanged();
  }
  const id = `p-${item.id}`;
  return <li data-purchase={item.id} className="rounded-lg border border-line p-3">
    <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-ink">{KIND_LABEL[item.kind]}</span>
      <StatusPill status={item.status === "resolved" ? "ok" : item.status === "retry_queued" ? "warn" : "blocked"} /><span className="text-xs text-muted">{item.status.replace("_", " ")}</span></div>
    <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
      <div><dt className="text-muted">Fan</dt><dd className="text-ink">{item.fanId ?? "not matched to a fan"}</dd></div>
      <div><dt className="text-muted">Message</dt><dd className="text-ink">{item.messageId ?? "not matched to a message"}</dd></div>
      <div><dt className="text-muted">Amount</dt><dd className="text-ink">{formatCents(item.amountCents, item.currency)}</dd></div>
      <div><dt className="text-muted">Why</dt><dd className="text-ink">{item.reason}</dd></div></dl>
    <div className="mt-2 text-xs text-muted">Evidence</div>
    {item.evidence.length ? <ul className="mt-1 space-y-1 text-xs text-ink">{item.evidence.map(e => <li key={e.id}>{e.source}: {e.ref} ({when(e.observedAt)})</li>)}</ul>
      : <p data-launch-state="no-evidence" className="mt-1 text-xs text-[#9b1c31]">No evidence on record. Ownership cannot be confirmed for this item.</p>}
    {item.audit.length ? <><div className="mt-2 text-xs text-muted">Audit</div><ul className="mt-1 space-y-1 text-xs text-ink">{item.audit.map((a, i) => <li key={i}>{when(a.at)} by {a.actor}: {a.resolution.replace("_", " ")}. {a.reason}{a.evidenceId ? ` (evidence ${a.evidenceId})` : ""}</li>)}</ul></> : null}
    {item.status !== "resolved" ? <div className="mt-3 space-y-2 border-t border-line pt-3">
      {!live ? <p className="text-xs text-muted">Sample data: actions are disabled.</p> : !canManage ? <p data-launch-state="readonly" className="text-xs text-muted">Your team access is read-only. Investigation is view-only.</p> : null}
      {item.kind === "failed_import" && item.status === "open" ? <button type="button" className={buttonClass} disabled={!can || busy} aria-describedby={`${id}-note`}
        onClick={() => send({ path: "purchases/retry", id: item.id, body: { expectedRevision: item.revision } })}>Retry import</button> : null}
      <fieldset disabled={!can || busy} className="space-y-2"><legend className="text-xs font-semibold text-ink">Resolve (audited)</legend>
        <label className="block text-xs text-muted" htmlFor={`${id}-res`}>Resolution</label>
        <select id={`${id}-res`} className="min-h-11 w-full rounded-lg border border-line bg-white px-2 text-sm" value={resolution} onChange={e => setResolution(e.target.value as Resolution)}>
          {RESOLUTIONS.map(r => <option key={r} value={r}>{RES_LABEL[r]}</option>)}</select>
        <label className="block text-xs text-muted" htmlFor={`${id}-ev`}>Evidence (only existing records can be cited)</label>
        <select id={`${id}-ev`} className="min-h-11 w-full rounded-lg border border-line bg-white px-2 text-sm" value={evidenceId} onChange={e => setEvidenceId(e.target.value)}>
          <option value="">None</option>{item.evidence.map(e => <option key={e.id} value={e.id}>{e.source}: {e.ref}</option>)}</select>
        {needsEvidence && !item.evidence.length ? <p className="text-xs text-[#9b1c31]">There is no evidence to cite, so ownership cannot be confirmed.</p> : null}
        <label className="block text-xs text-muted" htmlFor={`${id}-why`}>Reason (required, recorded in the audit)</label>
        <textarea id={`${id}-why`} className="min-h-20 w-full rounded-lg border border-line bg-white p-2 text-sm" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} />
        <button type="button" className={buttonClass} disabled={!formOk || busy || !can}
          onClick={() => send({ path: "purchases/resolve", id: item.id, body: { expectedRevision: item.revision, resolution, reason: reason.trim(), evidenceId: evidenceId || null } })}>Record resolution</button></fieldset>
      <p id={`${id}-note`} className="text-xs text-muted">A retry asks the backend to re-read the source. It never creates ownership.</p>
      {result ? <p role="status" data-launch-result={result.ok ? "ok" : result.outcome} className="text-xs text-ink">{result.ok ? "Recorded. Refreshing from the backend." : result.error}</p> : null}
    </div> : null}
  </li>;
}

export default function PurchasesScreen({ accountId }: { accountId: string }) {
  const [fixture, setFixture] = useState(false), [kind, setKind] = useState<PurchaseKind | "all">("all");
  const { state, reload } = useLaunchResource(accountId, "purchases", parsePurchases);
  const canManage = useCanManage(accountId);
  const data: Purchases | null = state.kind === "ok" ? state.data : state.kind === "pending" && fixture ? FIXTURES.purchases : null;
  const live = state.kind === "ok";
  const items = data ? data.items.filter(i => kind === "all" || i.kind === kind) : [];
  return <div className="space-y-4">
    <StateLine state={state} retry={reload} label="purchases" />
    {state.kind === "pending" && !fixture ? <Pending screen="Purchases and ownership" error={state.error} onFixture={() => setFixture(true)}>
      <p className="mt-2 text-xs text-muted">Needs the Chat 1 ledger contract. Until then no purchase, ownership or scan figure is shown as real.</p></Pending> : null}
    {data ? <>
      {!live ? <FixtureBanner what="Purchase ledger sample, shaped from the 23 Oct read-only facts." /> : null}
      <Section title="Ledger scan" id="scan"><div data-scan={data.scan.state} className="text-sm text-ink">State: <strong>{SCAN_LABEL[data.scan.state]}</strong>{data.scan.offset !== null ? ` at offset ${data.scan.offset}` : ""}</div>
        {data.scan.error ? <p className="text-xs text-[#9b1c31]">Error: {data.scan.error}</p> : null}
        <p className="text-xs text-muted">Ownership rows applied: {data.scan.appliedOwnershipRows ?? "unknown"}. Messages marked paid: {data.scan.messagesMarkedPaid ?? "unknown"}.
          {data.scan.state !== "complete" ? " The scan has not completed, so these counts are partial and ownership is incomplete." : ""}</p></Section>
      <Section title="Needs review" id="items">
        <div role="group" aria-label="Filter by kind" className="flex flex-wrap gap-2">{(["all", "failed_import", "unmatched", "reversal"] as const).map(k =>
          <button key={k} type="button" aria-pressed={kind === k} className={`${buttonClass} ${kind === k ? "bg-elev" : ""}`} onClick={() => setKind(k)}>{k === "all" ? "All" : KIND_LABEL[k]}</button>)}</div>
        {items.length ? <ul className="space-y-3">{items.map(i => <ItemCard key={`${accountId}-${i.id}-${i.revision}`} item={i} accountId={accountId} canManage={canManage === true} live={live} onChanged={reload} />)}</ul>
          : <p data-launch-state="empty" className="text-sm text-muted">{data.items.length ? "No items of this kind." : "The backend lists no items needing review. If the scan is not complete this is not proof that everything matched."}</p>}
        {data.nextCursor ? <p className="text-xs text-muted">More items exist beyond this page.</p> : null}
      </Section></> : null}
  </div>;
}
