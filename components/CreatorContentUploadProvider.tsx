"use client";
import { useFlirtCreatorLocale } from "./FlirtCreatorLocale";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { recoverableUploadQueue } from "@/lib/creator-upload-recovery";
import { inCreatorUploadSlot } from "@/lib/creator-upload-queue";
import { creatorUploadMaxBytes, creatorUploadSizeError } from "@/lib/creator-upload-limits";
import { useCreatorContentFolders } from "./useCreatorContentFolders";
import { contentMediaKind } from "@/lib/creator-content-intake";
import { navigateCreatorSetup } from "@/lib/creator-setup-navigation";

type State = "queued" | "uploading" | "saving" | "saved" | "failed" | "reselect";
export type ContentUploadItem = { id: string; name: string; size: number; lastModified: number; state: State; percent: number; file?: File; error?: string };
type Queue = { items: ContentUploadItem[]; working: boolean; add: (files: File[]) => void; retry: (id: string) => void; remove: (id: string) => boolean; revision: number; folderPending: boolean; folder: ReturnType<typeof useCreatorContentFolders> };
const Context = createContext<Queue | null>(null);
export const useContentUploads = () => useContext(Context);
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const retryable = new Set(["upload_busy", "upload_error", "upload_storage_error", "upload_metadata_error", "upload_staging_full", "upload_staging_error", "upload_interrupted", "upload_timeout"]);
const errors: Record<string, string> = {
  upload_wrong_type: "Use JPG, PNG, WebP or GIF photos, or MP4, MOV or WebM videos. Export HEIC photos as JPG first.",
  upload_video_too_long: "This video is longer than 30 minutes.", upload_video_resolution: "Export this video at 4K or lower.",
  upload_quota: "Your account storage is full. Your other files are saved. Contact support.",
  application_locked: "This application is locked. Contact support.",
  upload_conflict: "This file differs from the original. Remove it from this selection, then add it again.",
  upload_removed: "This file was removed. Remove it from this selection, then add it again.",
};
export function CreatorContentUploadProvider({ accountId, children }: { accountId: string; children: ReactNode }) {
  const router = useContext(AppRouterContext);
  const key = `creator-content-queue:${accountId}`;
  const ref = useRef<ContentUploadItem[]>([]), running = useRef(false), active = useRef(new Set<string>());
  const [items, setItems] = useState<ContentUploadItem[]>([]), [working, setWorking] = useState(false), [revision, setRevision] = useState(0);
  const alive = useRef(true);
  const folder = useCreatorContentFolders(accountId);
  const folderPending = folder.pending;
  function replace(next: ContentUploadItem[]) {
    if (!alive.current) return;
    ref.current = next; setItems(next);
    try { localStorage.setItem(key, JSON.stringify(next.map(({ file: _file, ...metadata }) => metadata))); } catch { /* Continue without recovery storage. */ }
  }
  function update(id: string, patch: Partial<ContentUploadItem>) { replace(ref.current.map(item => item.id === id ? { ...item, ...patch } : item)); }
  async function status(id: string) {
    const response = await fetch(`/creator-auth/uploads?ids=${id}`, { cache: "no-store" });
    if (response.status === 401 || response.status === 403) throw new Error("Sign in again, then reselect unfinished files. Saved content is safe.");
    if (!response.ok) throw new Error("Could not check whether this file is saved. Retry shortly.");
    return (await response.json()).uploads?.[0]?.state as string | undefined;
  }
  function send(item: ContentUploadItem): Promise<{ code: number; status?: string }> {
    return new Promise(resolve => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/creator-auth/upload"); xhr.setRequestHeader("Accept", "application/json"); xhr.setRequestHeader("X-Creator-Upload-Id", item.id);
      xhr.timeout = 20 * 60 * 1000;
      xhr.upload.onprogress = event => { if (event.lengthComputable) update(item.id, { percent: Math.round(event.loaded / event.total * 100), state: event.loaded === event.total ? "saving" : "uploading" }); };
      xhr.upload.onload = () => update(item.id, { state: "saving", percent: 100 });
      xhr.onload = () => { let body: { status?: string } = {}; try { body = JSON.parse(xhr.responseText); } catch {} resolve({ code: xhr.status, status: body.status }); };
      xhr.onerror = xhr.onabort = () => resolve({ code: 0, status: "upload_interrupted" });
      xhr.ontimeout = () => resolve({ code: 0, status: "upload_timeout" });
      const body = new FormData(); body.set("kind", "content"); body.append("files", item.file!); xhr.send(body);
    });
  }
  async function upload(item: ContentUploadItem) {
    const media = contentMediaKind(item.file || { name: item.name });
    if (!item.file) throw new Error("Reselect the original file to continue.");
    if (!media) throw new Error(errors.upload_wrong_type);
    if (!item.size) throw new Error("This file is empty. Download the original to your phone and select it again.");
    if (item.size > creatorUploadMaxBytes(`content_${media}`)) throw new Error(creatorUploadSizeError(`content_${media}`));
    for (let attempt = 0; attempt < 5; attempt++) {
      if (!alive.current) return;
      // Reconcile before every retry, including a lost successful response.
      let prior: string | undefined;
      try { prior = await status(item.id); }
      catch (reason) {
        if (attempt === 4 || (reason instanceof Error && reason.message.startsWith("Sign in"))) throw reason;
        update(item.id, { state: "saving", error: "Connection interrupted. Retrying automatically…" });
        await delay(Math.min(1000 * 2 ** attempt, 8000)); continue;
      }
      if (prior === "saved") return;
      if (prior === "removed") throw new Error(errors.upload_removed);
      if (prior === "processing") {
        update(item.id, { state: "saving", error: "Still saving. Checking again…" });
        await delay(Math.min(1000 * 2 ** attempt, 8000)); continue;
      }
      update(item.id, { state: "uploading", percent: 0, error: undefined });
      const response = await send(item);
      if (response.code >= 200 && response.code < 300 && response.status === "content_saved") return;
      if (response.code === 401 || response.code === 403) throw new Error("Sign in again, then retry this file.");
      if (response.code === 413 || response.status === "upload_too_large") throw new Error(creatorUploadSizeError(`content_${media}`));
      if (!retryable.has(response.status || "") && response.code < 500) throw new Error(errors[response.status || ""] || "This file could not be saved. Retry this file.");
      update(item.id, { state: "saving", error: "Connection interrupted. Retrying automatically…" });
      await delay(Math.min(1000 * 2 ** attempt, 8000));
    }
    if (await status(item.id) === "saved") return;
    throw new Error("Not yet confirmed saved. Retry this file; saved files will not upload again.");
  }
  async function pump() {
    if (running.current || !alive.current) return;
    running.current = true; setWorking(true);
    async function worker() {
      while (alive.current) {
        const item = ref.current.find(candidate => candidate.state === "queued" && candidate.file && !active.current.has(candidate.id));
        if (!item) { if (!active.current.size) break; await delay(30); continue; }
        active.current.add(item.id);
        try { await inCreatorUploadSlot(() => upload(item)); update(item.id, { state: "saved", percent: 100, error: undefined }); if (alive.current) setRevision(value => value + 1); }
        catch (reason) { update(item.id, { state: "failed", error: reason instanceof Error ? reason.message : "Retry this file." }); }
        finally { active.current.delete(item.id); }
      }
    }
    try { await Promise.all([worker(), worker()]); }
    finally {
      running.current = false;
      if (alive.current) { setWorking(false); setRevision(value => value + 1); router?.refresh(); }
    }
  }
  function add(files: File[]) {
    const next = [...ref.current];
    for (const file of files) {
      const index = next.findIndex(item => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified);
      if (index >= 0) {
        const item = next[index];
        if (!active.current.has(item.id)) next[index] = { ...item, file, state: "queued", error: undefined };
      } else next.push({ id: crypto.randomUUID(), name: file.name, size: file.size, lastModified: file.lastModified, file, state: "queued", percent: 0 });
    }
    replace(next); void pump();
  }
  useEffect(() => {
    alive.current = true;
    try {
      const recovered = recoverableUploadQueue(JSON.parse(localStorage.getItem(key) || "[]")) as ContentUploadItem[];
      replace(recovered.map(item => ({ ...item, state: "reselect", percent: 0, error: "Checking previously selected files…" })));
      // The server is authoritative, including files removed in another session.
      void (async () => {
        for (let start = 0; start < recovered.length; start += 100) {
          const batch = recovered.slice(start, start + 100);
          try {
            const response = await fetch(`/creator-auth/uploads?ids=${batch.map(item => item.id).join(",")}`, { cache: "no-store" });
            if (!response.ok) throw new Error("status unavailable");
            const result = await response.json();
            if (!alive.current) return;
            replace(ref.current.flatMap(item => {
              if (item.file) return [item];
              const receipt = result.uploads?.find((entry: { id: string; state: string }) => entry.id === item.id);
              if (!receipt) return [item];
              if (receipt.state === "removed") return [];
              return [{ ...item, state: receipt.state === "saved" ? "saved" : "reselect", percent: receipt.state === "saved" ? 100 : 0, error: receipt.state === "saved" ? undefined : "Reselect the original file to continue." }];
            }));
          } catch {
            for (const item of batch) if (!ref.current.find(row => row.id === item.id)?.file) update(item.id, { state: "reselect", error: "Reselect this file to check its saved status and continue." });
          }
        }
      })();
    } catch {}
    const reconnect = () => { replace(ref.current.map(item => item.state === "failed" && item.file ? { ...item, state: "queued" } : item)); void pump(); };
    window.addEventListener("online", reconnect);
    return () => { alive.current = false; window.removeEventListener("online", reconnect); };
  }, [key]);
  useEffect(() => {
    if (!working && !folderPending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [working, folderPending]);
  return <Context.Provider value={{ items, working, revision, folderPending, folder, add, retry: id => { update(id, { state: "queued", error: undefined }); void pump(); }, remove: id => { if (active.current.has(id)) return false; replace(ref.current.filter(item => item.id !== id)); setRevision(value => value + 1); router?.refresh(); return true; } }}>{children}</Context.Provider>;
}
export function CreatorUploadActivity() {
  const queue = useContentUploads();
  const router = useContext(AppRouterContext);
  const { locale, t } = useFlirtCreatorLocale();
  if (!queue?.items.length) return null;
  const saved = queue.items.filter(item => item.state === "saved").length;
  return <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-white p-3 text-sm" data-content-upload-activity><span role="status">{t(`${saved} of ${queue.items.length} files saved`, `${saved.toLocaleString(locale)} de ${queue.items.length.toLocaleString(locale)} arquivos salvos`)}</span><button type="button" className="min-h-11 font-medium underline" onClick={() => navigateCreatorSetup("/creator/onboarding?step=content", router?.push)}>{t("View uploads", "Ver envios")}</button></div>;
}
