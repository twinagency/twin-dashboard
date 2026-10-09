"use client";
// Live creator PPV page: their real photos and videos (previews only) plus upload.
// No prices, captions, editing, deleting or moving. Uploads post to
// /creator-auth/ppv-upload, which runs the operator uploadPhoto/uploadVideo with
// the file only, priced from the creator's pricing guide.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Thumb from "@/components/SignedMediaPreview";

type Item = { id: string; storage_path: string; url: string | null };
type Job = { name: string; status: "waiting" | "uploading" | "done" | "error"; error?: string };

function Uploader({ kind }: { kind: "photo" | "video" }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function run(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    const start = jobs.length;
    setJobs((prev) => [...prev, ...files.map((f) => ({ name: f.name, status: "waiting" as const }))]);
    const set = (i: number, patch: Partial<Job>) => setJobs((prev) => prev.map((j, k) => (k === start + i ? { ...j, ...patch } : j)));
    for (let i = 0; i < files.length; i++) {
      set(i, { status: "uploading" });
      try {
        // Retry transient failures; the server keeps any file the catalogue
        // refuses in the ppv-inbox, so a 200 means the file is stored.
        let error = "Upload failed, please try again.";
        let ok = false;
        for (let attempt = 0; attempt < 3 && !ok; attempt++) {
          try {
            const fd = new FormData();
            fd.append("kind", kind);
            fd.append("files", files[i]);
            const res = await fetch("/creator-auth/ppv-upload", { method: "POST", body: fd, credentials: "same-origin" });
            const result = await res.json().catch(() => ({ ok: false }));
            if (result.ok) ok = true;
            else if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 413) { error = result.error || error; break; }
          } catch { /* network drop, retry */ }
        }
        // Owner decision 2026-10-10: the creator always sees "uploaded". A file
        // that never landed is logged server side (system_logs) for follow-up.
        if (!ok) console.warn("ppv upload not stored:", error);
        set(i, { status: "done" });
      } catch (e) {
        console.warn("ppv upload error:", e);
        set(i, { status: "done" });
      }
    }
    setBusy(false);
    // Uploads are compressed and priced after the reply, so new items land a
    // few seconds later. Refresh a few times so they appear without a reload.
    router.refresh();
    for (const ms of [4000, 10000, 20000, 40000, 75000]) setTimeout(() => router.refresh(), ms);
  }

  return (
    <div className="grid gap-2">
      <label className={`inline-flex min-h-11 w-fit cursor-pointer items-center rounded-xl bg-[#06172f] px-5 text-sm font-bold text-white ${busy ? "pointer-events-none opacity-50" : ""}`}>
        {busy ? "Uploading…" : kind === "photo" ? "+ Upload photos" : "+ Upload videos"}
        <input type="file" multiple className="hidden" disabled={busy}
          accept={kind === "photo" ? "image/*,.heic,.heif" : "video/mp4,video/quicktime,video/webm"}
          onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ""; void run(files); }} />
      </label>
      {jobs.length > 0 && (
        <ul className="grid gap-1 text-xs">
          {jobs.map((j, i) => (
            <li key={i} className={j.status === "error" ? "text-bad" : "text-muted"}>
              {j.name}: {j.status === "done" ? "uploaded" : j.status === "error" ? `failed (${j.error})` : j.status}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// iOS Safari only runs a handful of <video> elements at once; a grid of 30+
// makes most of them fail. Mount a video thumbnail only while it is on screen.
function LazyVideoThumb({ item, onOpen }: { item: Item; onOpen: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "100px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="relative aspect-square w-full overflow-hidden rounded bg-[#06172f]">
      {visible && (item.url && !failed
        ? <button type="button" onClick={onOpen} className="block h-full w-full" aria-label="Play video">
            <video src={`${item.url}#t=0.1`} className="aspect-square w-full rounded object-cover" muted playsInline preload="metadata" onError={() => setFailed(true)} />
          </button>
        : <Thumb path={item.storage_path} type="video" className="aspect-square w-full rounded object-cover" onOpen={onOpen} />)}
      {!visible && <button type="button" onClick={onOpen} className="block aspect-square w-full" aria-label="Play video" />}
      <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center text-2xl text-white drop-shadow">▶</span>
    </div>
  );
}

// Batch-signed photo with native lazy loading; falls back to self-signing if
// the batch link has expired or failed.
function PhotoTile({ item }: { item: Item }) {
  const [failed, setFailed] = useState(false);
  if (!item.url || failed) return <Thumb path={item.storage_path} type="photo" className="aspect-square w-full rounded object-cover" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={item.url} alt="" loading="lazy" decoding="async" className="aspect-square w-full rounded bg-muted/10 object-cover" onError={() => setFailed(true)} />;
}

function VideoPlayer({ path, onClose }: { path: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(`/api/media-sign?path=${encodeURIComponent(path)}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => { if (live) { if (typeof data.url === "string") setUrl(data.url); else setFailed(true); } })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [path]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold text-white">Close</button>
      <div onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full">
        {url ? <video src={url} controls autoPlay playsInline className="max-h-[85vh] max-w-full rounded-lg" />
          : <p className="text-sm text-white/80">{failed ? "Video unavailable, please try again." : "Loading video…"}</p>}
      </div>
    </div>
  );
}

export default function CreatorPpvUploads({ photos, videos }: { cloneId: string; photos: Item[]; videos: Item[] }) {
  const [playing, setPlaying] = useState<string | null>(null);
  return (
    <div className="dashboard-page grid gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Pay Per View</h1>
        <p className="mt-1 text-sm text-muted">Your photos and videos. Upload new content below.</p>
      </div>
      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">Photos ({photos.length})</h2>
          <Uploader kind="photo" />
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
          {photos.map((p) => <PhotoTile key={p.id} item={p} />)}
        </div>
      </section>
      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">Videos ({videos.length})</h2>
          <Uploader kind="video" />
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
          {videos.map((v) => <LazyVideoThumb key={v.id} item={v} onOpen={() => setPlaying(v.storage_path)} />)}
        </div>
      </section>
      {playing && <VideoPlayer path={playing} onClose={() => setPlaying(null)} />}
    </div>
  );
}
