"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { COVERAGE_LABELS, COVERAGE_SOURCES, COVERAGE_SOURCE_LABELS, SYNC_STATUS_LABELS, type CoverageState, type SyncOperation, type SyncState } from "@/lib/onlyfans/content-sync";
import { connectionHref, syncCall, syncTime } from "@/lib/onlyfans/content-sync-client";
import ContentSyncConflict from "./ContentSyncConflict";

const buttonClass = "min-h-11 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-accent disabled:opacity-50";
const COVERAGE_TONE: Record<CoverageState, string> = {
  current: "border-good/40 text-good", delayed: "border-warn/40 text-warn", partial: "border-warn/40 text-warn",
  not_started: "border-line text-muted", unsupported: "border-line text-muted",
};
const UPLOAD_LABELS = [["draft", "Preparing"], ["queued", "Queued"], ["uploading", "Uploading"], ["verifying", "Checking on OnlyFans"], ["synced", "Media synced to OnlyFans"],
  ["retrying", "Retrying"], ["connectionRequired", "Connection required"], ["needsReview", "Needs review"], ["outcomeUnconfirmed", "Outcome not confirmed"]] as const;
const OPERATION_LABELS: Record<SyncOperation["status"], string> = { queued: "Queued", running: "Checking now", complete: "Check finished", partial: "Check finished, more to check",
  failed: "Check failed", cancelled: "Check cancelled", outcome_unconfirmed: "Outcome not confirmed" };
const BLOCKED_LABELS: Record<string, string> = { auth_required: "Connection required.", binding_changed: "The account connection changed. Turn sync on again.", needs_review: "Needs review." };
type Pending = { path: string; body: unknown; after: "settings" | "sync" };

