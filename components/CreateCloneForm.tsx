"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Clone } from "@/lib/types";
import type { OrModel } from "@/app/api/models/route";
import IntakeFields from "./IntakeFields";
import PersonaFactsFields from "./clone/PersonaFactsFields";
import ConfigSections from "./clone/ConfigSections";
import { Section, inputCls } from "./clone/fields";
import { useCloneConfig } from "./clone/useCloneConfig";
import { createCloneRow, deleteClone, compileCloneAction } from "@/app/clones/actions";
import { uploadPhoto, uploadVideo, createBundle, addBundleItem } from "@/app/media/actions";
import {
  DEFAULT_PHOTO_BUNDLE_PRICE_STARS,
  MAX_PHOTO_BUNDLE_PRICE_STARS,
  MIN_PAID_MEDIA_PRICE_STARS,
} from "@/lib/pricing";

// ── Staged (browser-only) media types ──────────────────────────────────────────
type StagedPhoto = { id: number; file: File; caption: string; teaser: string; stars: string; name: string; captioning: boolean };
type StagedVideo = { id: number; file: File; caption: string; teaser: string; stars: string };
type StagedBundle = { id: number; name: string; caption: string; stars: string; onboarding: boolean; files: File[] };

type TaskStatus = "pending" | "running" | "done" | "error";
type Task = { label: string; status: TaskStatus; error?: string };

let _seq = 1;
const nextId = () => _seq++;

