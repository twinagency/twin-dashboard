"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { OrModel } from "@/app/api/models/route";
import ModelSelect from "./ModelSelect";
import IntakeFields from "./IntakeFields";
import { createCloneRow, deleteClone, compileCloneAction } from "@/app/clones/actions";
import { uploadPhoto, uploadVideo, createBundle, addBundleItem } from "@/app/clones/[id]/media/actions";

// ── Small UI helpers ──────────────────────────────────────────────────────────
function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 text-gray-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400">{title}</h2>
      {hint && <p className="mb-4 text-xs text-gray-400 dark:text-neutral-500">{hint}</p>}
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

const inputCls = "w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-brand-light dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder-neutral-500";

function Slider({ label, name, value, onChange, min = 0, max = 1, step = 0.01 }: {
  label: string; name: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-neutral-400">
        <span>{label}</span><span className="text-gray-700 dark:text-neutral-200">{value.toFixed(2)}</span>
      </span>
      <input type="hidden" name={name} value={value} />
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-brand" />
    </label>
  );
}

function Toggle({ label, name, checked, onChange, accent = "brand" }: {
  label: string; name: string; checked: boolean; onChange: (v: boolean) => void; accent?: "brand" | "soft";
}) {
  const onColor = accent === "soft" ? "bg-emerald-400" : "bg-brand";
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <input type="hidden" name={name} value={String(checked)} />
      <button type="button" onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition ${checked ? onColor : "bg-gray-200 dark:bg-neutral-700"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all dark:bg-neutral-900 ${checked ? "left-[18px]" : "left-0.5"}`} />
      </button>
      {label}
    </label>
  );
}

// ── Staged (browser-only) media types ──────────────────────────────────────────
type StagedPhoto = { id: number; file: File; caption: string; teaser: string; stars: string; name: string; captioning: boolean };
type StagedVideo = { id: number; file: File; caption: string; teaser: string; stars: string };
type StagedBundle = { id: number; name: string; caption: string; stars: string; onboarding: boolean; files: File[] };

type TaskStatus = "pending" | "running" | "done" | "error";
type Task = { label: string; status: TaskStatus; error?: string };

const MODEL_FIELDS = [
  { name: "text_model", label: "Text", def: "deepseek/deepseek-v4-flash" },
  { name: "voice_model", label: "Voice", def: "deepseek/deepseek-v4-flash" },
  { name: "media_model", label: "Media match", def: "deepseek/deepseek-v4-flash" },
  { name: "routing_model", label: "Routing", def: "openai/gpt-4.1-mini" },
  { name: "voice_enhance_model", label: "Voice enhance", def: "openai/gpt-4.1-mini" },
  { name: "photo_reply_model", label: "Photo reply", def: "qwen/qwen2.5-vl-72b-instruct" },
  { name: "vision_model", label: "Vision", def: "qwen/qwen2.5-vl-72b-instruct" },
];

let _seq = 1;
const nextId = () => _seq++;

export default function CreateCloneForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [models, setModels] = useState<OrModel[]>([]);

  // Settings state
  const [stability, setStability] = useState(0.4);
  const [similarity, setSimilarity] = useState(0.75);
  const [style, setStyle] = useState(0.25);
  const [speed, setSpeed] = useState(0.95);
  const [speakerBoost, setSpeakerBoost] = useState(true);
  const [photosOn, setPhotosOn] = useState(true);
  const [videosOn, setVideosOn] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [charge, setCharge] = useState(true);
  const [tipsOn, setTipsOn] = useState(false);
  const [liveCaptionsOn, setLiveCaptionsOn] = useState(false);
  const [thankYouOn, setThankYouOn] = useState(true);
  const [paywallVoiceOn, setPaywallVoiceOn] = useState(false);

  // Staged media (browser only — nothing uploaded until Create)
  const [photos, setPhotos] = useState<StagedPhoto[]>([]);
  const [videos, setVideos] = useState<StagedVideo[]>([]);
  const [bundles, setBundles] = useState<StagedBundle[]>([]);

  // Create orchestration
  const [running, setRunning] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const cloneIdRef = useRef<string | null>(null);

  useEffect(() => {
    fetch("/api/models").then(r => r.json()).then(d => Array.isArray(d) && setModels(d)).catch(() => {});
  }, []);

  // ── Photo staging (no captioning here — that happens in the backend on
  // Continue, and you review the results on the next page) ───────────────────
  function addPhotos(files: File[]) {
    const staged = files.map(f => ({
      id: nextId(), file: f, caption: "", teaser: "", stars: "25",
      name: f.name.replace(/\.[^.]+$/, ""), captioning: false,
    }));
    setPhotos(prev => [...prev, ...staged]);
  }
  const setPhoto = (id: number, patch: Partial<StagedPhoto>) =>
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));

  function addVideos(files: File[]) {
    setVideos(prev => [...prev, ...files.map(f => ({ id: nextId(), file: f, caption: "", teaser: "", stars: "50" }))]);
  }
  const setVideo = (id: number, patch: Partial<StagedVideo>) =>
    setVideos(prev => prev.map(v => v.id === id ? { ...v, ...patch } : v));

  function addBundle() {
    setBundles(prev => [...prev, { id: nextId(), name: "", caption: "", stars: "99", onboarding: false, files: [] }]);
  }
  const setBundle = (id: number, patch: Partial<StagedBundle>) =>
    setBundles(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));

  // Only create media for features that are turned ON. A disabled feature's
  // section is hidden, and its staged items are skipped on Create.
  const effPhotos = () => (photosOn ? photos : []);
  const effVideos = () => (videosOn ? videos : []);
  const effBundles = () => (photosOn ? bundles : []);

  // ── Create: run all tasks sequentially ──────────────────────────────────────
  function buildTasks(): Task[] {
    const t: Task[] = [{ label: "Create clone", status: "pending" }];
    effPhotos().forEach(p => t.push({ label: `Photo: ${p.name || p.file.name}`, status: "pending" }));
    effVideos().forEach(v => t.push({ label: `Video: ${v.file.name}`, status: "pending" }));
    effBundles().forEach(b => t.push({ label: `Bundle: ${b.name || "(unnamed)"}`, status: "pending" }));
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
    setTasks(prev => prev.map((t, j) => j === i ? { ...t, status, error } : t));

  // Run a set of task indices concurrently with a small cap. Captioning is the
  // slow part (one AI call each), so running ~4 at once is a big speed-up without
  // hammering OpenRouter into rate-limit failures. Returns indices that failed.
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

  // Create the clone row first (everything else needs its id), then run all the
  // media + compile steps in parallel.
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
    const rest = indices.filter(i => i !== 0);
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
    const indices = tasks.map((t, i) => t.status === "error" ? i : -1).filter(i => i >= 0);
    const ok = await runAll(indices);
    if (ok && cloneIdRef.current && !tasks.some(t => t.status === "error")) {
      router.push(`/clones/${cloneIdRef.current}`);
    }
  }

  async function abortAndDelete() {
    if (!confirm("Delete this half-created clone and start over?")) return;
    if (cloneIdRef.current) await deleteClone(cloneIdRef.current);
    cloneIdRef.current = null;
    setTasks([]);
    setRunning(false);
  }

  const hasFailed = tasks.some(t => t.status === "error");

  return (
    <form ref={formRef} onSubmit={handleCreate} className="grid gap-6">
      <Section title="Identity" hint="Name becomes the slug. Bot token from @BotFather.">
        <label className="block">
          <span className="mb-1 block text-xs text-gray-500 dark:text-neutral-400">Name <span className="text-brand-light">*</span></span>
          <input name="name" required placeholder="e.g. Sophie" className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-gray-500 dark:text-neutral-400">Bot token <span className="text-brand-light">*</span></span>
          <input name="bot_token" required placeholder="1234:ABC..." className={inputCls} />
        </label>
        <input type="hidden" name="status" value="paused" />
      </Section>

      <Section title="Features">
        <div className="flex flex-wrap gap-6">
          <Toggle label="Photos" name="photos_enabled" checked={photosOn} onChange={setPhotosOn} />
          <Toggle label="Videos" name="videos_enabled" checked={videosOn} onChange={setVideosOn} />
          <Toggle label="Voice messages" name="voice_enabled" checked={voiceOn} onChange={setVoiceOn} />
          <Toggle label="Charge for messages" name="charge_messages" checked={charge} onChange={setCharge} />
        </div>
      </Section>

      <Section title="Advanced features" hint="Extra AI-driven monetization. Off by default.">
        <div className="flex flex-wrap gap-6">
          <Toggle label="Tips (ask for Stars / spoil me)" name="tips_enabled" checked={tipsOn} onChange={setTipsOn} accent="soft" />
          <Toggle label="AI rewrites media captions live" name="live_captions_enabled" checked={liveCaptionsOn} onChange={setLiveCaptionsOn} accent="soft" />
          <Toggle label="Auto thank-you after any purchase or gift" name="thank_you_enabled" checked={thankYouOn} onChange={setThankYouOn} accent="soft" />
        </div>
      </Section>

      {voiceOn && (
        <Section title="Voice (ElevenLabs)">
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500 dark:text-neutral-400">Voice ID</span>
            <input name="voice_id" placeholder="Paste ElevenLabs voice ID" className={inputCls} />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <Slider label="Stability" name="voice_stability" value={stability} onChange={setStability} />
            <Slider label="Similarity" name="voice_similarity" value={similarity} onChange={setSimilarity} />
            <Slider label="Style" name="voice_style" value={style} onChange={setStyle} />
            <Slider label="Speed" name="voice_speed" value={speed} onChange={setSpeed} min={0.5} max={1.2} />
          </div>
          <Toggle label="Speaker boost" name="voice_speaker_boost" checked={speakerBoost} onChange={setSpeakerBoost} />
        </Section>
      )}

      {charge && (
        <Section title="Charge for messages" hint="Telegram Stars. Credits = messages.">
          <div className="grid grid-cols-3 gap-4">
            <label className="block"><span className="mb-1 block text-xs text-gray-500 dark:text-neutral-400">Starting credits (free)</span>
              <input name="starting_credits" type="number" defaultValue={50} className={inputCls} /></label>
            <label className="block"><span className="mb-1 block text-xs text-gray-500 dark:text-neutral-400">Pack size (msgs)</span>
              <input name="credit_pack_size" type="number" defaultValue={50} className={inputCls} /></label>
            <label className="block"><span className="mb-1 block text-xs text-gray-500 dark:text-neutral-400">Pack price (⭐)</span>
              <input name="credit_pack_price_stars" type="number" defaultValue={199} className={inputCls} /></label>
          </div>
        </Section>
      )}

      <Section title="New user flow" hint="What happens as a new fan warms up. You write instructions — she generates the actual wording per fan. Leave a field blank to skip it.">
        <label className="block"><span className="mb-1 block text-xs text-gray-500 dark:text-neutral-400">Welcome greeting instruction (optional)</span>
          <textarea name="welcome_instruction" rows={2} placeholder="e.g. greet him warmly, introduce yourself, ask his name" className={inputCls} /></label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block"><span className="mb-1 block text-xs text-gray-500 dark:text-neutral-400">Reply as a voice note on fan's Nth message (blank = off)</span>
            <input name="onboarding_voice_after" type="number" placeholder="e.g. 3" className={inputCls} />
            <span className="mt-1 block text-[11px] text-gray-500 dark:text-neutral-500">Her actual reply that turn comes as a voice note — no script, just so he learns she can.</span></label>
          <label className="block"><span className="mb-1 block text-xs text-gray-500 dark:text-neutral-400">Photo bundle after fan's Nth message</span>
            <input name="welcome_bundle_after" type="number" defaultValue={10} className={inputCls} /></label>
        </div>
        <label className="block"><span className="mb-1 block text-xs text-gray-500 dark:text-neutral-400">…or send the bundle on a timer if he goes quiet (minutes after signup, blank = off)</span>
          <input name="welcome_bundle_after_minutes" type="number" placeholder="e.g. 30" className={inputCls} /></label>
      </Section>

      <Section title="Out of messages flow" hint="What she says when a fan runs out of credits. You write the instruction — she generates it per fan. The buy-more button is attached automatically.">
        <label className="block"><span className="mb-1 block text-xs text-gray-500 dark:text-neutral-400">Out-of-messages instruction</span>
          <textarea name="paywall_instruction" rows={2} placeholder="e.g. tell him sweetly he's out of messages and to grab more to keep talking" className={inputCls} /></label>
        <Toggle label="Send it as a voice note (instead of text)" name="paywall_as_voice" checked={paywallVoiceOn} onChange={setPaywallVoiceOn} accent="soft" />
      </Section>

      <Section title="AI Models" hint="Search by name — price per 1M prompt tokens.">
        <div className="grid grid-cols-2 gap-4">
          {MODEL_FIELDS.map(m => (
            <ModelSelect key={m.name} label={m.label} name={m.name} models={models} defaultValue={m.def} />
          ))}
        </div>
      </Section>

      <Section title="Onboarding questionnaire" hint="Fill in what you know — the more detail, the better the clone. On Create, the AI compiles these into her personality.">
        <IntakeFields />
      </Section>

      {/* ── Media (staged in browser) ── */}
      {photosOn && (
      <Section title={`Photos${photos.length ? ` (${photos.length})` : ""}`} hint="The AI captions each one in the next step — you'll review them before going live.">
        <FilePicker label="Add photos (any format — HEIC, JPG, PNG, WebP)" accept="image/*,.heic,.heif" onFiles={addPhotos} />
        {photos.map(p => (
          <div key={p.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4 grid gap-2 text-xs dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex gap-3">
              <FilePreview file={p.file} kind="photo" className="h-24 w-24 rounded object-cover shrink-0" />
              <div className="flex-1 grid gap-2 content-start">
                <div className="flex items-center justify-between">
                  <span className="font-medium truncate">{p.file.name}</span>
                  <button type="button" onClick={() => setPhotos(prev => prev.filter(x => x.id !== p.id))}
                    className="text-gray-400 hover:text-red-400 dark:text-neutral-500">✕</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label>Name<input value={p.name} onChange={e => setPhoto(p.id, { name: e.target.value })} className={inputCls} /></label>
                  <label>⭐ Price<input type="number" value={p.stars} onChange={e => setPhoto(p.id, { stars: e.target.value })} className={inputCls} /></label>
                </div>
              </div>
            </div>
          </div>
        ))}
      </Section>
      )}

      {videosOn && (
      <Section title={`Videos${videos.length ? ` (${videos.length})` : ""}`} hint="The AI captions each one (from a frame) in the next step — you'll review before going live.">
        <FilePicker label="Add videos (max 50MB each)" accept="video/*" onFiles={addVideos} />
        {videos.map(v => (
          <div key={v.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4 grid gap-2 text-xs dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex gap-3">
              <FilePreview file={v.file} kind="video" className="h-24 w-24 rounded object-cover shrink-0" />
              <div className="flex-1 grid gap-2 content-start">
                <div className="flex items-center justify-between">
                  <span className="font-medium truncate">{v.file.name}</span>
                  <button type="button" onClick={() => setVideos(prev => prev.filter(x => x.id !== v.id))}
                    className="text-gray-400 hover:text-red-400 dark:text-neutral-500">✕</button>
                </div>
                <label>⭐ Price<input type="number" value={v.stars} onChange={e => setVideo(v.id, { stars: e.target.value })} className={inputCls} /></label>
              </div>
            </div>
          </div>
        ))}
      </Section>
      )}

      {photosOn && (
      <Section title={`Bundles${bundles.length ? ` (${bundles.length})` : ""}`} hint="Multiple photos sold together. Mark one as the welcome bundle for new fans.">
        {bundles.map(b => (
          <div key={b.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4 grid gap-2 text-xs dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between">
              <span className="font-medium">Bundle</span>
              <button type="button" onClick={() => setBundles(prev => prev.filter(x => x.id !== b.id))}
                className="text-gray-400 hover:text-red-400 dark:text-neutral-500">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label>Name<input value={b.name} onChange={e => setBundle(b.id, { name: e.target.value })} placeholder="e.g. Welcome bundle" className={inputCls} /></label>
              <label>⭐ Price<input type="number" value={b.stars} onChange={e => setBundle(b.id, { stars: e.target.value })} className={inputCls} /></label>
            </div>
            <label>Caption (shown to fan)<input value={b.caption} onChange={e => setBundle(b.id, { caption: e.target.value })} className={inputCls} /></label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={b.onboarding} onChange={e => setBundle(b.id, { onboarding: e.target.checked })} className="h-4 w-4 accent-grass" />
              Welcome bundle (auto-sent to new fans)
            </label>
            {b.files.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {b.files.map((f, fi) => (
                  <div key={fi} className="group relative">
                    <FilePreview file={f} kind="photo" className="h-16 w-16 rounded object-cover" />
                    <button type="button"
                      onClick={() => setBundle(b.id, { files: b.files.filter((_, j) => j !== fi) })}
                      className="absolute right-0.5 top-0.5 hidden rounded-full bg-black/70 px-1 text-red-400 group-hover:block">✕</button>
                  </div>
                ))}
              </div>
            )}
            <FilePicker label={`Add photos to bundle${b.files.length ? ` (${b.files.length})` : ""}`} accept="image/*,.heic,.heif"
              onFiles={files => setBundle(b.id, { files: [...b.files, ...files] })} />
          </div>
        ))}
        <button type="button" onClick={addBundle}
          className="rounded-md border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-400 hover:border-gray-400 hover:text-gray-700 transition dark:border-neutral-800 dark:text-neutral-500 dark:hover:text-neutral-200">
          + New bundle
        </button>
      </Section>
      )}

      {/* ── Progress / actions ── */}
      {tasks.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-5 grid gap-2 dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400">Setting up — captioning &amp; compiling…</h2>
          {tasks.map((t, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-neutral-400">{t.label}</span>
              <span className={
                t.status === "done" ? "text-green-400" :
                t.status === "running" ? "text-blue-400" :
                t.status === "error" ? "text-red-400" : "text-gray-400 dark:text-neutral-500"
              }>
                {t.status === "done" ? "✓" : t.status === "running" ? "running…" : t.status === "error" ? `✗ ${t.error}` : "waiting"}
              </span>
            </div>
          ))}
          {hasFailed && (
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={retryFailed}
                className="rounded-md bg-brand px-4 py-2 text-sm font-medium hover:bg-brand-light transition">
                Retry failed steps
              </button>
              <button type="button" onClick={abortAndDelete}
                className="rounded-md border border-red-200 px-4 py-2 text-sm text-red-700 hover:bg-red-50 transition">
                Delete whole clone
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <button type="submit" disabled={running && !hasFailed}
          className="rounded-md bg-grass px-5 py-2.5 text-sm font-medium transition hover:bg-grass-light disabled:opacity-50">
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
      className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-6 text-center hover:border-gray-400 transition dark:border-neutral-800">
      <input ref={ref} type="file" accept={accept} multiple className="hidden"
        onChange={e => { const f = Array.from(e.target.files ?? []); if (f.length) onFiles(f); e.target.value = ""; }} />
      <span className="text-xl">📁</span>
      <span className="mt-1 text-sm text-gray-500 dark:text-neutral-400">{label}</span>
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
  if (!url) return <div className={cls + " animate-pulse bg-gray-100 dark:bg-neutral-900"} />;
  return kind === "video"
    ? <video src={url} className={cls} muted preload="metadata" />
    : <img src={url} alt="" className={cls} />;
}
