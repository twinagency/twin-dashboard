"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
type SavedFile = { id: string; name: string; bytes: number; mime: string; createdAt: string; status: string; previewAvailable: boolean; removalAvailable: boolean };
const errorCopy: Record<string, string> = {
  session_expired: "Your session expired. Sign in again to review saved files.",
  stored_file_unavailable: "The stored file could not be retrieved. Try again, or contact support.",
  file_not_verified: "This file is not verified yet. Contact support if it stays unavailable.",
  content_in_use: "Submitted or connected content requires support review before removal.",
  removal_pending: "Removal has not finished. Retry this file's removal before submitting onboarding.",
};
export default function CreatorContentGallery({ kind, revision, loginPath }: { kind: string; revision: string; loginPath: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<SavedFile[]>([]), [page, setPage] = useState(0), [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [sessionExpired, setSessionExpired] = useState(false);
  const [preview, setPreview] = useState<{ id: string; url: string } | null>(null), [codecError, setCodecError] = useState("");
  const [busy, setBusy] = useState<string | null>(null), [confirmRemove, setConfirmRemove] = useState<string | null>(null), [reload, setReload] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true); setError(""); setSessionExpired(false); setPreview(null); setCodecError("");
    void fetch(`/creator-auth/files?kind=${encodeURIComponent(kind)}&page=${page}`, { cache: "no-store", signal: abort.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok) { setSessionExpired(response.status === 401); throw new Error(errorCopy[body.error] || "Your saved content could not be loaded. Retry shortly."); }
      setFiles(body.files); setHasMore(!!body.hasMore);
    }).catch(reason => { if (!abort.signal.aborted) setError(reason.message || "Your gallery could not be loaded."); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [kind, revision, page, reload]);
  async function access(file: SavedFile, download = false) {
    if (busy) return;
    setBusy(file.id); setError(""); setCodecError("");
    try {
      const response = await fetch(`/creator-auth/files/${file.id}/access${download ? "?download=1" : ""}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) { setSessionExpired(response.status === 401); throw new Error(errorCopy[body.error] || "Playback is temporarily unavailable. Try again."); }
      if (download) {
        const link = document.createElement("a"); link.href = body.url; link.rel = "noreferrer noopener"; link.target = "_blank"; link.click();
      } else setPreview({ id: file.id, url: body.url });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Playback could not be opened."); }
    finally { setBusy(null); }
  }
  async function remove(file: SavedFile) {
    if (busy) return;
    setBusy(file.id); setError("");
    try {
      const response = await fetch(`/creator-auth/files/${file.id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) { setSessionExpired(response.status === 401); throw new Error(body.message || errorCopy[body.error] || "This file could not be removed. Retry shortly."); }
      setConfirmRemove(null); setPreview(null); setReload(value => value + 1); router.refresh();
      if (!body.progressSaved) setError("The file was removed, but the completion indicator could not be updated. Refresh to review your current counts.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Removal could not be completed."); }
    finally { setBusy(null); }
  }
  return <section aria-label="Saved content" className="mt-6 border-t border-border pt-5">
    <h4 className="font-semibold text-ink">Saved content</h4>
    {loading ? <p role="status" className="mt-3 text-sm text-muted">Loading saved files…</p> : !files.length && !error ? <p className="mt-3 text-sm text-muted">{kind === "all_content" ? "Your saved photos and videos will appear here." : "No saved files in this category yet."}</p> : null}
    {error && <div role="alert" className="mt-3 break-words text-sm text-red-700">{error} <button type="button" className="min-h-11 underline" onClick={() => setReload(value => value + 1)}>Retry</button></div>}
    {sessionExpired && <a className="inline-flex min-h-11 items-center underline" href={`${loginPath}?next=${encodeURIComponent(`/creator/onboarding?step=${kind === "voice" ? "voice" : "content"}`)}`}>Sign in and return to saved content</a>}
    {!loading && <ul className="mt-3 grid gap-4">
      {files.map(file => <li key={file.id} className="rounded-xl border border-border p-3 text-sm">
        <p className="break-words font-medium text-ink">{file.name}</p>
        <p className="mt-1 text-muted">{(Number(file.bytes) / 1024 / 1024).toFixed(1)} MiB · {file.status === "removing" ? "Removal pending — retry below" : file.status === "verified" ? "Saved and verified" : "Verification unavailable"}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={!file.previewAvailable || !!busy} onClick={() => access(file)}>{busy === file.id ? "Please wait…" : "Preview / play"}</Button>
          <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={!file.previewAvailable || !!busy} onClick={() => access(file, true)}>Download</Button>
          {file.removalAvailable && <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={!!busy} onClick={() => setConfirmRemove(file.id)}>{file.status === "removing" ? "Retry removal" : "Remove saved file"}</Button>}
        </div>
        {!file.previewAvailable && <p className="mt-2 text-muted">{file.status === "removing" ? "Finish this removal before submitting onboarding. Your other saved files are unaffected." : "This earlier upload needs support review before playback is available."}</p>}
        {!file.removalAvailable && <p className="mt-2 text-muted">Submitted or connected content requires support review before removal.</p>}
        {confirmRemove === file.id && <div className="mt-3 rounded-lg bg-muted/10 p-3">
          <p>Remove this saved file from your onboarding content?</p>
          <div className="mt-2 flex gap-2"><Button type="button" variant="destructive" className="min-h-11" disabled={!!busy} onClick={() => remove(file)}>Confirm removal</Button><Button type="button" variant="outline" className="min-h-11" disabled={!!busy} onClick={() => setConfirmRemove(null)}>Cancel</Button></div>
        </div>}
        {preview?.id === file.id && <div className="mt-4">
          {file.mime.startsWith("image/") ? <img src={preview.url} alt={file.name} referrerPolicy="no-referrer" className="max-h-96 w-full rounded-lg object-contain" onError={() => setCodecError("This browser could not display the saved image. Try Download.")} />
            : file.mime.startsWith("audio/") ? <audio controls preload="metadata" src={preview.url} className="w-full" onError={() => setCodecError("This browser could not play the saved audio. Try Download.")} />
            : <video controls playsInline preload="metadata" src={preview.url} className="max-h-96 w-full rounded-lg bg-black" onError={() => setCodecError("This browser could not play the saved video. The format may need a compatible player. Try Download or export an MP4 using H.264.")} />}
          {codecError && <p role="alert" className="mt-2 text-amber-800">{codecError}</p>}
        </div>}
      </li>)}
    </ul>}
    {!loading && (page > 0 || hasMore) && <nav aria-label="Saved content pages" className="mt-3 flex justify-between gap-3"><Button variant="outline" type="button" className="min-h-11" disabled={!page} onClick={() => setPage(value => value - 1)}>Previous</Button><span className="self-center text-sm">Page {page + 1}</span><Button variant="outline" type="button" className="min-h-11" disabled={!hasMore} onClick={() => setPage(value => value + 1)}>Next</Button></nav>}
  </section>;
}

