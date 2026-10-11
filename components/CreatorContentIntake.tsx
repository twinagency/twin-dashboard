"use client";
import { useEffect, useState } from "react";
import { Upload, ImageIcon, Film, Check, RotateCcw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CreatorContentGallery from "./CreatorContentGallery";
import { useContentUploads, type ContentUploadItem } from "./CreatorContentUploadProvider";
import { CREATOR_CONTENT_INSTRUCTION, CREATOR_CONTENT_TARGET, contentMediaKind, type ContentFolder } from "@/lib/creator-content-intake";

function Thumbnail({ item }: { item: ContentUploadItem }) {
  const [url, setUrl] = useState("");
  useEffect(() => { if (!item.file) return; const src = URL.createObjectURL(item.file); setUrl(src); return () => URL.revokeObjectURL(src); }, [item.file]);
  const video = contentMediaKind(item.file || { name: item.name }) === "video";
  return <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted/10">
    {url ? video ? <video src={url} muted playsInline preload="metadata" className="size-full object-cover" aria-label={item.name} /> : <img src={url} alt={item.name} className="size-full object-cover" /> : video ? <Film aria-hidden="true" /> : <ImageIcon aria-hidden="true" />}
  </div>;
}
export default function CreatorContentIntake({ locked, loginPath, savedPhotos, savedVideos, initialFolders = [] }: {
  locked: boolean; loginPath: string; savedPhotos: number; savedVideos: number; initialFolders?: ContentFolder[];
}) {
  const queue = useContentUploads();
  const [notice, setNotice] = useState("");
  const total = savedPhotos + savedVideos;
  if (!queue) return <p role="alert">The uploader could not start. Refresh this page to try again.</p>;
  const folder = queue.folder;
  const folders = folder.folders ?? initialFolders;
  const saved = queue.items.filter(item => item.state === "saved").length;
  return <div className="grid gap-5" data-combined-content-intake>
    <p className="text-base leading-7 text-ink">{CREATOR_CONTENT_INSTRUCTION}</p>
    <div className="flex items-center justify-between gap-3 text-sm"><span>{total} of {CREATOR_CONTENT_TARGET} minimum saved</span>{total >= CREATOR_CONTENT_TARGET && <span className="font-semibold text-emerald-700">Minimum reached</span>}</div>
    <progress max={CREATOR_CONTENT_TARGET} value={Math.min(total, CREATOR_CONTENT_TARGET)} className="h-2 w-full accent-accent" aria-label="Saved content toward 50 files" />
    <label className={`${buttonVariants({ size: "lg" })} relative min-h-14 w-full overflow-hidden ${locked ? "opacity-50" : "cursor-pointer"}`}>
      <Upload className="size-5" aria-hidden="true" /> Add photos & videos
      <input type="file" accept="image/*,video/*" multiple disabled={locked} aria-label="Add photos and videos" className="absolute inset-0 size-full cursor-pointer opacity-0" onChange={event => { if (locked) return; const files = Array.from(event.target.files || []); setNotice(files.length ? "" : "No new files were received from your phone. Your saved content is safe."); queue.add(files); event.target.value = ""; }} />
    </label>
    <details className="text-sm"><summary className="min-h-11 cursor-pointer py-3">File limits or trouble selecting from Photos?</summary>
      <p className="mb-3">JPG, PNG, WebP or GIF up to 75 MiB; MP4, MOV or WebM up to 512 MiB, 30 minutes and 4K. Export HEIC as JPG. Account allowance: 100 GiB and 5,000 files.</p>
      <label className={`${buttonVariants({ variant: "outline" })} relative min-h-11 overflow-hidden`}>Choose from Files<input type="file" accept="application/octet-stream" multiple disabled={locked} aria-label="Choose photos and videos from Files" className="absolute inset-0 size-full opacity-0" onChange={event => { if (locked) return; queue.add(Array.from(event.target.files || [])); event.target.value = ""; }} /></label>
    </details>
    {notice && <p role="status">{notice}</p>}
    {queue.items.length > 0 && <section aria-label="Upload queue">
      <p role="status" className="mb-3 font-medium">{saved} of {queue.items.length} files saved</p>
      <ul className="max-h-96 space-y-3 overflow-y-auto">
        {queue.items.map(item => <li key={item.id} className="flex items-start gap-3 rounded-xl border border-border p-3"><Thumbnail item={item} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" title={item.name}>{item.name}</p>
          <p className={`mt-1 text-sm ${item.state === "failed" || item.state === "reselect" ? "text-rose-700" : "text-muted"}`}>{item.state === "saved" ? "Saved" : item.error || (item.state === "saving" ? "Saving…" : item.state === "uploading" ? `Uploading ${item.percent}%` : "Waiting to upload")}</p>
          {item.state === "uploading" && <progress value={item.percent} max={100} aria-label={`Uploading ${item.name}`} className="mt-2 h-2 w-full accent-accent" />}
          {item.state === "failed" && item.file && <Button type="button" variant="outline" className="mt-2 min-h-11" onClick={() => queue.retry(item.id)}><RotateCcw size={14} /> Retry</Button>}
          {item.state === "reselect" && <p className="mt-1 text-xs">Use Add photos & videos to reselect the original. Saved files will be checked and skipped.</p>}
          {["failed", "reselect", "queued"].includes(item.state) && <button type="button" className="ml-3 min-h-11 text-sm underline" onClick={() => queue.remove(item.id)}>Remove from selection</button>}
        </div>{item.state === "saved" && <Check className="size-5 shrink-0 text-emerald-700" aria-label="Saved" />}</li>)}
      </ul>
      {queue.working && <p className="mt-3 text-sm">Keep this browser open. You can switch to Questionnaire while we save your files.</p>}
    </section>}
    <details className="rounded-xl border border-border p-4"><summary className="min-h-11 cursor-pointer py-2 font-medium">Already have a folder? Paste the link.</summary>
      <label className="mt-3 block text-sm font-medium">Google Drive or Dropbox folder<Input type="url" value={folder.draft} disabled={locked} placeholder="https://drive.google.com/drive/folders/…" onChange={event => folder.setDraft(event.target.value)} onBlur={() => { void folder.save(); }} /></label>
      <p className="mt-2 text-xs text-muted">Share a folder your agency can open. Your agency will import the files; a link does not count as saved content yet.</p>
      {folder.status && <p role={folder.error ? "alert" : "status"} className="mt-3 text-sm">{folder.status}{folder.error && <button type="button" className="ml-2 min-h-11 underline" onClick={() => { void folder.save(); }}>Retry</button>}</p>}
      {folders.length > 0 && <ul className="mt-3 space-y-2 text-sm">{folders.map(folder => <li key={folder.url}><a className="break-all underline" href={folder.url} target="_blank" rel="noopener noreferrer">{folder.provider} folder</a><span className="ml-2">Awaiting import</span></li>)}</ul>}
    </details>
    {!queue.working && total > 0 && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">Your content is saved: {savedPhotos} photos and {savedVideos} videos.{queue.items.some(item => item.state !== "saved") ? " Some selected files still need attention above." : ""}</p>}
    <CreatorContentGallery kind="all_content" revision={`${total}:${queue.revision}`} loginPath={loginPath} />
  </div>;
}
