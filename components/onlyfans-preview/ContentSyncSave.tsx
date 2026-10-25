"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { inputCls } from "@/components/clone/fields";
import { displayContentPrice, parseContentPrice } from "@/lib/onlyfans/content";
import { MAX_SYNC_FILES, MAX_SYNC_FILE_BYTES, SYNC_CHUNK_BYTES, validDraftRequest, type DraftRequest, type SyncDraft } from "@/lib/onlyfans/content-sync";
import { connectionHref, sha256Hex, syncCall } from "@/lib/onlyfans/content-sync-client";
import ContentSyncDraft from "./ContentSyncDraft";

const inputClass = `${inputCls} mt-1 disabled:opacity-50`;
const buttonClass = "min-h-11 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-accent disabled:opacity-50";
const ACTIVE = new Set(["queued", "uploading", "verifying", "retrying"]);
const isPhoto = (file: File) => file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name);
const size = (bytes: number) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
type Entry = { id: string; file: File };
/** Resumable cursor. Nothing here is re-derived on retry, so a retry sends the exact same request or chunk. */
type Job = { request: DraftRequest | null; draft: SyncDraft | null; fileIndex: number; chunk: number; commitId: string | null; committed: boolean };
const newJob = (): Job => ({ request: null, draft: null, fileIndex: 0, chunk: 0, commitId: null, committed: false });

