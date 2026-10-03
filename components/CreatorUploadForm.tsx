"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type SyntheticEvent } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { creatorUploadMaxBytes, creatorUploadSizeError } from "@/lib/creator-upload-limits";
import { CREATOR_UPLOAD_CONCURRENCY, inCreatorUploadSlot } from "@/lib/creator-upload-queue";
import { Button, buttonVariants } from "@/components/ui/button";

const RED_BUTTON = "min-h-11 bg-[#dc2626] text-white hover:bg-[#b91c1c] focus-visible:ring-red-500/40";
const uploadErrors: Record<string, string> = {
  upload_busy: "Uploads are busy right now. Your files are still selected; please retry in a moment.",
  upload_empty: "Choose at least one file.",
  upload_too_large: "Images can be up to 15 MB, videos up to 512 MB, and voice recordings up to 64 MB each.",
  upload_wrong_type: "This file could not be verified. Use JPG, PNG, WebP or GIF images (up to 25 MP), MP4, MOV or WebM video, or an audio recording for voice. Export HEIC photos as JPG first.",
  upload_video_too_long: "This video is longer than 30 minutes. Choose a shorter video.",
  upload_video_resolution: "This video is above 4K resolution. Export it at 4K or lower, then retry.",
  upload_interrupted: "The connection was interrupted. Keep this page open and retry the remaining files.",
  upload_timeout: "The upload timed out. Check your connection and retry the remaining files.",
  upload_quota: "This account has reached its upload limit. Contact support.",
  application_locked: "Uploads are unavailable for this application. Please contact support.",
  session_expired: "Your session expired. Sign in again, then choose the remaining files.",
  upload_error: "The upload did not finish. Please retry the remaining files.",
};

type UploadItem = { id: number; file: File; state: "queued" | "uploading" | "saving" | "saved" | "failed"; percent: number; error?: string };

