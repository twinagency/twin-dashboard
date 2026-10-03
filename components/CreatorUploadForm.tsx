"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type SyntheticEvent } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { creatorUploadMaxBytes, creatorUploadSizeError } from "@/lib/creator-upload-limits";
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

export default function CreatorUploadForm({
  kind, label, accept, formatHint, locked, voice = false,
}: {
  kind: string;
  label: string;
  accept: string;
  formatHint?: string;
  locked: boolean;
  voice?: boolean;
}) {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  // Only retry files that have not been confirmed by the server.
  const pending = useRef<File[]>([]);
  const [selected, setSelected] = useState<File[]>([]);
  const [uploaded, setUploaded] = useState(0);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [percent, setPercent] = useState<number | null>(null);
  const isVideo = kind.endsWith("_video");
  // Let iOS offer its native video picker without a restrictive MIME conversion request.
  // File signatures, container, codec, duration and size are still checked on the server.
  const pickerAccept = isVideo ? "video/*" : accept;

  function selectFiles(event: SyntheticEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files || []);
    // Safari may emit an empty event when Photos is cancelled or cannot export a video.
    // Never discard the existing queue on that event.
    if (!files.length) return;
    pending.current = files;
    setSelected(files);
    setUploaded(0);
    setPercent(null);
    const invalid = files.find(file => file.size === 0 || file.size > creatorUploadMaxBytes(kind));
    setFailed(!!invalid);
    setMessage(invalid ? invalid.size === 0
      ? `${invalid.name} was not loaded from your device. Download the original video to your phone and select it again.`
      : `${invalid.name} is ${(invalid.size / 1024 / 1024).toFixed(1)} MB. ${creatorUploadSizeError(kind)}` : "");
  }

  function send(form: FormData): Promise<{ status: number; url: string; result: { status?: string } | null }> {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("POST", "/creator-auth/upload");
      request.setRequestHeader("Accept", "application/json");
      request.timeout = 20 * 60 * 1000;
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) setPercent(Math.min(100, Math.round(event.loaded / event.total * 100)));
      };
      request.onload = () => {
        let result = null;
        try { result = JSON.parse(request.responseText); } catch { /* Handle proxy HTML errors by status below. */ }
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
      if (!pending.current.length) setMessage("No file was added. If Photos closes without adding your video, save the video to Files, then choose it using Choose Files.");
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

  async function uploadOne(file: File): Promise<void> {
    const form = new FormData();
    form.set("kind", kind);
    form.append("files", file);
    for (let attempt = 0; ; attempt++) {
      setPercent(0);
      const response = await send(form);
      const result = response.result;
      const url = new URL(response.url);
      const status = result?.status || (url.origin === window.location.origin && url.pathname === "/creator/onboarding"
        ? url.searchParams.get("status") : null);
      if (status === "upload_busy" && attempt < 24) {
        setMessage(`Waiting for an upload slot for ${file.name}… Keep this page open.`);
        await new Promise<void>((resolve) => setTimeout(resolve, 5000));
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
    if (working || locked) return;
    const queue = pending.current;
    setFailed(false);
    if (!queue.length) { setFailed(true); return setMessage(uploadErrors.upload_empty); }
    const max = creatorUploadMaxBytes(kind);
    const tooLarge = queue.find((file) => file.size > max);
    if (tooLarge) { setFailed(true); return setMessage(`${tooLarge.name} is ${(tooLarge.size / 1024 / 1024).toFixed(1)} MB. ${creatorUploadSizeError(kind)}`); }
    if (queue.some(file => file.size === 0)) { setFailed(true); return setMessage("A selected file is empty. Download it to your device and select it again."); }
    setWorking(true);
    let complete = uploaded;
    try {
      for (const file of queue) {
        setMessage(`Uploading ${file.name} · ${complete + 1} of ${selected.length}. Keep this page open.`);
        await uploadOne(file);
        pending.current = pending.current.slice(1);
        complete += 1;
        setUploaded(complete);
      }
      if (inputRef.current) inputRef.current.value = "";
      setSelected([]);
      setUploaded(0);
      setMessage(`${complete} file${complete === 1 ? "" : "s"} uploaded and verified. You can choose more content or continue.`);
      // Refresh counts without discarding files selected in the other categories.
      router.refresh();
    } catch (error) {
      setFailed(true);
      setMessage(`${error instanceof Error ? error.message : uploadErrors.upload_error} ${pending.current.length} file${pending.current.length === 1 ? "" : "s"} remaining.`);
      if (complete > uploaded) router.refresh();
    } finally {
      setWorking(false);
      setPercent(null);
    }
  }

  return <form action="/creator-auth/upload" method="post" encType="multipart/form-data" onSubmit={submit}
    className="mt-5 grid gap-3" aria-label={`Upload ${label.toLowerCase()}`}>
    <input type="hidden" name="kind" value={kind} />
    <label htmlFor={inputId} className="text-sm font-medium text-ink">{label}</label>
    <label className={`${buttonVariants({ size: "lg" })} ${RED_BUTTON} relative w-full overflow-hidden focus-within:ring-2 focus-within:ring-red-500 ${working || locked ? "pointer-events-none opacity-50" : "cursor-pointer"}`} data-choose-content>
      <Upload className="size-4" aria-hidden="true" /> {voice ? "Choose voice recordings" : "Choose content"}
      <input ref={inputRef} id={inputId} name="files" type="file" accept={pickerAccept} multiple disabled={working || locked}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-describedby={`${inputId}-hint`}
        aria-label={`Choose ${label.toLowerCase()}`} onChange={selectFiles} onInput={selectFiles}
        />
    </label>
    <p id={`${inputId}-hint`} className="text-xs leading-5 text-muted">{formatHint || "Voice or video recordings · up to 64 MB each"}. Select multiple files; they upload one at a time.</p>
    {selected.length > 0 && <p className="break-words text-sm text-ink" aria-live="polite">
      {selected.length} file{selected.length === 1 ? "" : "s"} selected{uploaded > 0 ? ` · ${uploaded} uploaded` : ""}: {selected.slice(uploaded, uploaded + 3).map(file => file.name).join(", ")}{selected.length - uploaded > 3 ? "…" : ""}
    </p>}
    <Button type="submit" size="lg" disabled={working || locked || selected.length === 0} className={`${RED_BUTTON} w-full`} data-upload-content>
      {working ? "Uploading…" : failed && pending.current.length ? "Retry remaining files" : voice ? "Upload voice" : "Upload content"}
    </Button>
    {working && percent !== null && <div role="status" aria-live="polite" className="text-sm text-ink">
      <progress value={percent} max={100} className="h-2 w-full accent-red-600" aria-label="Current file upload progress" />
      {percent < 100 ? `${percent}% uploaded` : "Upload received. Verifying and saving your file…"}
    </div>}
    {selected.length > 0 && !working && <button type="button" className="text-sm underline" onClick={() => {
      pending.current = []; setSelected([]); setUploaded(0); setFailed(false); setMessage("");
      if (inputRef.current) inputRef.current.value = "";
    }}>Clear selection</button>}
    {locked && <p className="text-sm text-muted">Uploads are unavailable for this application. Please contact support.</p>}
    {message && <p role={failed ? "alert" : "status"} aria-live="polite" className={`break-words text-sm ${failed ? "text-red-700" : "text-ink"}`}>{message}</p>}
  </form>;
}