/** Save new media as a fixed-price item: hash, create draft, stage chunks, commit, then follow the draft to the end. */
export default function ContentSyncSave({ accountId, readOnly = false }: { accountId: string; readOnly?: boolean }) {
  const router = useRouter();
  const [avail, setAvail] = useState<"loading" | "ready" | "unavailable" | "denied">("loading");
  const [entries, setEntries] = useState<Entry[]>([]), [previews, setPreviews] = useState<Set<string>>(new Set()), [pickerKey, setPickerKey] = useState(0);
  const [label, setLabel] = useState(""), [description, setDescription] = useState(""), [price, setPrice] = useState("");
  const [phase, setPhase] = useState<"idle" | "hashing" | "creating" | "uploading" | "committing">("idle"), [paused, setPaused] = useState(false), [connection, setConnection] = useState(false);
  const [progress, setProgress] = useState<Record<string, number>>({}), [notice, setNotice] = useState(""), [current, setCurrent] = useState<SyncDraft | null>(null);
  const [recent, setRecent] = useState<SyncDraft[]>([]);
  const controller = useRef<AbortController | null>(null), job = useRef<Job>(newJob()), tracked = useRef<string | null>(null), running = useRef(false), announced = useRef(new Set<string>());
  const signal = () => controller.current?.signal;
  const busy = phase !== "idle";
  const locked = busy || paused || (!!current && current.state === "draft");

  const refreshDrafts = useCallback(async () => {
    const reply = await syncCall<{ items: SyncDraft[] }>(accountId, "/drafts?limit=10", { signal: signal() });
    if (reply.kind === "ok") setRecent(reply.data.items);
    const id = tracked.current;
    if (id) {
      const own = await syncCall<SyncDraft>(accountId, `/drafts/${encodeURIComponent(id)}`, { signal: signal() });
      if (own.kind === "ok") {
        setCurrent(own.data);
        if (own.data.state === "synced" && own.data.itemId && !announced.current.has(own.data.draftId)) { announced.current.add(own.data.draftId); router.refresh(); }
      }
    }
  }, [accountId, router]);

  useEffect(() => {
    controller.current = new AbortController();
    void (async () => {
      const reply = await syncCall(accountId, "/status", { signal: signal() });
      if (reply.kind === "stale") return;
      if (reply.kind === "ok") { setAvail("ready"); await refreshDrafts(); } else setAvail(reply.kind === "denied" ? "denied" : "unavailable");
    })();
    return () => controller.current?.abort();
  }, [accountId, refreshDrafts]);

  const following = (!!current && ACTIVE.has(current.state)) || recent.some(d => ACTIVE.has(d.state));
  useEffect(() => {
    if (avail !== "ready" || !following) return;
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refreshDrafts(); }, 3000);
    return () => clearInterval(timer);
  }, [avail, following, refreshDrafts]);

  function sessionLost() {
    setAvail("denied"); setEntries([]); setPreviews(new Set()); setCurrent(null); setRecent([]); setPaused(false); setPhase("idle"); job.current = newJob(); tracked.current = null;
    setNotice("Your session cannot save media. Sign in again."); router.refresh();
  }

  /** Run or resume from the saved cursor. Any step that cannot be confirmed pauses here and is retried unchanged. */
  async function run() {
    if (running.current) return;
    running.current = true; setPaused(false); setNotice(""); setConnection(false);
    const state = job.current;
    const pause = (message: string) => { setPaused(true); setNotice(message); };
    try {
      if (!state.request) {
        setPhase("hashing");
        const files: DraftRequest["files"] = [];
        for (const { id, file } of entries) {
          if (signal()?.aborted) return;
          files.push({ fileId: id, name: file.name, size: file.size, sha256: await sha256Hex(await file.arrayBuffer()) });
        }
        const request: DraftRequest = { requestId: crypto.randomUUID(), label: label.trim(), description: description.trim(), priceCents: parseContentPrice(price) ?? -1,
          files, previewFileIds: entries.filter(e => previews.has(e.id)).map(e => e.id) };
        if (!validDraftRequest(request)) { setNotice("Check the files, label, description and price, then save again."); return; }
        state.request = request;
      }
      if (!state.draft) {
        setPhase("creating");
        const reply = await syncCall<SyncDraft>(accountId, "/drafts", { method: "POST", body: state.request, signal: signal() });
        if (reply.kind === "stale") return;
        if (reply.kind === "denied") return sessionLost();
        if (reply.kind === "unconfirmed") return pause(reply.error);
        if (reply.kind === "refused") { setConnection(reply.code === "connection_unavailable"); job.current = newJob(); setNotice(reply.error); return; }
        state.draft = reply.data; tracked.current = reply.data.draftId; setCurrent(reply.data);
      }
      const draft = state.draft;
      if (draft.state === "draft") {
        // Only assets the backend still marks as unsent need bytes; files it already holds on this connection are reused.
        const missing = [...draft.assets].sort((a, b) => a.order - b.order).filter(asset => asset.state === "draft");
        setPhase("uploading");
        for (; state.fileIndex < missing.length; state.fileIndex++, state.chunk = 0) {
          const asset = missing[state.fileIndex], entry = entries.find(e => e.id === asset.fileId);
          if (!entry) { setNotice("Choose the original files again to continue."); setPaused(true); return; }
          const total = Math.max(1, Math.ceil(entry.file.size / SYNC_CHUNK_BYTES));
          for (; state.chunk < total; state.chunk++) {
            if (signal()?.aborted) return;
            const start = state.chunk * SYNC_CHUNK_BYTES, bytes = await entry.file.slice(start, start + SYNC_CHUNK_BYTES).arrayBuffer();
            const reply = await syncCall<{ received: number; complete: boolean }>(accountId, `/drafts/${encodeURIComponent(draft.draftId)}/files/${asset.fileId}/chunks/${state.chunk}`,
              { method: "POST", bytes, signal: signal() });
            if (reply.kind === "stale") return;
            if (reply.kind === "denied") return sessionLost();
            if (reply.kind === "unconfirmed") return pause("Transfer not confirmed. Retry sends the same part again.");
            if (reply.kind === "refused") { setConnection(reply.code === "connection_unavailable"); return pause(reply.error); }
            if (state.chunk === total - 1 && !reply.data.complete) return pause("The last part was not confirmed as complete. Retry sends it again.");
            setProgress(previous => ({ ...previous, [asset.fileId]: Math.min(entry.file.size, start + bytes.byteLength) }));
          }
        }
        if (!state.committed) {
          setPhase("committing");
          state.commitId ??= crypto.randomUUID();
          const reply = await syncCall<SyncDraft>(accountId, `/drafts/${encodeURIComponent(draft.draftId)}/commit`, { method: "POST", body: { requestId: state.commitId }, signal: signal() });
          if (reply.kind === "stale") return;
          if (reply.kind === "denied") return sessionLost();
          if (reply.kind === "unconfirmed") return pause(reply.error);
          if (reply.kind === "refused") { setConnection(reply.code === "connection_unavailable"); return pause(reply.error); }
          state.draft = reply.data; state.committed = true; setCurrent(reply.data);
        }
      }
      setEntries([]); setPreviews(new Set()); setLabel(""); setDescription(""); setPrice(""); setProgress({}); setPickerKey(key => key + 1);
      setNotice("Saved. Uploading to OnlyFans in the background. Nothing is posted or sent to fans.");
      job.current = newJob();
      await refreshDrafts();
    } catch {
      pause("The save was interrupted. Retry continues from the last confirmed step.");
    } finally { running.current = false; setPhase("idle"); }
  }

  function startOver() { job.current = newJob(); setPaused(false); setConnection(false); setProgress({}); tracked.current = null; setCurrent(null); setNotice("Start again when you are ready. The unfinished save stays in Recent saves."); }

  const cents = parseContentPrice(price);
  const issues = [
    ...(!entries.length ? ["Choose at least one photo or video."] : []),
    ...(entries.some(e => e.file.size > MAX_SYNC_FILE_BYTES) ? ["Files over 1 GB can't be saved here. Use Upload photos and videos above."] : []),
    ...(entries.length && previews.size >= entries.length ? ["Keep at least one file behind the paid unlock."] : []),
    ...(!label.trim() ? ["Enter an item label."] : []), ...(!description.trim() ? ["Describe what the fan receives."] : []),
    ...(cents === null || cents < 300 || cents > 20000 ? ["Set a price between USD 3.00 and 200.00."] : []),
  ];
  const others = recent.filter(d => d.draftId !== current?.draftId);

  return <section className="mt-4 min-w-0 rounded-xl border border-line p-4" aria-labelledby={`sync-save-${accountId}`} data-content-sync-save aria-busy={busy}>
    <h3 id={`sync-save-${accountId}`} className="text-sm font-semibold">Save new media as an item</h3>
    {avail === "loading" ? <p className="mt-2 text-sm text-muted" role="status">Checking whether saving to OnlyFans is available…</p> : null}
    {avail === "unavailable" ? <p className="mt-2 text-sm" role="status" data-sync-save-unavailable>Saving media to OnlyFans isn&apos;t available for this account right now. Nothing was posted or sent.</p> : null}
    {avail === "denied" ? <p className="mt-2 text-sm" role="status">{notice || "Your session cannot save media. Sign in again."}</p> : null}
    {avail === "ready" ? <>
      <p className="mt-1 text-xs text-muted">Files are uploaded to your OnlyFans vault and saved as an item switched off, with a fixed price for future messages. Saving never messages a fan or publishes a post.</p>
      {readOnly ? <p className="mt-2 text-xs text-muted">Read-only team access</p> : <form className="mt-3 min-w-0" onSubmit={event => { event.preventDefault(); if (!issues.length && !locked) void run(); }}>
        <fieldset disabled={locked} className="min-w-0 space-y-3">
          <legend className="sr-only">New item</legend>
          <label className="block text-sm font-medium">Choose photos or videos
            <input key={pickerKey} className="mt-2 block w-full min-w-0 text-sm" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.mp4,.m4v,.mov,.webm" data-sync-save-files
              onChange={event => { const files = Array.from(event.target.files ?? []).slice(0, MAX_SYNC_FILES);
                setEntries(files.map(file => ({ id: crypto.randomUUID(), file }))); setPreviews(new Set()); job.current = newJob(); setNotice(event.target.files && event.target.files.length > MAX_SYNC_FILES ? `Only the first ${MAX_SYNC_FILES} files were kept.` : ""); }} />
          </label>
          {entries.length ? <ul className="space-y-1 text-xs" aria-label="Selected files">{entries.map((entry, index) => <li key={entry.id} className="flex min-w-0 flex-wrap items-center gap-x-3" data-sync-save-file={index}>
            <span className="min-w-0 flex-1 break-all">{index + 1}. {entry.file.name} · {size(entry.file.size)}</span>
            {isPhoto(entry.file) ? <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={previews.has(entry.id)} data-sync-save-preview={index}
              onChange={event => setPreviews(previous => { const next = new Set(previous); if (event.target.checked) next.add(entry.id); else next.delete(entry.id); return next; })} />Free preview</label> : null}
            {progress[entry.id] !== undefined ? <progress className="h-1.5 w-full accent-accent" max={entry.file.size} value={progress[entry.id]} aria-label={`Transfer progress for ${entry.file.name}`} /> : null}
          </li>)}</ul> : null}
          <div className="grid min-w-0 gap-3 md:grid-cols-2">
            <label className="min-w-0 text-sm">Item label<input className={inputClass} maxLength={160} value={label} onChange={event => setLabel(event.target.value)} data-sync-save-label /></label>
            <label className="min-w-0 text-sm">Price for future messages (USD)<input className={inputClass} inputMode="decimal" autoComplete="off" value={price} onChange={event => setPrice(event.target.value)} data-sync-save-price />
              <span className="mt-1 block text-xs text-muted">Fixed. USD 3.00 to 200.00{cents !== null && cents >= 300 && cents <= 20000 ? `, saved as USD ${displayContentPrice(cents)}` : ""}.</span></label>
          </div>
          <label className="block text-sm">What the fan receives<textarea className={`${inputClass} min-h-24`} maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} data-sync-save-description /></label>
          {issues.length && (entries.length || label || description || price) ? <ul className="list-inside list-disc space-y-1 text-sm" aria-live="polite" data-sync-save-issues>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul> : null}
          <button type="submit" className={buttonClass} disabled={!!issues.length || locked} data-sync-save-submit>{busy ? ({ hashing: "Checking files…", creating: "Saving…", uploading: "Uploading…", committing: "Finishing…", idle: "" }[phase]) : "Save and upload to OnlyFans"}</button>
        </fieldset>
        {paused ? <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={buttonClass} disabled={busy} data-sync-save-retry onClick={() => void run()}>Retry the same step</button>
          <button type="button" className={buttonClass} disabled={busy} onClick={startOver}>Start over</button>
        </div> : null}
      </form>}
      {notice ? <p className="mt-3 break-words text-sm" role="status" data-sync-save-notice>{notice}{connection ? <> <Link className="font-semibold text-accent underline" href={connectionHref(accountId)}>Reconnect this account</Link></> : null}</p> : null}
      {current ? <div className="mt-4"><ContentSyncDraft accountId={accountId} draft={current} readOnly={readOnly} onChanged={() => void refreshDrafts()} /></div> : null}
      {others.length ? <div className="mt-4 min-w-0" data-sync-recent><h4 className="text-sm font-semibold">Recent saves</h4>
        <div className="mt-2 grid min-w-0 gap-3">{others.slice(0, 5).map(draft => <ContentSyncDraft key={draft.draftId} accountId={accountId} draft={draft} readOnly={readOnly} unfinished onChanged={() => void refreshDrafts()} />)}</div></div> : null}
    </> : null}
  </section>;
}
