"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Check, ImageIcon, Film } from "lucide-react";
import styles from "./CreatorContentIntake.module.css";

type PreviewFile = { id: string; name: string; mime: string; previewAvailable: boolean; status: string; url?: string };
export default function CreatorSavedContentPreview({ revision, children }: { revision: string; children: ReactNode }) {
  const [files, setFiles] = useState<PreviewFile[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true); setError(false);
    void (async () => {
      try {
        const response = await fetch("/creator-auth/files?kind=all_content&page=0", { cache: "no-store", signal: abort.signal });
        if (!response.ok) throw new Error("files unavailable");
        const body = await response.json();
        const first: PreviewFile[] = body.files.slice(0, 5);
        if (!abort.signal.aborted) { setFiles(first); setLoading(false); }
        await Promise.all(first.map(async file => {
          if (!file.previewAvailable) return;
          try {
            const access = await fetch(`/creator-auth/files/${file.id}/access`, { cache: "no-store", signal: abort.signal });
            if (!access.ok) return;
            const result = await access.json();
            if (!abort.signal.aborted) setFiles(current => current.map(row => row.id === file.id ? { ...row, url: result.url } : row));
          } catch { /* Retain a visible file tile when its preview is unavailable. */ }
        }));
      } catch { if (!abort.signal.aborted) setError(true); }
      finally { if (!abort.signal.aborted) setLoading(false); }
    })();
    return () => abort.abort();
  }, [revision, retry]);
  return <>
    {loading && <p role="status" className={styles.hint}>Loading your content…</p>}
    {error && <p role="alert" className={styles.hint}>Your previews couldn’t load. <button type="button" className="min-h-11 underline" onClick={() => setRetry(value => value + 1)}>Retry</button></p>}
    <div className={styles.previewGrid} aria-label="Saved content previews">
      {files.map(file => <div key={file.id} className={styles.previewTile}>
        {file.url ? file.mime.startsWith("image/") ? <img src={file.url} alt={file.name} referrerPolicy="no-referrer" onError={() => setFiles(current => current.map(row => row.id === file.id ? { ...row, url: undefined } : row))} /> : <video src={file.url} controls playsInline preload="metadata" aria-label={file.name} /> : <div className={styles.previewFallback}>{file.mime.startsWith("image/") ? <ImageIcon /> : <Film />}<span>{file.name}</span></div>}
        <span className={styles.tileState}>{file.status === "verified" ? <><Check size={14} /> Saved</> : "Needs review"}</span>
      </div>)}
      {children}
    </div>
  </>;
}
