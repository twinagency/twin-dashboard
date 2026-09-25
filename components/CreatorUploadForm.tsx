"use client";

import { useRef, useState, type FormEvent } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const busyDelays = [1500, 3000, 5000, 7000];

const uploadErrors: Record<string, string> = {
  upload_busy: "Another upload is being checked. Please try the remaining files again.",
  upload_empty: "Choose at least one file.",
  upload_too_large: "This file is too large. Images must be under 15 MB; voice and video files must be under 64 MB.",
  upload_wrong_type: "This file could not be verified. Use JPG, PNG, WebP or GIF for images, MP4, MOV or WebM for video, or an audio recording for voice.",
  upload_quota: "This account has reached its upload limit. Contact support.",
  upload_error: "The upload did not finish. Please retry the remaining files.",
};

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

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
  const inputRef = useRef<HTMLInputElement>(null);
  // Keep only files that have not yet been confirmed by the server. A retry
  // must never silently upload the successful part of a batch again.
  const pending = useRef<File[]>([]);
  const [selected, setSelected] = useState(0);
  const [uploaded, setUploaded] = useState(0);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  async function uploadOne(file: File): Promise<string> {
    const form = new FormData();
    form.set("kind", kind);
    form.append("files", file);
    for (let attempt = 0; ; attempt++) {
      const response = await fetch("/creator-auth/upload", {
        method: "POST",
        body: form,
        credentials: "same-origin",
      });
      const url = new URL(response.url);
      const status = url.origin === window.location.origin && url.pathname === "/creator/onboarding"
        ? url.searchParams.get("status")
        : null;
      if (status === "upload_busy" && attempt < busyDelays.length) {
        await wait(busyDelays[attempt]);
        continue;
      }
      if (status === "content_saved" || status === "voice_saved") return status;
      if (url.pathname.endsWith("/login")) throw new Error("Your session expired. Sign in again, then retry the remaining files.");
      throw new Error(uploadErrors[status || ""] || "This file did not upload. Please retry the remaining files.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (working || locked) return;
    const queue = pending.current.length ? pending.current : Array.from(inputRef.current?.files || []);
    if (!queue.length) return setMessage(uploadErrors.upload_empty);
    const max = kind.endsWith("_image") ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
    const tooLarge = queue.find((file) => file.size > max);
    if (tooLarge) return setMessage(`${tooLarge.name} is too large. ${uploadErrors.upload_too_large}`);
    pending.current = queue;
    setMessage("");
    setWorking(true);
    let complete = uploaded;
    try {
      for (const file of queue) {
        setMessage(`Uploading ${file.name} · ${complete + 1} of ${selected || queue.length}`);
        await uploadOne(file);
        pending.current = pending.current.slice(1);
        complete += 1;
        setUploaded(complete);
      }
      pending.current = [];
      if (inputRef.current) inputRef.current.value = "";
      window.location.assign(`/creator/onboarding?step=${kind === "voice" ? "voice" : "content"}&status=${kind === "voice" ? "voice_saved" : "content_saved"}#step-result`);
    } catch (error) {
      setMessage(`${error instanceof Error ? error.message : uploadErrors.upload_error} ${pending.current.length} file${pending.current.length === 1 ? "" : "s"} remaining.`);
    } finally {
      setWorking(false);
    }
  }

  const picker = <label className={voice ? "flex-1" : ""}>
    <span className={voice ? "mb-1 block text-sm text-muted" : "mb-1.5 block text-sm font-medium text-ink"}>{voice ? "Voice recordings" : `Choose ${label.toLowerCase()}`}</span>
    <Input ref={inputRef} name="files" type="file" accept={accept} multiple disabled={working || locked}
      onChange={(event) => {
        pending.current = Array.from(event.target.files || []);
        setSelected(pending.current.length);
        setUploaded(0);
        setMessage("");
      }}
      className={voice ? "h-auto border-[#7b8798] py-2" : "h-auto min-h-11 border-[#7b8798] py-2 text-sm"} />
    {formatHint && <span className="mt-1.5 block text-xs text-muted">{formatHint}</span>}
  </label>;

  return <form action="/creator-auth/upload" method="post" encType="multipart/form-data" onSubmit={submit}
    className={voice ? "flex flex-col gap-3 sm:flex-row sm:items-end" : "mt-5 grid gap-3"}>
    <input type="hidden" name="kind" value={kind} />
    {picker}
    {voice
      ? <Button type="submit" variant="outline" size="lg" disabled={working || locked} className="min-h-11">{working ? "Uploading…" : "Upload voice"}</Button>
      : <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-muted">Select multiple files. They upload one at a time, up to 64 MB each.</span>
          <Button type="submit" size="lg" disabled={working || locked} className="min-h-11"><Upload className="size-4" aria-hidden="true" /> {working ? "Uploading…" : "Upload"}</Button>
        </div>}
    {(working || message) && <p role={working ? "status" : "alert"} aria-live="polite" className="text-sm text-ink">{message || `Uploading ${uploaded + 1} of ${selected}`}</p>}
  </form>;
}
