"use client";

import { useState } from "react";
import { creatorUploadUrl, uploadLabel, uploadMedia, uploadSize, type CreatorUpload, type UploadMedia } from "@/lib/creator-upload-display";

const PAGE_SIZE = 18;
const FILTERS: { value: "all" | UploadMedia; label: string }[] = [
  { value: "all", label: "All" }, { value: "photo", label: "Photos" },
  { value: "video", label: "Videos" }, { value: "audio", label: "Audio" }, { value: "file", label: "Other files" },
];

function UploadCard({ accountId, file }: { accountId: string; file: CreatorUpload }) {
  const [previewFailed, setPreviewFailed] = useState(false);
  const type = uploadMedia(file);
  const ready = file.storage_transfer_status === "verified";
  const name = uploadLabel(file);
  const url = creatorUploadUrl(accountId, file.id);
  return <li className="min-w-0 overflow-hidden rounded-xl border border-line bg-panel">
    <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-black/5">
      {!ready ? <p className="px-4 text-center text-sm text-muted">{file.storage_transfer_status === "pending" ? "Upload is still processing." : "File is not ready to view."}</p>
        : previewFailed ? <p className="px-4 text-center text-sm text-muted">Preview unavailable. Try opening or downloading this file.</p>
        : type === "photo" ? <img src={url} alt={name} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setPreviewFailed(true)} className="h-full w-full object-contain" />
        : type === "video" ? <video src={url} aria-label={name} controls playsInline preload="none" onError={() => setPreviewFailed(true)} className="h-full w-full object-contain" />
        : type === "audio" ? <audio src={url} aria-label={name} controls preload="none" onError={() => setPreviewFailed(true)} className="max-w-full px-2" />
        : <p className="text-sm text-muted">Download to view this file.</p>}
    </div>
    <div className="space-y-3 p-3">
      <p className="break-words text-sm font-medium">{name}</p>
      <p className="text-xs text-muted">{[file.kind.includes("nsfw") ? "NSFW" : file.kind.includes("sfw") ? "SFW" : type === "audio" ? "Voice sample" : "Upload", uploadSize(file.size_bytes)].filter(Boolean).join(" · ")}</p>
      {ready && <div className="flex flex-wrap gap-3 text-sm">
        <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-md border border-line px-3 py-2" aria-label={`Open ${name}`}>Open</a>
        <a href={creatorUploadUrl(accountId, file.id, true)} className="rounded-md bg-accent px-3 py-2 text-white" aria-label={`Download ${name}`}>Download</a>
      </div>}
    </div>
  </li>;
}

export default function UploadedContent({ accountId, files }: { accountId: string; files: CreatorUpload[] }) {
  const [filter, setFilter] = useState<"all" | UploadMedia>("all");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const matching = files.filter(file => filter === "all" || uploadMedia(file) === filter);
  return <section id="uploaded-content" className="space-y-4 rounded-xl border border-line bg-panel p-4 sm:p-5">
    <div><h2 className="font-semibold">Uploaded content <span className="text-muted">({files.length})</span></h2>
      <p className="mt-1 text-sm text-muted">Review photos, videos and voice samples here. You can view uploads before approving or linking this account.</p></div>
    {!files.length ? <p className="text-sm text-muted">No files uploaded yet.</p> : <>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter uploaded content">
        {FILTERS.map(({ value, label }) => {
          const count = value === "all" ? files.length : files.filter(file => uploadMedia(file) === value).length;
          if (value === "file" && !count) return null;
          return <button key={value} type="button" aria-pressed={filter === value} onClick={() => { setFilter(value); setLimit(PAGE_SIZE); }} className={`rounded-full border px-3 py-2 text-sm ${filter === value ? "border-accent bg-accent text-white" : "border-line"}`}>{label} ({count})</button>;
        })}
      </div>
      <p className="text-xs text-muted" role="status">Showing {Math.min(limit, matching.length)} of {matching.length} files</p>
      {matching.length ? <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{matching.slice(0, limit).map(file => <UploadCard key={file.id} accountId={accountId} file={file} />)}</ul> : <p className="text-sm text-muted">No {filter === "photo" ? "photos" : filter === "video" ? "videos" : filter === "audio" ? "audio files" : "files"} uploaded yet.</p>}
      {limit < matching.length && <button type="button" onClick={() => setLimit(count => count + PAGE_SIZE)} className="w-full rounded-lg border border-line px-4 py-3 text-sm font-medium">Show more ({matching.length - limit} remaining)</button>}
    </>}
  </section>;
}