export default function CreatorUploadForm({ kind, label, accept, formatHint, locked, voice = false }: {
  kind: string; label: string; accept: string; formatHint?: string; locked: boolean; voice?: boolean;
}) {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<UploadItem[]>([]);
  const nextId = useRef(0);
  const running = useRef(false);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const isVideo = kind.endsWith("_video");
  const pickerAccept = isVideo ? "video/*" : accept;
  const remaining = items.filter(item => item.state !== "saved");
  const saved = items.length - remaining.length;

  function replaceItems(next: UploadItem[]) { itemsRef.current = next; setItems(next); }
  function updateItem(id: number, patch: Partial<UploadItem>) {
    replaceItems(itemsRef.current.map(item => item.id === id ? { ...item, ...patch } : item));
  }
  function selectFiles(event: SyntheticEvent<HTMLInputElement>) {
    if (running.current || locked) return;
    const files = Array.from(event.currentTarget.files || []);
    if (!files.length) return;
    const current = itemsRef.current.some(item => item.state !== "saved") ? itemsRef.current : [];
    const next = [...current];
    for (const file of files) {
      if (!next.some(item => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified)) {
        next.push({ id: nextId.current++, file, state: "queued", percent: 0 });
      }
    }
    replaceItems(next);
    // Preserve the File objects in our queue; allow picking additional files (or
    // the same file after removing it), without replacing earlier selections.
    event.currentTarget.value = "";
    const invalid = next.find(item => item.file.size === 0 || item.file.size > creatorUploadMaxBytes(kind));
    setFailed(!!invalid);
    setMessage(invalid ? fileError(invalid.file) : "");
  }
  function fileError(file: File) {
    return file.size === 0 ? `${file.name} was not loaded from your device. Download it to your phone and select it again.`
      : `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB. ${creatorUploadSizeError(kind)}`;
  }
  function send(item: UploadItem, form: FormData): Promise<{ status: number; url: string; result: { status?: string } | null }> {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("POST", "/creator-auth/upload");
      request.setRequestHeader("Accept", "application/json");
      request.timeout = 20 * 60 * 1000;
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.min(100, Math.round(event.loaded / event.total * 100));
          updateItem(item.id, { percent, state: percent === 100 ? "saving" : "uploading" });
        }
      };
      request.upload.onload = () => updateItem(item.id, { percent: 100, state: "saving" });
      request.onload = () => {
        let result = null;
        try { result = JSON.parse(request.responseText); } catch { /* Proxy errors are handled by HTTP status. */ }
        resolve({ status: request.status, url: request.responseURL || window.location.href, result });
      };
      request.onerror = () => reject(new Error(uploadErrors.upload_interrupted));
      request.ontimeout = () => reject(new Error(uploadErrors.upload_timeout));
      request.onabort = () => reject(new Error(uploadErrors.upload_interrupted));
      request.send(form);
    });
  }
  useEffect(() => {
    const input = inputRef.current;
    const cancelled = () => {
      if (!itemsRef.current.length) setMessage("No file was added. If Photos closes without adding your videos, save them to Files, then use Choose Files. You can select several or add them to your list in separate selections.");
    };
    input?.addEventListener("cancel", cancelled);
    return () => input?.removeEventListener("cancel", cancelled);
  }, []);
  useEffect(() => {
    if (!working) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [working]);

  async function uploadOne(item: UploadItem): Promise<void> {
    if (!item.file.size || item.file.size > creatorUploadMaxBytes(kind)) throw new Error(fileError(item.file));
    const form = new FormData();
    form.set("kind", kind);
    form.append("files", item.file);
    for (let attempt = 0; ; attempt++) {
      updateItem(item.id, { state: "uploading", percent: 0, error: undefined });
      const response = await send(item, form);
      const url = new URL(response.url);
      const status = response.result?.status || (url.origin === window.location.origin && url.pathname === "/creator/onboarding" ? url.searchParams.get("status") : null);
      if (status === "upload_busy" && attempt < 24) {
        updateItem(item.id, { state: "queued", percent: 0 });
        await new Promise<void>(resolve => setTimeout(resolve, 5000));
        continue;
      }
      if (response.status >= 200 && response.status < 300 && (status === "content_saved" || status === "voice_saved")) return;
      if (response.status === 401 || url.pathname.endsWith("/login")) throw new Error(uploadErrors.session_expired);
      if (response.status === 413) throw new Error(creatorUploadSizeError(kind));
      throw new Error(uploadErrors[status || ""] || uploadErrors.upload_error);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running.current || locked) return;
    const queue = itemsRef.current.filter(item => item.state !== "saved");
    if (!queue.length) return;
    running.current = true;
    setWorking(true); setFailed(false);
    setMessage("Uploading your selection. Up to two files upload together; keep this page open.");
    replaceItems(itemsRef.current.map(item => item.state === "saved" ? item : { ...item, state: "queued", percent: 0, error: undefined }));
    let cursor = 0;
    let completed = 0;
    async function worker() {
      while (cursor < queue.length) {
        const item = queue[cursor++];
        try {
          await inCreatorUploadSlot(() => uploadOne(item));
          updateItem(item.id, { state: "saved", percent: 100 });
          completed += 1;
        } catch (error) {
          updateItem(item.id, { state: "failed", error: error instanceof Error ? error.message : uploadErrors.upload_error });
        }
      }
    }
    try {
      await Promise.all(Array.from({ length: Math.min(CREATOR_UPLOAD_CONCURRENCY, queue.length) }, worker));
      const left = itemsRef.current.filter(item => item.state !== "saved").length;
      const total = itemsRef.current.length - left;
      setFailed(left > 0);
      setMessage(left ? `${total} saved. ${left} file${left === 1 ? "" : "s"} remaining. Retry the remaining files; saved files will not upload again.`
        : `${total} file${total === 1 ? "" : "s"} uploaded and verified. You can choose more content or continue.`);
      if (completed) router.refresh();
    } finally { running.current = false; setWorking(false); }
  }
  return <form action="/creator-auth/upload" method="post" encType="multipart/form-data" onSubmit={submit}
    className="mt-5 grid gap-3" aria-label={`Upload ${label.toLowerCase()}`}>
    <input type="hidden" name="kind" value={kind} />
    <label htmlFor={inputId} className="text-sm font-medium text-ink">{label}</label>
    <label className={`${buttonVariants({ size: "lg" })} ${RED_BUTTON} relative w-full overflow-hidden focus-within:ring-2 focus-within:ring-red-500 ${working || locked ? "pointer-events-none opacity-50" : "cursor-pointer"}`} data-choose-content>
      <Upload className="size-4" aria-hidden="true" /> {remaining.length ? "Add more files" : voice ? "Choose voice recordings" : isVideo ? "Choose videos" : "Choose photos"}
      <input ref={inputRef} id={inputId} name="files" type="file" accept={pickerAccept} multiple disabled={working || locked}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-describedby={`${inputId}-hint`}
        aria-label={`Choose multiple ${label.toLowerCase()}`} onChange={selectFiles} onInput={selectFiles} />
    </label>
    <p id={`${inputId}-hint`} className="text-xs leading-5 text-muted">{formatHint || "Voice or video recordings · up to 64 MB each"}. Select several files, then upload them together. You can add more files to your selection.</p>
    {items.length > 0 && <>
      <p className="text-sm text-ink" aria-live="polite">{items.length} file{items.length === 1 ? "" : "s"} selected · {saved} saved</p>
      <ul className="max-h-72 space-y-3 overflow-y-auto rounded-lg border border-line p-3" aria-label="Selected files">
        {items.map(item => <li key={item.id} className="text-sm">
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 break-words text-ink">{item.file.name} <span className="text-muted">({(item.file.size / 1024 / 1024).toFixed(1)} MB)</span></span>
            {!working && item.state !== "saved" && <button type="button" className="shrink-0 underline" aria-label={`Remove ${item.file.name}`} onClick={() => replaceItems(itemsRef.current.filter(other => other.id !== item.id))}>Remove</button>}
          </div>
          <span className={item.state === "failed" ? "text-red-700" : "text-muted"}>
            {item.state === "saved" ? "Saved ✓" : item.state === "saving" ? "Verifying and saving…" : item.state === "uploading" ? `${item.percent}% uploaded` : item.state === "failed" ? item.error : working ? "Waiting…" : "Ready to upload"}
          </span>
          {(item.state === "uploading" || item.state === "saving") && <progress value={item.percent} max={100} className="h-2 w-full accent-red-600" aria-label={`Upload progress for ${item.file.name}`} />}
        </li>)}
      </ul>
    </>}
    <Button type="submit" size="lg" disabled={working || locked || !remaining.length} className={`${RED_BUTTON} w-full`} data-upload-content>
      {working ? `Uploading · ${saved} of ${items.length} saved` : failed && remaining.length ? `Retry ${remaining.length} remaining file${remaining.length === 1 ? "" : "s"}` : remaining.length ? `Upload ${remaining.length} file${remaining.length === 1 ? "" : "s"}` : voice ? "Upload voice" : "Upload content"}
    </Button>
    {items.length > 0 && !working && <button type="button" className="text-sm underline" onClick={() => { replaceItems([]); setFailed(false); setMessage(""); }}>Clear selection</button>}
    {locked && <p className="text-sm text-muted">Uploads are unavailable for this application. Please contact support.</p>}
    {message && <p role={failed ? "alert" : "status"} aria-live="polite" className={`break-words text-sm ${failed ? "text-red-700" : "text-ink"}`}>{message}</p>}
  </form>;
}
