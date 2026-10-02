"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const RED_BUTTON = "min-h-11 bg-[#dc2626] text-white hover:bg-[#b91c1c] focus-visible:ring-red-500/40";
const uploadErrors: Record<string, string> = {
  upload_busy: "Uploads are busy right now. Your files are still selected; please retry in a moment.",
  upload_empty: "Choose at least one file.",
  upload_too_large: "Images must be under 15 MB; voice and video files must be under 64 MB.",
  upload_wrong_type: "This file could not be verified. Use JPG, PNG, WebP or GIF images (up to 25 MP), MP4, MOV or WebM video, or an audio recording for voice. Export HEIC photos as JPG first.",
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
      const response = await fetch("/creator-auth/upload", {
        method: "POST", body: form, credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      // Explicit JSON avoids treating an unrelated redirect/page as an upload result.
      const result = response.headers.get("content-type")?.includes("application/json")
        ? await response.json() : null;
      const url = new URL(response.url);
      const status = result?.status || (url.origin === window.location.origin && url.pathname === "/creator/onboarding"
        ? url.searchParams.get("status") : null);
      if (status === "upload_busy" && attempt < 24) {
        setMessage(`Waiting for an upload slot for ${file.name}… Keep this page open.`);
        await new Promise<void>((resolve) => setTimeout(resolve, 5000));
        continue;
      }
      if (response.ok && (status === "content_saved" || status === "voice_saved")) return;
      if (response.status === 401 || url.pathname.endsWith("/login")) throw new Error(uploadErrors.session_expired);
      if (response.status === 413) throw new Error(uploadErrors.upload_too_large);
      throw new Error(uploadErrors[status || ""] || uploadErrors.upload_error);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (working || locked) return;
    const queue = pending.current;
    setFailed(false);
    if (!queue.length) { setFailed(true); return setMessage(uploadErrors.upload_empty); }
    const max = kind.endsWith("_image") ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
    const tooLarge = queue.find((file) => file.size > max);
    if (tooLarge) { setFailed(true); return setMessage(`${tooLarge.name} is too large. ${uploadErrors.upload_too_large}`); }
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
    }
  }

  return <form action="/creator-auth/upload" method="post" encType="multipart/form-data" onSubmit={submit}
    className="mt-5 grid gap-3" aria-label={`Upload ${label.toLowerCase()}`}>
    <input type="hidden" name="kind" value={kind} />
    <label htmlFor={inputId} className="text-sm font-medium text-ink">{label}</label>
    <input ref={inputRef} id={inputId} name="files" type="file" accept={accept} multiple disabled={working || locked}
      className="sr-only" tabIndex={-1} aria-describedby={`${inputId}-hint`}
      onChange={(event) => {
        pending.current = Array.from(event.target.files || []);
        setSelected(pending.current);
        setUploaded(0);
        setMessage("");
        setFailed(false);
      }} />
    <Button type="button" size="lg" disabled={working || locked} onClick={() => inputRef.current?.click()}
      className={`${RED_BUTTON} w-full`} aria-controls={inputId} aria-label={`Choose ${label.toLowerCase()}`} data-choose-content>
      <Upload className="size-4" aria-hidden="true" /> {voice ? "Choose voice recordings" : "Choose content"}
    </Button>
    <p id={`${inputId}-hint`} className="text-xs leading-5 text-muted">{formatHint || "Voice or video recordings · up to 64 MB each"}. Select multiple files; they upload one at a time.</p>
    {selected.length > 0 && <p className="break-words text-sm text-ink" aria-live="polite">
      {selected.length} file{selected.length === 1 ? "" : "s"} selected{uploaded > 0 ? ` · ${uploaded} uploaded` : ""}: {selected.slice(uploaded, uploaded + 3).map(file => file.name).join(", ")}{selected.length - uploaded > 3 ? "…" : ""}
    </p>}
    <Button type="submit" size="lg" disabled={working || locked || selected.length === 0} className={`${RED_BUTTON} w-full`} data-upload-content>
      {working ? "Uploading…" : failed && pending.current.length ? "Retry remaining files" : voice ? "Upload voice" : "Upload content"}
    </Button>
    {locked && <p className="text-sm text-muted">Uploads are unavailable for this application. Please contact support.</p>}
    {message && <p role={failed ? "alert" : "status"} aria-live="polite" className={`break-words text-sm ${failed ? "text-red-700" : "text-ink"}`}>{message}</p>}
  </form>;
}
