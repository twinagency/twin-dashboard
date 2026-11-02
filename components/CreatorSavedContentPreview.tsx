"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ImageIcon, Film, X, ChevronLeft, ChevronRight, Trash2, Play } from "lucide-react";
import type { ContentUploadItem } from "./CreatorContentUploadProvider";
import { contentMediaKind } from "@/lib/creator-content-intake";
import styles from "./CreatorContentIntake.module.css";

type SavedFile = { id: string; name: string; mime: string; status: string; previewAvailable: boolean; removalAvailable: boolean };
type GalleryFile = SavedFile & { local?: ContentUploadItem };
export type ContentCounts = { total: number; saved: number };
type FilePage = { files: SavedFile[]; hasMore: boolean; total?: number; savedCount?: number };

function Tile({ file, open }: { file: GalleryFile; open: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  const [url, setUrl] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    if (file.local?.file) {
      const object = URL.createObjectURL(file.local.file); setUrl(object);
      return () => URL.revokeObjectURL(object);
    }
    setUrl("");
    if (!file.previewAvailable) return;
    const load = () => { void fetch(`/creator-auth/files/${file.id}/access`, { cache: "no-store", signal: abort.signal }).then(async response => {
      if (response.ok) { const body = await response.json(); if (!abort.signal.aborted) setUrl(body.url); }
    }).catch(() => {}); };
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer?.disconnect(); load(); }
    }, { rootMargin: "120px" });
    if (observer && button.current) observer.observe(button.current); else load();
    return () => { abort.abort(); observer?.disconnect(); };
  }, [file.id, file.previewAvailable, file.local?.file]);
  const state = file.local?.state;
  const label = state && state !== "saved" ? state === "uploading" ? `${file.local?.percent}%` : state === "failed" || state === "reselect" ? "Try again" : "Saving…" : file.status === "verified" ? "Saved" : "Needs attention";
  return <button ref={button} type="button" className={styles.previewTile} aria-label={`View ${file.name}`} onClick={open}>
    {url ? file.mime.startsWith("image/") ? <img src={url} alt={file.name} referrerPolicy="no-referrer" onError={() => setUrl("")} /> : <video src={url} muted playsInline preload="metadata" aria-label={file.name} /> : <span className={styles.previewFallback}>{file.mime.startsWith("image/") ? <ImageIcon /> : <Film />}</span>}
    {file.mime.startsWith("video/") && <span className={styles.videoMark}><Play size={18} fill="currentColor" /></span>}
    <span className={styles.tileState}>{label === "Saved" && <Check size={12} />}{label}</span>
  </button>;
}