/** Automatic sync state. A green label here means only that a source was read recently. */
export default function ContentSyncStatus({ accountId, readOnly = false }: { accountId: string; readOnly?: boolean }) {
  const router = useRouter();
  const [sync, setSync] = useState<SyncState | null>(null), [load, setLoad] = useState<"loading" | "ready" | "unavailable" | "denied">("loading");
  const [operation, setOperation] = useState<SyncOperation | null>(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState(""), [retry, setRetry] = useState<Pending | null>(null);
  const [needsConnection, setNeedsConnection] = useState(false);
  const controller = useRef<AbortController | null>(null), submitting = useRef(false);
  const signal = () => controller.current?.signal;

  const readStatus = useCallback(async () => {
    const reply = await syncCall<SyncState>(accountId, "/status", { signal: signal() });
    if (reply.kind === "stale") return;
    if (reply.kind === "denied") { setSync(null); setOperation(null); setLoad("denied"); router.refresh(); return; }
    if (reply.kind === "ok") { setSync(reply.data); setLoad("ready"); return; }
    setLoad(previous => previous === "ready" ? previous : "unavailable");
  }, [accountId, router]);

  useEffect(() => {
    controller.current = new AbortController(); void readStatus();
    const timer = setInterval(() => { if (document.visibilityState === "visible" && !submitting.current) void readStatus(); }, 10_000);
    return () => { clearInterval(timer); controller.current?.abort(); };
  }, [readStatus]);

  useEffect(() => {
    if (!operation || !["queued", "running"].includes(operation.status)) return;
    const timer = setTimeout(async () => {
      const reply = await syncCall<SyncOperation>(accountId, `/operations/${operation.operationId}`, { signal: signal() });
      if (reply.kind === "ok") { setOperation(reply.data); if (!["queued", "running"].includes(reply.data.status)) void readStatus(); }
    }, 3000);
    return () => clearTimeout(timer);
  }, [operation, accountId, readStatus]);

  async function command(pending: Pending) {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setNotice(""); setNeedsConnection(false);
    try {
      const reply = await syncCall(accountId, pending.path, { method: "POST", body: pending.body, signal: signal() });
      if (reply.kind === "stale") return;
      if (reply.kind === "denied") { setSync(null); setLoad("denied"); setRetry(null); router.refresh(); return; }
      if (reply.kind === "unconfirmed") { setRetry(pending); setNotice(reply.error); return; }
      setRetry(null);
      if (reply.kind === "refused") { setNeedsConnection(reply.code === "connection_unavailable"); setNotice(reply.error); void readStatus(); return; }
      if (pending.after === "settings") { setSync(reply.data as SyncState); setNotice("Saved. Automatic sync only reads media and offers into the CRM."); }
      else { setOperation(reply.data as SyncOperation); setNotice(""); void readStatus(); }
    } finally { submitting.current = false; setBusy(false); }
  }
  const toggle = () => sync && void command({ path: "/settings", after: "settings", body: { requestId: crypto.randomUUID(), enabled: !sync.enabled, expectedRevision: sync.revision } });
  const syncNow = () => void command({ path: "/sync", after: "sync", body: { requestId: crypto.randomUUID(), kind: "incremental" } });

  const paused = sync?.status === "paused_auth";
  const running = !!operation && ["queued", "running"].includes(operation.status);
  const uploads = sync ? UPLOAD_LABELS.filter(([key]) => sync.uploads[key] > 0) : [];
  return <section className="mt-4 min-w-0 rounded-xl border border-line p-3" aria-labelledby={`sync-heading-${accountId}`} data-content-sync-status aria-busy={load === "loading" || busy}>
    <h3 id={`sync-heading-${accountId}`} className="font-semibold">Automatic sync</h3>
    {load === "loading" ? <p className="mt-2 text-sm text-muted" role="status">Loading sync status…</p> : null}
    {load === "unavailable" ? <div className="mt-2 text-sm" role="status" data-sync-unavailable>
      <p>Sync status is unavailable right now. Nothing here is confirmed.</p>
      <button type="button" className={`${buttonClass} mt-2`} onClick={() => { setLoad("loading"); void readStatus(); }}>Try again</button></div> : null}
    {load === "denied" ? <p className="mt-2 text-sm" role="status">Your session cannot read sync status. Sign in again.</p> : null}
    {sync && load === "ready" ? <>
      <p className="mt-2 text-sm" data-sync-state={sync.status}>
        <span className="font-semibold">{sync.enabled ? "On" : "Off"}</span>
        {sync.enabled && sync.status !== "active" ? <> · <span className="text-warn" data-sync-attention>{SYNC_STATUS_LABELS[sync.status]}</span></> : null}
        {sync.blockedReason ? <> · {BLOCKED_LABELS[sync.blockedReason] ?? "Needs review."}</> : null}
      </p>
      {paused ? <p className="mt-1 text-sm" data-sync-connection>Automatic checks are paused. <Link className="font-semibold text-accent underline" href={connectionHref(accountId)}>Reconnect this account</Link>, then they resume.</p> : null}
      <dl className="mt-2 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted">Last successful check</dt><dd data-sync-last>{syncTime(sync.lastIncrementalAt, "Not yet")}</dd>
        <dt className="text-muted">Next scheduled pass</dt><dd data-sync-next>{sync.enabled && !paused ? syncTime(sync.nextIncrementalAt, "Not scheduled") : "Not scheduled"}</dd>
        <dt className="text-muted">Last full check</dt><dd>{syncTime(sync.lastFullReconcileAt, "Not yet")}</dd>
        <dt className="text-muted">Still to check</dt><dd data-sync-backlog>{sync.backlog.toLocaleString()}</dd>
        <dt className="text-muted">Initial history</dt>
        <dd data-sync-initial>{!sync.initial ? "Not started" : sync.initial.complete ? `Complete, ${sync.initial.rowsScanned.toLocaleString()} messages checked`
          : ["pending", "queued", "running"].includes(sync.initial.status) ? `In progress, ${sync.initial.rowsScanned.toLocaleString()} messages checked so far`
          : `Stopped after ${sync.initial.rowsScanned.toLocaleString()} messages. Not complete.`}</dd>
      </dl>
      <ul className="mt-3 grid min-w-0 gap-2" aria-label="Sync coverage">
        {COVERAGE_SOURCES.map(source => { const entry = sync.coverage[source];
          return <li key={source} className="min-w-0 rounded-lg border border-line p-2 text-sm" data-sync-coverage={source} data-state={entry.state}>
            <span className="font-semibold">{COVERAGE_SOURCE_LABELS[source]}</span>{" "}
            <span className={`rounded border px-1 text-xs ${COVERAGE_TONE[entry.state]}`}>{COVERAGE_LABELS[entry.state]}</span>
            {entry.state === "unsupported" ? <span className="block text-xs text-muted">Not read yet. This source is not counted as checked.</span> : null}
            {entry.detail ? <span className="block break-words text-xs text-muted">{entry.detail}</span> : null}
            {entry.checkedAt ? <span className="block text-xs text-muted">Checked {syncTime(entry.checkedAt)}</span> : null}
          </li>; })}
      </ul>
      {uploads.length ? <ul className="mt-3 flex flex-wrap gap-2 text-xs" aria-label="Upload counts" data-sync-uploads>
        {uploads.map(([key, label]) => <li key={key} className="rounded border border-line px-2 py-1" data-sync-upload-count={key}>{label}: {sync.uploads[key]}</li>)}</ul> : null}
      {sync.openConflicts > 0 ? <p className="mt-3 text-sm font-semibold text-warn" data-sync-open-conflicts>Needs review: {sync.openConflicts} item{sync.openConflicts === 1 ? "" : "s"} changed on OnlyFans.</p> : null}
      <p className="mt-3 text-xs text-muted">Automatic sync only reads media and paid offers into the CRM. It does not switch items on, message fans or publish posts.</p>
      {readOnly ? <p className="mt-2 text-xs text-muted">Read-only team access</p> : <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={buttonClass} disabled={busy || !!retry} aria-pressed={sync.enabled} data-sync-toggle onClick={toggle}>{sync.enabled ? "Turn off automatic sync" : "Turn on automatic sync"}</button>
        <button type="button" className={buttonClass} disabled={busy || !!retry || !sync.enabled || running} data-sync-now onClick={syncNow}>{running ? "Sync running" : "Sync now"}</button>
        {retry ? <button type="button" className={buttonClass} disabled={busy} data-sync-retry onClick={() => void command(retry)}>Retry the same request</button> : null}
      </div>}
    </> : null}
    {operation ? <p className="mt-2 text-sm" role="status" data-sync-operation={operation.status}>{OPERATION_LABELS[operation.status]}.</p> : null}
    {notice ? <p className="mt-2 text-sm" role="status" data-sync-notice>{notice}{needsConnection ? <> <Link className="font-semibold text-accent underline" href={connectionHref(accountId)}>Reconnect this account</Link></> : null}</p> : null}
    {sync && sync.openConflicts > 0 ? <ContentSyncConflict accountId={accountId} readOnly={readOnly} onResolved={() => { void readStatus(); router.refresh(); }} /> : null}
  </section>;
}