export default function CreateCloneForm({ defaults = {} }: { defaults?: Partial<Clone> }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [models, setModels] = useState<OrModel[]>([]);

  // All clone settings share the exact same fields as Configure (edit). A fresh
  // clone inherits the global "new-clone defaults" (Settings), falling back to the
  // built-in defaults baked into useCloneConfig / ConfigSections.
  const [cfg, set] = useCloneConfig(defaults);

  // Staged media (browser only — nothing uploaded until Create)
  const [photos, setPhotos] = useState<StagedPhoto[]>([]);
  const [videos, setVideos] = useState<StagedVideo[]>([]);
  const [bundles, setBundles] = useState<StagedBundle[]>([]);

  // Create orchestration
  const [running, setRunning] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const cloneIdRef = useRef<string | null>(null);

  useEffect(() => {
    fetch("/api/models").then((r) => r.json()).then((d) => Array.isArray(d) && setModels(d)).catch(() => {});
  }, []);

  // ── Photo staging ───────────────────────────────────────────────────────────
  function addPhotos(files: File[]) {
    const staged = files.map((f) => ({
      id: nextId(), file: f, caption: "", teaser: "", stars: "",
      name: f.name.replace(/\.[^.]+$/, ""), captioning: false,
    }));
    setPhotos((prev) => [...prev, ...staged]);
  }
  const setPhoto = (id: number, patch: Partial<StagedPhoto>) =>
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  function addVideos(files: File[]) {
    setVideos((prev) => [...prev, ...files.map((f) => ({ id: nextId(), file: f, caption: "", teaser: "", stars: "" }))]);
  }
  const setVideo = (id: number, patch: Partial<StagedVideo>) =>
    setVideos((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));

  function addBundle() {
    setBundles((prev) => [...prev, {
      id: nextId(),
      name: "",
      caption: "",
      stars: String(DEFAULT_PHOTO_BUNDLE_PRICE_STARS),
      onboarding: false,
      files: [],
    }]);
  }
  const setBundle = (id: number, patch: Partial<StagedBundle>) =>
    setBundles((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  // Only create media for features that are turned ON.
  const effPhotos = () => (cfg.photosEnabled ? photos : []);
  const effVideos = () => (cfg.videosEnabled ? videos : []);
  const effBundles = () => (cfg.photosEnabled ? bundles : []);

  // ── Create: run all tasks sequentially ──────────────────────────────────────
  function buildTasks(): Task[] {
    const t: Task[] = [{ label: "Create creator", status: "pending" }];
    effPhotos().forEach((p) => t.push({ label: `Photo: ${p.name || p.file.name}`, status: "pending" }));
    effVideos().forEach((v) => t.push({ label: `Video: ${v.file.name}`, status: "pending" }));
    effBundles().forEach((b) => t.push({ label: `Bundle: ${b.name || "(unnamed)"}`, status: "pending" }));
    t.push({ label: "Compile prompts", status: "pending" });
    return t;
  }

  // The actual work for task index i. Reads cloneIdRef for media steps.
  async function runTask(i: number) {
    const cloneId = cloneIdRef.current;
    const ph = effPhotos(), vid = effVideos(), bun = effBundles();
    if (i === 0) {
      const fd = new FormData(formRef.current!);
      cloneIdRef.current = await createCloneRow(fd);
      return;
    }
    let idx = i - 1;
    if (idx < ph.length) {
      const p = ph[idx];
      const fd = new FormData();
      fd.append("file", p.file); fd.append("caption", p.caption); fd.append("teaser_caption", p.teaser);
      fd.append("star_value", p.stars); fd.append("image_name", p.name);
      await uploadPhoto(cloneId!, fd);
      return;
    }
    idx -= ph.length;
    if (idx < vid.length) {
      const v = vid[idx];
      const fd = new FormData();
      fd.append("file", v.file); fd.append("caption", v.caption); fd.append("teaser_caption", v.teaser);
      fd.append("star_value", v.stars);
      await uploadVideo(cloneId!, fd);
      return;
    }
    idx -= vid.length;
    if (idx < bun.length) {
      const b = bun[idx];
      const bfd = new FormData();
      bfd.append("name", b.name || "Bundle"); bfd.append("caption", b.caption);
      bfd.append("star_price", b.stars); if (b.onboarding) bfd.append("is_onboarding", "on");
      const bundleId = await createBundle(cloneId!, bfd);
      for (const file of b.files) {
        const ifd = new FormData(); ifd.append("file", file);
        await addBundleItem(bundleId, cloneId!, ifd);
      }
      return;
    }
    // last: compile
    await compileCloneAction(cloneId!);
  }

  const setStatus = (i: number, status: TaskStatus, error?: string) =>
    setTasks((prev) => prev.map((t, j) => (j === i ? { ...t, status, error } : t)));

  // Run a set of task indices concurrently with a small cap.
  async function runConcurrent(indices: number[], limit = 4): Promise<number[]> {
    const failed: number[] = [];
    let cursor = 0;
    async function worker() {
      while (cursor < indices.length) {
        const i = indices[cursor++];
        setStatus(i, "running");
        try {
          await runTask(i);
          setStatus(i, "done");
        } catch (err) {
          failed.push(i);
          setStatus(i, "error", err instanceof Error ? err.message : "failed");
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, indices.length) }, worker));
    return failed;
  }

  // Create the clone row first (everything else needs its id), then run the media
  // + compile steps in parallel.
  async function runAll(indices: number[]): Promise<boolean> {
    if (indices.includes(0)) {
      setStatus(0, "running");
      try {
        const fd = new FormData(formRef.current!);
        cloneIdRef.current = await createCloneRow(fd);
        setStatus(0, "done");
      } catch (err) {
        setStatus(0, "error", err instanceof Error ? err.message : "failed");
        return false;
      }
    }
    const rest = indices.filter((i) => i !== 0);
    const failed = await runConcurrent(rest);
    return failed.length === 0;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formRef.current?.reportValidity()) return;
    setRunning(true);
    cloneIdRef.current = null;
    const list = buildTasks();
    setTasks(list);
    const ok = await runAll(list.map((_, i) => i));
    if (ok && cloneIdRef.current) router.push(`/clones/${cloneIdRef.current}`);
  }

  // Retry only the steps that failed.
  async function retryFailed() {
    const indices = tasks.map((t, i) => (t.status === "error" ? i : -1)).filter((i) => i >= 0);
    const ok = await runAll(indices);
    if (ok && cloneIdRef.current && !tasks.some((t) => t.status === "error")) {
      router.push(`/clones/${cloneIdRef.current}`);
    }
  }

  async function abortAndDelete() {
    if (!confirm("Delete this half-created creator and start over?")) return;
    if (cloneIdRef.current) await deleteClone(cloneIdRef.current);
    cloneIdRef.current = null;
    setTasks([]);
    setRunning(false);
  }

  const hasFailed = tasks.some((t) => t.status === "error");

  return (
    <form ref={formRef} onSubmit={handleCreate} className="grid gap-6">
      {/* Every clone setting, identical to Configure. `defaults` seeds the
          uncontrolled model fields from the global new-clone template. */}
      <ConfigSections cfg={cfg} set={set} clone={defaults} models={models} mode="create" />

      {/* Typed persona facts - injected deterministically, never AI-compiled. */}
      <PersonaFactsFields cfg={cfg} set={set} />

      {/* Onboarding questionnaire - compiled into her personality on Create. */}
      <Section title="Onboarding questionnaire" hint="The writing only you can do: how she texts, her life, her quirks. On Create, the AI compiles these (grounded by the typed facts above) into her personality.">
        <IntakeFields />
      </Section>

      {/* ── Media (staged in browser) ── */}
      {cfg.photosEnabled && (
        <Section title={`Photos${photos.length ? ` (${photos.length})` : ""}`} hint="The AI captions each one in the next step. You'll review them before going live.">
          <FilePicker label="Add photos (any format: HEIC, JPG, PNG, WebP)" accept="image/*,.heic,.heif" onFiles={addPhotos} />
          {photos.map((p) => (
            <div key={p.id} className="grid gap-2 rounded-lg border border-line bg-bg p-4 text-xs/40">
              <div className="flex gap-3">
                <FilePreview file={p.file} kind="photo" className="h-24 w-24 shrink-0 rounded object-cover" />
                <div className="grid flex-1 content-start gap-2">
                  <div className="flex items-center justify-between">
                    <span className="truncate font-medium">{p.file.name}</span>
                    <button type="button" onClick={() => setPhotos((prev) => prev.filter((x) => x.id !== p.id))} className="text-muted hover:text-crit">✕</button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label>Name<input value={p.name} onChange={(e) => setPhoto(p.id, { name: e.target.value })} className={inputCls} /></label>
                    <label>⭐ Price<input type="number" min={MIN_PAID_MEDIA_PRICE_STARS} step={1} value={p.stars} onChange={(e) => setPhoto(p.id, { stars: e.target.value })} placeholder="Auto from guide" className={inputCls} /></label>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </Section>
      )}

      {cfg.videosEnabled && (
        <Section title={`Videos${videos.length ? ` (${videos.length})` : ""}`} hint="The AI captions each one (from a frame) in the next step. You'll review before going live.">
          <FilePicker label="Add videos (max 50MB each)" accept="video/*" onFiles={addVideos} />
          {videos.map((v) => (
            <div key={v.id} className="grid gap-2 rounded-lg border border-line bg-bg p-4 text-xs/40">
              <div className="flex gap-3">
                <FilePreview file={v.file} kind="video" className="h-24 w-24 shrink-0 rounded object-cover" />
                <div className="grid flex-1 content-start gap-2">
                  <div className="flex items-center justify-between">
                    <span className="truncate font-medium">{v.file.name}</span>
                    <button type="button" onClick={() => setVideos((prev) => prev.filter((x) => x.id !== v.id))} className="text-muted hover:text-crit">✕</button>
                  </div>
                  <label>⭐ Price<input type="number" min={MIN_PAID_MEDIA_PRICE_STARS} step={1} value={v.stars} onChange={(e) => setVideo(v.id, { stars: e.target.value })} placeholder="Auto from guide" className={inputCls} /></label>
                </div>
              </div>
            </div>
          ))}
        </Section>
      )}

      {cfg.photosEnabled && (
        <Section title={`Bundles${bundles.length ? ` (${bundles.length})` : ""}`} hint="Multiple photos sold together. Mark one as the primary bundle if you want a preferred bundle in sellable inventory; it is not auto-sent.">
          {bundles.map((b) => (
            <div key={b.id} className="grid gap-2 rounded-lg border border-line bg-bg p-4 text-xs/40">
              <div className="flex items-center justify-between">
                <span className="font-medium">Bundle</span>
                <button type="button" onClick={() => setBundles((prev) => prev.filter((x) => x.id !== b.id))} className="text-muted hover:text-crit">✕</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label>Name<input value={b.name} onChange={(e) => setBundle(b.id, { name: e.target.value })} placeholder="e.g. Primary bundle" className={inputCls} /></label>
                <label>⭐ Price<input type="number" min={1} max={MAX_PHOTO_BUNDLE_PRICE_STARS} step={1} required value={b.stars} onChange={(e) => setBundle(b.id, { stars: e.target.value })} className={inputCls} /></label>
              </div>
              <label>Caption (shown to fan)<input value={b.caption} onChange={(e) => setBundle(b.id, { caption: e.target.value })} className={inputCls} /></label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={b.onboarding} onChange={(e) => setBundle(b.id, { onboarding: e.target.checked })} className="h-4 w-4 accent-good" />
                Primary bundle (sellable inventory, not auto-sent)
              </label>
              {b.files.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {b.files.map((f, fi) => (
                    <div key={fi} className="group relative">
                      <FilePreview file={f} kind="photo" className="h-16 w-16 rounded object-cover" />
                      <button type="button" onClick={() => setBundle(b.id, { files: b.files.filter((_, j) => j !== fi) })} className="absolute right-0.5 top-0.5 hidden rounded-full bg-black/70 px-1 text-crit group-hover:block">✕</button>
                    </div>
                  ))}
                </div>
              )}
              <FilePicker label={`Add photos to bundle${b.files.length ? ` (${b.files.length})` : ""}`} accept="image/*,.heic,.heif"
                onFiles={(files) => setBundle(b.id, { files: [...b.files, ...files] })} />
            </div>
          ))}
          <button type="button" onClick={addBundle}
            className="rounded-lg border border-dashed border-line px-4 py-3 text-sm text-muted transition hover:border-accent/60 hover:text-ink">
            + New bundle
          </button>
        </Section>
      )}

      {/* ── Progress / actions ── */}
      {tasks.length > 0 && (
        <Section title="Setting up: captioning & compiling…">
          {tasks.map((t, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-muted">{t.label}</span>
              <span className={
                t.status === "done" ? "text-good" :
                t.status === "running" ? "text-accent" :
                t.status === "error" ? "text-crit" : "text-muted"
              }>
                {t.status === "done" ? "✓" : t.status === "running" ? "running…" : t.status === "error" ? `✗ ${t.error}` : "waiting"}
              </span>
            </div>
          ))}
          {hasFailed && (
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={retryFailed}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition hover:bg-accent-deep">
                Retry failed steps
              </button>
              <button type="button" onClick={abortAndDelete}
                className="rounded-lg border border-crit/30 px-4 py-2 text-sm text-crit transition hover:bg-crit/10 dark:text-crit">
                Delete whole creator
              </button>
            </div>
          )}
        </Section>
      )}

      <div className="flex justify-end">
        <button type="submit" disabled={running && !hasFailed}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink transition hover:bg-accent-deep disabled:opacity-50">
          {running ? "Working…" : "Continue to review →"}
        </button>
      </div>
    </form>
  );
}

// ── File picker dropzone ────────────────────────────────────────────────────
function FilePicker({ label, accept, onFiles }: { label: string; accept: string; onFiles: (f: File[]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <button type="button" onClick={() => ref.current?.click()}
      className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-line p-6 text-center transition hover:border-accent/60">
      <input ref={ref} type="file" accept={accept} multiple className="hidden"
        onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) onFiles(f); e.target.value = ""; }} />
      <span className="text-xl">📁</span>
      <span className="mt-1 text-sm text-muted">{label}</span>
    </button>
  );
}

// ── Local preview of a staged File (object URL, cleaned up) ──────────────────
function FilePreview({ file, kind, className }: { file: File; kind: "photo" | "video"; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  const cls = className ?? "h-20 w-20 rounded object-cover";
  if (!url) return <div className={cls + " animate-pulse bg-muted/10"} />;
  return kind === "video"
    ? <video src={url} className={cls} muted preload="metadata" />
    : <img src={url} alt="" className={cls} />;
}