export default function CreatorSavedContentPreview({ revision, children, items = [], total = 0, loginPath = "/creator/login", onCounts, onRemoved }: {
  revision: string; children: ReactNode; items?: ContentUploadItem[]; total?: number; loginPath?: string;
  onCounts?: (counts: ContentCounts) => void; onRemoved?: (id: string) => boolean | void;
}) {
  const [files, setFiles] = useState<SavedFile[]>([]), [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [expired, setExpired] = useState(false);
  const [retry, setRetry] = useState(0), [open, setOpen] = useState(false), [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState(""), [previewError, setPreviewError] = useState("");
  const [confirm, setConfirm] = useState(false), [removing, setRemoving] = useState(false), [moreBusy, setMoreBusy] = useState(false);
  const [counts, setCounts] = useState<ContentCounts | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), pages = useRef(1), generation = useRef(0);
  const onCountsRef = useRef(onCounts); onCountsRef.current = onCounts;
  const savedIds = new Set(files.map(file => file.id));
  const localFiles: GalleryFile[] = items.filter(item => item.state !== "checking" && !savedIds.has(item.id)).map(item => ({ id: item.id, name: item.name,
    mime: item.file?.type || (contentMediaKind({ name: item.name }) === "video" ? "video/mp4" : "image/jpeg"),
    status: item.state === "saved" ? "verified" : "pending", previewAvailable: !!item.file || item.state === "saved", removalAvailable: item.state === "saved", local: item }));
  const all: GalleryFile[] = [...localFiles, ...files];
  const selected = all.find(file => file.id === selectedId);
  const index = all.findIndex(file => file.id === selectedId);
  const fileCount = Math.max(counts?.total ?? total, files.length) + items.filter(item => item.state !== "checking" && item.state !== "saved" && !savedIds.has(item.id)).length;
  function acceptCounts(body: FilePage) {
    if (Number.isFinite(body.total) && Number.isFinite(body.savedCount)) {
      const next = { total: body.total!, saved: body.savedCount! }; setCounts(next); onCountsRef.current?.(next);
    }
  }
  async function readPage(page: number, signal?: AbortSignal): Promise<FilePage> {
    const response = await fetch(`/creator-auth/files?kind=all_content&page=${page}`, { cache: "no-store", signal });
    if (!response.ok) {
      if (response.status === 401) setExpired(true);
      throw new Error(response.status === 401 ? "Please sign in again to see your files." : "Your files couldn’t load. Please try again.");
    }
    return response.json();
  }
  useEffect(() => {
    const abort = new AbortController(); const version = ++generation.current;
    const timer = setTimeout(() => { void (async () => {
      try {
        const loaded: SavedFile[] = []; let last: FilePage | undefined;
        for (let page = 0; page < pages.current; page++) {
          last = await readPage(page, abort.signal); loaded.push(...last.files);
          if (page === 0 && !abort.signal.aborted && version === generation.current) acceptCounts(last);
          if (!last.hasMore) { pages.current = page + 1; break; }
        }
        if (!abort.signal.aborted && version === generation.current) { setFiles([...new Map(loaded.map(file => [file.id, file])).values()]); setHasMore(!!last?.hasMore); setError(""); setExpired(false); }
      } catch (reason) { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : "Your files couldn’t load."); }
      finally { if (!abort.signal.aborted) setLoading(false); }
    })(); }, 150);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [revision, retry]);
  async function loadMore(selectNext = false) {
    if (moreBusy) return;
    setMoreBusy(true); const version = generation.current;
    try {
      const body = await readPage(pages.current);
      if (version !== generation.current) return;
      pages.current++; setFiles(current => [...new Map([...current, ...body.files].map(file => [file.id, file])).values()]);
      setHasMore(body.hasMore); acceptCounts(body); setError("");
      if (selectNext && body.files[0]) setSelectedId(body.files[0].id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "More files couldn’t load."); }
    finally { setMoreBusy(false); }
  }
  useEffect(() => {
    if (!open) { dialog.current?.close?.(); return; }
    dialog.current?.showModal?.();
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; };
  }, [open]);
  useEffect(() => { setConfirm(false); }, [open, selectedId]);
  useEffect(() => {
    setPreviewUrl(""); setPreviewError("");
    if (!open || !selected) return;
    if (selected.local?.file) { const url = URL.createObjectURL(selected.local.file); setPreviewUrl(url); return () => URL.revokeObjectURL(url); }
    if (!selected.previewAvailable) { setPreviewError("This file isn’t ready to view yet."); return; }
    const abort = new AbortController();
    void fetch(`/creator-auth/files/${selected.id}/access`, { cache: "no-store", signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error("This file couldn’t open. Close it and try again.");
      const body = await response.json(); if (!abort.signal.aborted) setPreviewUrl(body.url);
    }).catch(reason => { if (!abort.signal.aborted) setPreviewError(reason.message); });
    return () => abort.abort();
  }, [open, selectedId, selected?.previewAvailable, selected?.local?.file]);
  function close() { if (!removing) { setOpen(false); setSelectedId(null); setConfirm(false); } }
  async function removeSelected() {
    if (!selected || removing) return;
    setRemoving(true); setError("");
    try {
      if (selected.local && selected.local.state !== "saved") {
        if (onRemoved?.(selected.id) === false) throw new Error("This file has started uploading. You can remove it once it’s saved.");
      } else {
        const response = await fetch(`/creator-auth/files/${selected.id}`, { method: "DELETE" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error === "content_in_use" ? "This file has already been submitted. Ask your agency to remove it." : "This file couldn’t be removed. Please try again.");
        generation.current++;
        onRemoved?.(selected.id);
        setFiles(current => current.filter(file => file.id !== selected.id));
        if (counts) { const next = { total: Math.max(0, counts.total - 1), saved: Math.max(0, counts.saved - (selected.status === "verified" ? 1 : 0)) }; setCounts(next); onCountsRef.current?.(next); }
      }
      setSelectedId(null); setConfirm(false); setRetry(value => value + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "This file couldn’t be removed."); }
    finally { setRemoving(false); }
  }
  const uploading = selected?.local && ["uploading", "saving"].includes(selected.local.state);
  const canRemove = selected && !uploading && (selected.removalAvailable || (selected.local && ["queued", "failed", "reselect"].includes(selected.local.state)));
  const alert = error && <p role="alert" className={styles.galleryError}>{error} {!removing && <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button>}{expired && <a href={`${loginPath}?next=${encodeURIComponent("/creator/onboarding?step=content")}`}>Sign in</a>}</p>;
  return <>
    {loading && !all.length && <p role="status" className={styles.hint}>Loading your content…</p>}
    {!open && alert}
    <div className={styles.previewGrid} aria-label="Saved content previews">
      {all.slice(0, 6).map(file => <Tile key={file.id} file={file} open={() => { setSelectedId(file.id); setOpen(true); }} />)}
    </div>
    {!!all.length && <button type="button" className={styles.viewAll} onClick={() => { setSelectedId(null); setOpen(true); }}>View all ({Math.max(fileCount, all.length)}) <ChevronRight size={16} /></button>}
    {children}
    <dialog ref={dialog} className={styles.fileDialog} aria-label={selected ? "View file" : "All your content"} onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
      {open && <div className={styles.dialogBody}>
        <header className={styles.dialogHeader}><div>{selected ? <button type="button" className={styles.backToFiles} disabled={removing} onClick={() => setSelectedId(null)}><ChevronLeft size={18} /> All content</button> : <h2>Your content</h2>}<p>{selected ? selected.name : `${Math.max(fileCount, all.length)} files · Tap to view or remove`}</p></div><button type="button" className={styles.closeDialog} aria-label="Close gallery" disabled={removing} onClick={close}><X /></button></header>
        {alert}
        {selected ? <>
          <div className={styles.largePreview}>
            {previewUrl ? selected.mime.startsWith("image/") ? <img src={previewUrl} alt={selected.name} referrerPolicy="no-referrer" onError={() => setPreviewError("This photo couldn’t open in your browser.")} /> : <video key={selected.id} controls playsInline preload="metadata" src={previewUrl} aria-label={selected.name} onError={() => setPreviewError("This video couldn’t play in your browser. Try another browser or upload an MP4 copy.")} /> : !previewError && <p role="status">Opening your file…</p>}
            {previewError && <p role="alert">{previewError}</p>}
          </div>
          <nav className={styles.previewNav} aria-label="Browse content"><button type="button" disabled={index <= 0 || removing} onClick={() => setSelectedId(all[index - 1].id)}><ChevronLeft size={18} /> Previous</button><span>{index + 1} of {Math.max(fileCount, all.length)}</span><button type="button" disabled={removing || moreBusy || (index >= all.length - 1 && !hasMore)} onClick={() => { if (index < all.length - 1) setSelectedId(all[index + 1].id); else void loadMore(true); }}>Next <ChevronRight size={18} /></button></nav>
          {confirm ? <div className={styles.removeConfirm}><p>Remove this file?</p><div><button type="button" disabled={removing} onClick={() => void removeSelected()}>{removing ? "Removing…" : "Yes, remove"}</button><button type="button" disabled={removing} onClick={() => setConfirm(false)}>Keep file</button></div></div> : <button type="button" className={styles.removeFile} disabled={!canRemove || removing} onClick={() => setConfirm(true)}><Trash2 size={16} /> Remove file</button>}
          {uploading && <p className={styles.hint}>This file is uploading. You can remove it once it’s saved.</p>}
          {!canRemove && !uploading && <p className={styles.hint}>This file has already been submitted. Ask your agency to remove it.</p>}
        </> : <><div className={styles.allFilesGrid} aria-label="All uploaded files">{all.map(file => <Tile key={file.id} file={file} open={() => setSelectedId(file.id)} />)}</div>{!all.length && <p className={styles.hint}>No files yet. Close this window to add photos and videos.</p>}{hasMore && <button type="button" className={styles.viewAll} disabled={moreBusy} onClick={() => void loadMore()}>{moreBusy ? "Loading…" : "Load more"}</button>}</>}
      </div>}
    </dialog>
  </>;
}
