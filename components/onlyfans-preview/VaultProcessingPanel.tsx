"use client";

import { useState } from "react";
import { useVaultProcessing } from "@/lib/onlyfans/use-vault-processing";
import { analysisView, credentialView, importView, processingControls, reasonText, ELIGIBILITY_NOTE, type SyncLite, type Tone } from "@/lib/onlyfans/vault-processing-view";

const buttonClass = "rounded-lg border border-line px-3 py-2 text-sm font-semibold text-accent disabled:opacity-50";
const TONE: Record<Tone, string> = {
  complete: "border-line", progress: "border-line", unknown: "border-line", warning: "border-amber-500/60 bg-amber-500/5", problem: "border-red-500/60 bg-red-500/5",
};
const n = (value: number) => value.toLocaleString("en-US");

/** Per-creator import coverage and description analysis. A window, capped, partial, restarted or unresolved import never reads as complete. */
export default function VaultProcessingPanel({ accountId, readOnly = false, selectedIds = [], sync = null, fetchImpl }: {
  accountId: string; readOnly?: boolean; selectedIds?: readonly string[]; sync?: SyncLite | null; fetchImpl?: typeof fetch;
}) {
  const { status, load, busy, notice, refresh, command } = useVaultProcessing(accountId, { sync, fetchImpl });
  const [confirm, setConfirm] = useState(false);
  const imp = importView(status?.import, sync), analysis = analysisView(status?.analysis, imp.isFull), credential = credentialView(status);
  const controls = processingControls(status, selectedIds, { readOnly, busy });
  const ids = [...selectedIds];
  return <section className="mt-4 min-w-0 rounded-xl border border-line p-4 text-sm" data-vault-processing aria-label="Vault import and description status">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">Import and description status</h3>
      <button type="button" className="of-text-link text-xs" data-vp-refresh disabled={busy} onClick={() => void refresh()}>Refresh status</button>
    </div>
    {load === "denied" ? <p role="status" className="of-notice mt-2" data-vp-denied>Your session cannot manage this vault. Sign in again.</p> : null}
    {load === "loading" ? <p role="status" className="mt-2 text-muted" data-vp-loading>Loading status…</p> : null}
    {load === "unavailable" ? <p role="status" className="of-notice mt-2" data-vp-unavailable>Status could not be read. Nothing below should be taken as complete.</p> : null}
    {load === "ready" && status ? <>
      {credential.blocking ? <div role="alert" className={`mt-3 rounded-lg border p-3 ${TONE[credential.tone]}`} data-vp-credential data-vp-blocking="true">
        <p className="font-semibold">{credential.headline}</p>{credential.detail ? <p className="mt-1 text-xs">{credential.detail}</p> : null}</div> : null}
      {status.paused ? <div role="status" className={`mt-3 rounded-lg border p-3 ${TONE.warning}`} data-vp-paused>
        <p className="font-semibold">Description is paused. No new items are described until you resume.</p>
        {status.pauseReason ? <p className="mt-1 text-xs">{reasonText(status.pauseReason)}</p> : null}</div> : null}

      <div className={`mt-3 rounded-lg border p-3 ${TONE[imp.tone]}`} data-vp-import data-vp-import-state={imp.isFull ? "complete" : imp.stateLabel.toLowerCase().replace(/ /g, "_")} data-vp-full={imp.isFull ? "true" : "false"}>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Import coverage</p>
        <p className="mt-1 font-semibold">{imp.stateLabel}: {imp.headline}</p>
        <p className="mt-1 text-xs" data-vp-scope>{imp.scopeLabel}</p>
        <ul className="mt-2 space-y-1 text-xs" data-vp-import-rows>{imp.rows.map(row => <li key={row.kind} data-vp-import-row={row.kind}>{row.text}</li>)}</ul>
        {imp.reason ? <p className="mt-2 text-xs" data-vp-import-reason>{imp.reason}</p> : null}
        {imp.establishedBy ? <p className="mt-2 text-xs" data-vp-established>{imp.establishedBy}</p> : null}
        {imp.notFullNotice ? <p className="mt-2 text-xs font-semibold" data-vp-not-full>{imp.notFullNotice}</p> : null}
      </div>

      <div className={`mt-3 rounded-lg border p-3 ${TONE[analysis.tone]}`} data-vp-analysis data-vp-analysis-state={analysis.state}>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Analysis</p>
        <p className="mt-1 font-semibold">{analysis.headline}</p>
        {analysis.totals.length ? <p className="mt-1 text-xs" data-vp-analysis-totals>{analysis.totals.map(t => `${t.label} ${n(t.value)}`).join(" · ")}{analysis.skippedOperator ? ` · Skipped by operator ${n(analysis.skippedOperator)}` : ""}</p> : null}
        <ul className="mt-2 space-y-1 text-xs">{analysis.rows.map(row => <li key={row.kind} data-vp-analysis-row={row.kind}>{row.label}: {row.text}</li>)}</ul>
        {analysis.unresolved.length ? <div className="mt-2 text-xs" data-vp-unresolved><p className="font-semibold">Unresolved reasons</p>
          <ul className="mt-1 list-inside list-disc">{analysis.unresolved.map(item => <li key={item.code} data-vp-unresolved-reason={item.code}>{item.label}: {n(item.count)}</li>)}</ul></div> : null}
        {analysis.coverageNote ? <p className="mt-2 text-xs font-semibold" data-vp-analysis-note>{analysis.coverageNote}</p> : null}
        <p className="mt-2 text-xs text-muted" data-vp-eligibility>{ELIGIBILITY_NOTE}</p>
      </div>
      {!credential.blocking && credential.tone === "unknown" ? <p className="mt-2 text-xs text-muted" data-vp-credential>{credential.headline}</p> : null}
      {status.updatedAt ? <p className="mt-2 text-xs text-muted">Status updated {new Date(status.updatedAt).toLocaleString()}.</p> : null}

      {!readOnly ? <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Description controls">
        <button type="button" className={buttonClass} data-vp-control="pause" disabled={!controls.pause.enabled} title={controls.pause.why ?? undefined} onClick={() => void command("pause")}>Pause</button>
        <button type="button" className={buttonClass} data-vp-control="resume" disabled={!controls.resume.enabled} title={controls.resume.why ?? undefined} onClick={() => void command("resume")}>Resume</button>
        <button type="button" className={buttonClass} data-vp-control="retry" disabled={!controls.retry.enabled} title={controls.retry.why ?? undefined} onClick={() => void command("retry")}>Retry unresolved</button>
        <button type="button" className={buttonClass} data-vp-control="redescribe" disabled={!controls.redescribe.enabled} title={controls.redescribe.why ?? undefined} onClick={() => setConfirm(true)}>
          Re-describe selected{ids.length ? ` (${ids.length})` : ""}</button>
      </div> : null}
      {confirm && !readOnly ? <div role="alertdialog" aria-label="Confirm re-describe" className="mt-2 rounded-lg border border-line p-3 text-xs" data-vp-confirm>
        <p>Re-describe {ids.length} selected {ids.length === 1 ? "item" : "items"}? This replaces generated descriptions and uses metered model calls. Prices, approvals and sale permission do not change.</p>
        <div className="mt-2 flex gap-2">
          <button type="button" className={buttonClass} data-vp-confirm-yes disabled={busy || !controls.redescribe.enabled} onClick={() => { setConfirm(false); void command("redescribe", ids); }}>Re-describe</button>
          <button type="button" className={buttonClass} data-vp-confirm-no onClick={() => setConfirm(false)}>Cancel</button>
        </div></div> : null}
    </> : null}
    {notice ? <p role="status" className="mt-2 text-xs" data-vp-notice>{notice}</p> : null}
  </section>;
}
