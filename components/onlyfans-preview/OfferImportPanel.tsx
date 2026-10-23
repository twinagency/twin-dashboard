"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { inputCls } from "@/components/clone/fields";
import { MAX_DRAFTS, MAX_REFRESH_SOURCES, REASON_LABELS, STATUS_LABELS, usd,
  type CandidateDetail, type CandidateSummary, type DraftInput, type DraftResult, type ImportJob, type Observation } from "@/lib/onlyfans/offer-import";

const buttonClass = "min-h-11 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-accent disabled:opacity-50";
const inputClass = `${inputCls} mt-1 disabled:opacity-50`;
type Pending = { path: string; body: unknown };
type Reviewed = DraftInput & { candidateId: string; priceCents: number; sourceAt: string | null };

const when = (value: string | null) => value ? new Date(value).toLocaleDateString() : "unknown date";

export default function OfferImportPanel({ accountId, readOnly = false }: { accountId: string; readOnly?: boolean }) {
  const base = `/api/onlyfans-content/accounts/${encodeURIComponent(accountId)}/imports`;
  const [job, setJob] = useState<ImportJob | null>(null), [refreshJob, setRefreshJob] = useState<ImportJob | null>(null);
  const [items, setItems] = useState<CandidateSummary[]>([]), [next, setNext] = useState<string | null>(null);
  const [detail, setDetail] = useState<CandidateDetail | null>(null), [choice, setChoice] = useState<string | null>(null);
  const [label, setLabel] = useState(""), [description, setDescription] = useState("");
  const [reusable, setReusable] = useState(false), [approved, setApproved] = useState(false);
  const [queue, setQueue] = useState<Reviewed[]>([]), [results, setResults] = useState<DraftResult[]>([]);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(""), [retry, setRetry] = useState<Pending | null>(null);
  const generation = useRef(0), active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; generation.current++; }; }, []);

  const call = useCallback(async (path: string, body?: unknown) => {
    const mine = generation.current;
    const response = await fetch(base + path, body === undefined ? { credentials: "same-origin", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) }
      : { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    if (!active.current || mine !== generation.current) return null;
    const value = await response.json().catch(() => null) as { ok?: boolean; data?: unknown; error?: string; outcome?: string } | null;
    return { status: response.status, value };
  }, [base]);

  const loadCandidates = useCallback(async (jobId: string, after: string | null) => {
    const result = await call(`/jobs/${jobId}/candidates` + (after ? `?after=${after}` : ""));
    if (!result) return;
    const data = result.value?.data as { job: ImportJob; items: CandidateSummary[]; nextCursor: string | null } | undefined;
    if (!result.value?.ok || !data) { setNotice("Candidates could not be read. Try again."); return; }
    setJob(data.job); setItems(after ? previous => [...previous, ...data.items] : data.items); setNext(data.nextCursor);
  }, [call]);

  const pollJob = useCallback(async (current: ImportJob, set: (job: ImportJob) => void) => {
    const result = await call(`/jobs/${current.jobId}`);
    const data = result?.value?.data as ImportJob | undefined;
    if (result?.value?.ok && data) set(data);
    return data;
  }, [call]);

  useEffect(() => {
    if (!job || !["pending", "running"].includes(job.status)) return;
    const timer = setTimeout(async () => {
      const data = await pollJob(job, setJob);
      if (data && !["pending", "running"].includes(data.status)) await loadCandidates(data.jobId, null);
    }, 3000);
    return () => clearTimeout(timer);
  }, [job, pollJob, loadCandidates]);

  useEffect(() => {
    if (!refreshJob || !["pending", "running"].includes(refreshJob.status)) return;
    const timer = setTimeout(async () => {
      const data = await pollJob(refreshJob, setRefreshJob);
      if (data && !["pending", "running"].includes(data.status) && detail && job) await open(detail.candidateId);
    }, 3000);
    return () => clearTimeout(timer);
  });

  async function command(path: string, body: unknown) {
    setBusy(true); setNotice("");
    try {
      const result = await call(path, body);
      if (!result) return null;
      if (result.status === 502 || result.value?.outcome === "unconfirmed") {
        // Keep the exact request: retrying it resolves to the same server command.
        setRetry({ path, body }); setNotice("The outcome is not confirmed. Retry the same request."); return null;
      }
      setRetry(null);
      if (!result.value?.ok) { setNotice(result.value?.error ?? "The request was refused."); return null; }
      return result.value.data;
    } catch {
      setRetry({ path, body }); setNotice("The outcome is not confirmed. Retry the same request."); return null;
    } finally { setBusy(false); }
  }

  async function scan() {
    const data = await command("/jobs", { requestId: crypto.randomUUID(), mode: "inventory", sources: null }) as ImportJob | null;
    if (data) { setJob(data); setItems([]); setDetail(null); }
  }

  async function open(candidate: string) {
    if (!job) return;
    const result = await call(`/jobs/${job.jobId}/candidates/${candidate}`);
    const data = result?.value?.data as CandidateDetail | undefined;
    if (!result?.value?.ok || !data) { setNotice("That offer could not be read."); return; }
    setDetail(data); setChoice(null); setReusable(false); setApproved(false);
  }

  async function refreshSources() {
    if (!detail) return;
    const sources = detail.samples.slice(0, MAX_REFRESH_SOURCES).map(s => ({ fanId: s.fanId, messageId: String(s.messageId) }));
    const data = await command("/jobs", { requestId: crypto.randomUUID(), mode: "refresh", sources }) as ImportJob | null;
    if (data) setRefreshJob(data);
  }

  async function cancel(target: ImportJob) {
    const data = await command(`/jobs/${target.jobId}/cancel`, { expectedRevision: target.revision }) as ImportJob | null;
    if (data) (target.mode === "inventory" ? setJob : setRefreshJob)(data);
  }

  const selected: Observation | undefined = detail?.observations.find(o => o.observationId === choice);
  function addToQueue() {
    if (!detail || !selected || !selected.ready || !reusable || !approved || !label.trim() || !description.trim()) return;
    if (queue.length >= MAX_DRAFTS) { setNotice(`Create at most ${MAX_DRAFTS} drafts at a time.`); return; }
    setQueue(previous => [...previous.filter(q => q.candidateId !== detail.candidateId), {
      candidateId: detail.candidateId, observationId: selected.observationId, expectedFingerprint: selected.fingerprint,
      label: label.trim(), description: description.trim(), reuseConfirmed: true, descriptionApproved: true,
      priceCents: selected.priceCents, sourceAt: selected.sourceAt }]);
    setLabel(""); setDescription(""); setChoice(null); setReusable(false); setApproved(false);
  }

  async function createDrafts() {
    const drafts = queue.map(({ candidateId: _c, priceCents: _p, sourceAt: _s, ...draft }) => draft);
    const data = await command("/drafts", { drafts }) as { results: DraftResult[] } | null;
    if (!data) return;
    setResults(data.results);
    const failed = new Set(data.results.filter(r => !r.ok).map((_r, i) => i));
    setQueue(previous => previous.filter((_q, i) => failed.has(i)));
    if (job) await loadCandidates(job.jobId, null);
  }

  return <Card className="mt-6 min-w-0 p-4" data-offer-import>
    <h2 className="text-lg font-semibold">Import existing OnlyFans offers</h2>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" className={buttonClass} disabled={readOnly || busy || !!retry || (!!job && ["pending", "running"].includes(job.status))} onClick={scan}>Scan imported history</button>
      {job && ["pending", "running"].includes(job.status) && !readOnly ? <button type="button" className={buttonClass} disabled={busy} onClick={() => cancel(job)}>Cancel scan</button> : null}
      {retry ? <button type="button" className={buttonClass} disabled={busy} onClick={() => command(retry.path, retry.body)}>Retry the same request</button> : null}
    </div>
    {notice ? <p role="status" className="mt-2 text-sm">{notice}</p> : null}
    {job ? <p className="mt-3 text-sm" data-import-job>
      {STATUS_LABELS[job.status] ?? job.status}: {job.rowsScanned.toLocaleString()} imported priced messages scanned.
      {job.status === "complete" ? " Imported history scanned. This is not a full account sync." : ""}
      {job.status === "partial" ? " Stopped at the scan limit; results are partial." : ""}
    </p> : null}

    {items.length ? <ul className="mt-4 grid min-w-0 gap-2" aria-label="Offer groups">
      {items.map(item => <li key={item.candidateId} className="min-w-0">
        <button type="button" className="w-full min-w-0 rounded-lg border border-line p-3 text-left text-sm" onClick={() => open(item.candidateId)}
          aria-pressed={detail?.candidateId === item.candidateId}>
          <span className="font-semibold">{item.attachmentCount} attachment{item.attachmentCount === 1 ? "" : "s"}</span>
          {" · "}{item.observedPrices.map(usd).join(", ") || "no price"}{" · "}{item.sourceCount} sends
          {" · "}<span data-status={item.status}>{STATUS_LABELS[item.status]}</span>
          {item.observedPrices.length > 1 ? <span className="ml-1 font-semibold">Several prices</span> : null}
        </button>
      </li>)}
    </ul> : job?.status === "complete" ? <p className="mt-3 text-sm">No priced offers were found in imported history.</p> : null}
    {next && job ? <button type="button" className={`${buttonClass} mt-2`} onClick={() => loadCandidates(job.jobId, next)}>Show more</button> : null}

    {detail ? <section className="mt-5 min-w-0 rounded-xl border border-line p-3" aria-label="Review offer" data-import-review>
      <h3 className="font-semibold">Review offer</h3>
      {detail.existingItem ? <p className="mt-2 text-sm" data-import-conflict>A catalogue item already holds these attachments at {usd(detail.existingItem.priceCents)} ({detail.existingItem.enabled ? "enabled" : "draft"}). It will not be overwritten.</p> : null}
      {detail.assetReasons.map(r => <p key={r} className="mt-1 text-sm">{REASON_LABELS[r] ?? r}</p>)}
      <p className="mt-2 text-sm">Observed variants:</p>
      <ul className="text-sm">{detail.variants.map(v => <li key={v.key}>{v.priceCents === null ? "Other variants" : usd(v.priceCents)} · {v.count} sends{v.mediaIds ? ` · order ${v.mediaIds.join(", ")}` : ""}</li>)}</ul>
      {!readOnly ? <button type="button" className={`${buttonClass} mt-2`} disabled={busy || !!retry || (!!refreshJob && ["pending", "running"].includes(refreshJob.status))} onClick={refreshSources}>Refresh selected source details</button> : null}
      {refreshJob ? <p className="mt-1 text-sm">{STATUS_LABELS[refreshJob.status] ?? refreshJob.status}: {refreshJob.targetsDone} of {refreshJob.targetsTotal} sources found.
        {refreshJob && ["pending", "running"].includes(refreshJob.status) && !readOnly ? <button type="button" className="ml-2 underline" onClick={() => cancel(refreshJob)}>Cancel</button> : null}</p> : null}

      <fieldset className="mt-3 min-w-0"><legend className="text-sm font-semibold">Choose one exact source offer</legend>
        {!detail.observations.length ? <p className="text-sm">No verified source yet. Refresh source details first.</p> : null}
        {detail.observations.map(o => <label key={o.observationId} className="mt-2 flex min-w-0 gap-2 rounded-lg border border-line p-2 text-sm">
          <input type="radio" name="source" disabled={readOnly || !o.ready} checked={choice === o.observationId} onChange={() => setChoice(o.observationId)} />
          <span className="min-w-0">
            <span className="font-semibold">Price from selected OnlyFans offer: {usd(o.priceCents)}</span>, sent {when(o.sourceAt)}
            {o.sourceContext === "queue" ? ", mass message" : ""}
            <span className="mt-1 flex flex-wrap gap-1">{o.attachments.map((a, i) => <span key={a.mediaId} className="rounded border border-line px-1">
              {i + 1}. {a.kind ?? "file"} {a.mediaId}{a.freePreview ? " · free preview" : ""}</span>)}</span>
            {o.previewIds === null ? <span className="block">Free previews unknown.</span> : null}
            {o.lockedText === null ? <span className="block">Locked text unknown.</span> : null}
            {o.reasons.map(r => <span key={r} className="block" data-reason={r}>{REASON_LABELS[r] ?? r}</span>)}
          </span>
        </label>)}
      </fieldset>
      {selected && !readOnly ? <div className="mt-3 grid min-w-0 gap-2">
        <label className="text-sm">Label<input className={inputClass} maxLength={160} value={label} onChange={e => setLabel(e.target.value)} /></label>
        <label className="text-sm">Factual description of what unlocks<textarea className={inputClass} maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} /></label>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={reusable} onChange={e => setReusable(e.target.checked)} />This content is reusable, not a custom or personalized offer.</label>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} />I approve this factual description. No fan names or personal promises.</label>
        <button type="button" className={buttonClass} disabled={!reusable || !approved || !label.trim() || !description.trim()} onClick={addToQueue}>Add to drafts</button>
      </div> : null}
    </section> : null}

    {queue.length ? <section className="mt-5 min-w-0" aria-label="Drafts to create">
      <h3 className="font-semibold">Drafts to create ({queue.length})</h3>
      <ul className="text-sm">{queue.map(q => <li key={q.candidateId}>{q.label}: {usd(q.priceCents)}, price from selected OnlyFans offer on {when(q.sourceAt)}</li>)}</ul>
      <p className="text-sm">Drafts are created switched off. Nothing is sent.</p>
      <button type="button" className={`${buttonClass} mt-2`} disabled={readOnly || busy || !!retry} onClick={createDrafts}>Create selected drafts</button>
    </section> : null}
    {results.length ? <ul className="mt-3 text-sm" aria-label="Draft results">{results.map(r => <li key={r.commandKey} data-draft-result={r.ok ? "created" : r.code}>
      {r.ok ? `Draft created: item ${r.itemId} at ${usd(r.priceCents)}, switched off.` : `Not created: ${r.error}`}</li>)}</ul> : null}
  </Card>;
}
