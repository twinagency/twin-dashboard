"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Clone } from "@/lib/types";
import type { OrModel } from "@/app/api/models/route";
import ModelSelect from "./ModelSelect";
import IntakeFields from "./IntakeFields";
import MediaManager from "@/app/clones/[id]/media/MediaManager";
import { updateClone, deleteClone } from "@/app/clones/actions";

type Step = "idle" | "saving" | "compiling" | "done" | "save-error" | "compile-error";
type Tab = "config" | "media" | "prompts";
type MediaProps = React.ComponentProps<typeof MediaManager>;

// Built-in defaults, mirrored from the runtime (src/handler.ts, telegram-messenger.ts)
// so the fields show a real, editable default rather than a grey placeholder.
const DEFAULT_PAYWALL_MESSAGE = "you're out of messages baby, grab some more to keep chatting with me 💕";
const DEFAULT_PAYWALL_BUTTON = "Continue 💕";

// Default spoil-menu buttons, mirrored from the runtime (star-pricing.ts). Shown
// pre-filled (real editable values, not a grey placeholder).
const DEFAULT_SPOIL_OPTIONS: { stars: number; label: string }[] = [
  { stars: 1000, label: "" },
  { stars: 2500, label: "" },
  { stars: 5000, label: "" },
  { stars: 10000, label: "" },
  { stars: 25000, label: "" },
  { stars: 50000, label: "" },
  { stars: 100000, label: "" },
];

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 text-gray-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-neutral-200">{title}</h2>
      {hint && <p className="mb-4 text-xs text-gray-500 dark:text-neutral-400">{hint}</p>}
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

function Field({ label, name, defaultValue, type = "text", placeholder, required, hint }: {
  label: string; name: string; defaultValue?: string | number | null;
  type?: string; placeholder?: string; required?: boolean; hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-gray-600 dark:text-neutral-400">{label}{required && <span className="ml-1 text-brand">*</span>}</span>
      <input name={name} type={type} required={required} placeholder={placeholder}
        defaultValue={defaultValue ?? undefined}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder-neutral-500" />
      {hint && <span className="mt-1 block text-[11px] text-gray-500 dark:text-neutral-500">{hint}</span>}
    </label>
  );
}

function Area({ label, name, defaultValue, placeholder, rows = 2 }: {
  label: string; name: string; defaultValue?: string | null; placeholder?: string; rows?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-gray-600 dark:text-neutral-400">{label}</span>
      <textarea name={name} rows={rows} placeholder={placeholder} defaultValue={defaultValue ?? undefined}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder-neutral-500" />
    </label>
  );
}

function Slider({ label, name, value, onChange, min = 0, max = 1, step = 0.01, format }: {
  label: string; name: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; format?: (v: number) => string;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-neutral-400">
        <span>{label}</span>
        <span className="text-gray-700 dark:text-neutral-200">{format ? format(value) : value.toFixed(2)}</span>
      </span>
      <input type="hidden" name={name} value={value} />
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-gray-900" />
    </label>
  );
}

function Toggle({ label, name, checked, onChange, accent = "default" }: {
  label: string; name: string; checked: boolean; onChange: (v: boolean) => void; accent?: "default" | "soft";
}) {
  const trackColor = checked
    ? accent === "soft" ? "bg-emerald-400" : "bg-green-600"
    : accent === "soft" ? "bg-gray-300 dark:bg-neutral-700" : "bg-red-500";
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <input type="hidden" name={name} value={String(checked)} />
      <button type="button" onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition ${trackColor}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
      </button>
      <span className="text-gray-700 dark:text-neutral-200">{label}</span>
    </label>
  );
}

// Prompt textareas are LOCKED by default — read-only, muted. Hover reveals an
// "Edit" button; click it to unlock that one field. (readOnly still submits.)
function PromptField({ name, label, defaultValue }: { name: string; label: string; defaultValue: string }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="group relative block">
      <span className="mb-1 block text-xs text-gray-500 dark:text-neutral-400">{label}</span>
      <textarea
        name={name}
        rows={6}
        defaultValue={defaultValue}
        readOnly={!editing}
        placeholder="(empty — hit Re-compile to generate)"
        className={
          "w-full rounded-xl border px-3 py-2.5 font-mono text-xs leading-relaxed outline-none transition dark:text-neutral-100 dark:placeholder-neutral-500 " +
          (editing
            ? "border-gray-900 bg-white focus:ring-2 focus:ring-brand/10 dark:border-neutral-500 dark:bg-neutral-900"
            : "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400")
        }
      />
      {!editing ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="absolute right-2 top-7 flex items-center gap-1 rounded-md border border-gray-300 bg-white/90 px-2 py-1 text-xs font-medium text-gray-700 opacity-0 shadow-sm backdrop-blur transition group-hover:opacity-100 hover:bg-gray-50 dark:border-neutral-700 dark:bg-neutral-900/90 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          ✏️ Edit
        </button>
      ) : (
        <span className="absolute right-2 top-7 rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
          Editing
        </span>
      )}
    </div>
  );
}

const MODEL_FIELDS: { name: keyof Clone; label: string; def: string }[] = [
  { name: "text_model", label: "Text", def: "deepseek/deepseek-v4-flash" },
  { name: "voice_model", label: "Voice", def: "deepseek/deepseek-v4-flash" },
  { name: "media_model", label: "Media match", def: "deepseek/deepseek-v4-flash" },
  { name: "routing_model", label: "Routing / Smart decider", def: "openai/gpt-4.1-mini" },
  { name: "voice_enhance_model", label: "Voice enhance", def: "openai/gpt-4.1-mini" },
  { name: "photo_reply_model", label: "Photo reply", def: "qwen/qwen2.5-vl-72b-instruct" },
  { name: "vision_model", label: "Vision", def: "qwen/qwen2.5-vl-72b-instruct" },
];

const TABS: { key: Tab; label: string }[] = [
  { key: "config", label: "Config" },
  { key: "media", label: "Media" },
  { key: "prompts", label: "Prompts" },
];

export default function CloneForm({
  clone,
  livePrompts,
  photos,
  videos,
  bundles,
}: {
  clone: Clone;
  livePrompts: Record<"text" | "voice" | "vision" | "routing", string>;
  photos: MediaProps["photos"];
  videos: MediaProps["videos"];
  bundles: MediaProps["bundles"];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [tab, setTab] = useState<Tab>("config");
  const [models, setModels] = useState<OrModel[]>([]);
  const [step, setStep] = useState<Step>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Voice
  const [stability, setStability] = useState(clone.voice_stability ?? 0.4);
  const [similarity, setSimilarity] = useState(clone.voice_similarity ?? 0.75);
  const [style, setStyle] = useState(clone.voice_style ?? 0.25);
  const [speed, setSpeed] = useState(clone.voice_speed ?? 0.95);
  const [speakerBoost, setSpeakerBoost] = useState(clone.voice_speaker_boost ?? true);

  // Response timing
  const [waitMin, setWaitMin] = useState(clone.response_wait_min ?? 0);
  const [waitMax, setWaitMax] = useState(clone.response_wait_max ?? 0);
  const [memoryWindow, setMemoryWindow] = useState(clone.memory_window ?? 24);

  // Features
  const [photosEnabled, setPhotosEnabled] = useState(clone.photos_enabled ?? true);
  const [videosEnabled, setVideosEnabled] = useState(clone.videos_enabled ?? false);
  const [videoVision, setVideoVision] = useState(clone.video_vision_enabled ?? true);
  const [bundlesEnabled, setBundlesEnabled] = useState(clone.bundles_enabled ?? true);
  const [spoilOptions, setSpoilOptions] = useState<{ stars: number; label: string }[]>(
    clone.spoil_options && clone.spoil_options.length ? clone.spoil_options : DEFAULT_SPOIL_OPTIONS,
  );
  const [voice, setVoice] = useState(clone.voice_enabled ?? true);
  const [charge, setCharge] = useState(clone.charge_messages ?? true);
  const [paywallVoice, setPaywallVoice] = useState(clone.paywall_as_voice ?? false);
  const [tips, setTips] = useState(clone.tips_enabled ?? false);
  const [liveCaptions, setLiveCaptions] = useState(clone.live_captions_enabled ?? false);
  const [thankYou, setThankYou] = useState(clone.thank_you_enabled ?? true);
  const [emojis, setEmojis] = useState(clone.emojis_enabled ?? true);
  const [emojiAmount, setEmojiAmount] = useState(clone.emoji_amount ?? "medium");
  const [emojiList, setEmojiList] = useState(clone.emoji_allowlist ?? "");
  const [sexualLevel, setSexualLevel] = useState(clone.sexual_level ?? "medium");
  const [nsfwLevel, setNsfwLevel] = useState(clone.nsfw_level ?? "medium");
  const [pushLevel, setPushLevel] = useState(clone.push_level ?? "medium");
  const [discountsEnabled, setDiscountsEnabled] = useState(clone.discounts_enabled ?? false);
  const [discMaxPhoto, setDiscMaxPhoto] = useState(clone.discount_max_photo ?? 0);
  const [discMaxVideo, setDiscMaxVideo] = useState(clone.discount_max_video ?? 0);
  const [discMaxBundle, setDiscMaxBundle] = useState(clone.discount_max_bundle ?? 0);
  const [discMaxCredits, setDiscMaxCredits] = useState(clone.discount_max_credits ?? 0);
  const [smartPaywall, setSmartPaywall] = useState(clone.smart_paywall_enabled ?? true);
  const [paywallDefault, setPaywallDefault] = useState(clone.paywall_default_message ?? DEFAULT_PAYWALL_MESSAGE);
  const [paywallButton, setPaywallButton] = useState(clone.paywall_button_label ?? DEFAULT_PAYWALL_BUTTON);
  const [active, setActive] = useState(clone.status === "active");
  const [dripEnabled, setDripEnabled] = useState(clone.drip_enabled ?? true);
  const [aiMode, setAiMode] = useState<"classic" | "smart">(clone.ai_mode ?? "classic");
  const [smartSplit, setSmartSplit] = useState(clone.smart_split ?? true);

  useEffect(() => {
    fetch("/api/models").then(r => r.json()).then(d => Array.isArray(d) && setModels(d)).catch(() => {});
  }, []);

  // Save as-is — does NOT recompile, so your prompt/caption edits survive.
  // goLive=true also flips status to active.
  async function save(goLive: boolean) {
    const fd = new FormData(formRef.current!);
    if (goLive) fd.set("status", "active");
    setStep("saving");
    setErrorMsg("");
    try {
      await updateClone(clone.id, fd);
      setStep("done");
      if (goLive) {
        router.push("/clones");
      } else {
        router.refresh();
      }
    } catch (err) {
      setStep("save-error");
      setErrorMsg(err instanceof Error ? err.message : "Save failed");
    }
  }

  // Regenerate prompts from the personality answers — overwrites manual edits.
  async function recompile() {
    if (!confirm("Re-generate all prompts from the personality answers? This overwrites any manual edits to the prompts.")) return;
    setStep("compiling");
    setErrorMsg("");
    try {
      await updateClone(clone.id, new FormData(formRef.current!));
      const res = await fetch(`/api/compile?id=${clone.id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Compile failed");
      setStep("done");
      router.refresh();
    } catch (err) {
      setStep("compile-error");
      setErrorMsg(err instanceof Error ? err.message : "Compile failed");
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this clone permanently? This cannot be undone.")) return;
    await deleteClone(clone.id);
    router.push("/clones");
  }

  const busy = step === "saving" || step === "compiling";
  const isPaused = clone.status !== "active";
  const hide = (t: Tab) => (tab === t ? "grid gap-6" : "hidden");

  return (
    <div className="grid gap-6">
      {/* Tabs */}
      <div className="flex w-fit gap-1 rounded-xl bg-gray-100 p-1 dark:bg-neutral-900">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={
              "rounded-lg px-4 py-1.5 text-sm font-medium transition " +
              (tab === t.key
                ? "bg-white text-gray-900 shadow-sm dark:bg-neutral-700 dark:text-white"
                : "text-gray-500 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-white")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Config + Prompts live in one form so a single Save persists both */}
      <form ref={formRef} onSubmit={(e) => { e.preventDefault(); save(false); }} className="grid gap-6">
        {/* ── CONFIG ─────────────────────────────────────────────── */}
        <div className={hide("config")}>
          <Section title="Identity" hint="Name becomes the slug on create. Bot token from @BotFather.">
            <Field label="Display name" name="name" defaultValue={clone.name} required placeholder="e.g. Sophie" />
            <Field label="Bot token" name="bot_token" defaultValue={clone.bot_token === "PLACEHOLDER" ? "" : clone.bot_token} required placeholder="1234:ABC..." />
            <div className="block">
              <span className="mb-1 block text-xs text-gray-500 dark:text-neutral-400">Status</span>
              <input type="hidden" name="status" value={active ? "active" : "paused"} />
              <Toggle label={active ? "Active" : "Paused"} name="_status_toggle" checked={active} onChange={setActive} />
            </div>
          </Section>

          <Section title="AI mode" hint="How she decides what to do with each message. Classic follows fixed rules; Smart lets one AI figure it out. Money rules stay the same either way.">
            <input type="hidden" name="ai_mode" value={aiMode} />
            <input type="hidden" name="smart_split" value={smartSplit ? "true" : "false"} />
            <div className="inline-flex rounded-lg border border-gray-300 p-0.5 dark:border-neutral-700">
              {(["classic", "smart"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setAiMode(m)}
                  aria-pressed={aiMode === m}
                  className={
                    "rounded-md px-4 py-1.5 text-sm font-medium capitalize transition " +
                    (aiMode === m
                      ? "bg-gray-900 text-white dark:bg-white dark:text-neutral-900"
                      : "text-gray-600 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-white")
                  }
                >
                  {m}
                </button>
              ))}
            </div>
            {aiMode === "smart" && (
              <div className="mt-3 space-y-2">
                <Toggle
                  label="Two-model split (writer + decider)"
                  name="_smart_split_toggle"
                  checked={smartSplit}
                  onChange={setSmartSplit}
                  accent="soft"
                />
                <p className="text-xs text-gray-500 dark:text-neutral-400">
                  {smartSplit
                    ? "On: your Text model writes her replies (use any uncensored model), and your Routing model decides which photo / voice / tip actions fire (must support tool-calling, e.g. Grok or DeepSeek). Set both under AI Models below."
                    : "Off: one model (your Text model) both writes her replies AND fires actions in a single call. Cheaper, but that model must support tool-calling."}
                </p>
              </div>
            )}
          </Section>

          <Section title="Features">
            <div className="flex flex-wrap gap-6">
              <Toggle label="Photos" name="photos_enabled" checked={photosEnabled} onChange={setPhotosEnabled} />
              <Toggle label="Videos" name="videos_enabled" checked={videosEnabled} onChange={setVideosEnabled} />
              <Toggle label="Photo bundles (fans can request)" name="bundles_enabled" checked={bundlesEnabled} onChange={setBundlesEnabled} />
              <Toggle label="Voice messages" name="voice_enabled" checked={voice} onChange={setVoice} />
              <Toggle label="She can see videos fans send" name="video_vision_enabled" checked={videoVision} onChange={setVideoVision} />
              <Toggle label="Charge for messages" name="charge_messages" checked={charge} onChange={setCharge} />
            </div>
          </Section>

          <Section title="Personality" hint="Dials her tone. These never override the built-in hard limits, and money stays locked in code (push only changes how eager she is, never prices).">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs text-gray-600 dark:text-neutral-400">How sexual / flirty</span>
                <select name="sexual_level" value={sexualLevel} onChange={(e) => setSexualLevel(e.target.value as "low" | "medium" | "high")}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-lg outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100">
                  <option value="low">Low (mostly cute)</option>
                  <option value="medium">Medium (naturally flirty)</option>
                  <option value="high">High (openly forward)</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-gray-600 dark:text-neutral-400">How explicit (NSFW)</span>
                <select name="nsfw_level" value={nsfwLevel} onChange={(e) => setNsfwLevel(e.target.value as "low" | "medium" | "high")}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-lg outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100">
                  <option value="low">Low (keeps it PG-13)</option>
                  <option value="medium">Medium (dirty when led)</option>
                  <option value="high">High (fully explicit)</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-gray-600 dark:text-neutral-400">How hard she pushes $</span>
                <select name="push_level" value={pushLevel} onChange={(e) => setPushLevel(e.target.value as "low" | "medium" | "high")}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-lg outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100">
                  <option value="low">Low (rarely brings it up)</option>
                  <option value="medium">Medium (offers at good moments)</option>
                  <option value="high">High (proactively upsells)</option>
                </select>
              </label>
            </div>
          </Section>

          <Section title="Discounts" hint="Let her offer a limited discount to close a sale. She only decides WHEN and how hard (light/medium/max); the % is capped by what you set here and the price is always computed in code. 0 = never discount that type.">
            <Toggle label={discountsEnabled ? "She can offer discounts" : "No discounts"} name="discounts_enabled" checked={discountsEnabled} onChange={setDiscountsEnabled} accent="soft" />
            {discountsEnabled && (
              <div className="grid grid-cols-2 gap-4">
                <Slider label="Max off — photos" name="discount_max_photo" value={discMaxPhoto} onChange={setDiscMaxPhoto}
                  min={0} max={90} step={5} format={(v) => `${v}%`} />
                <Slider label="Max off — videos" name="discount_max_video" value={discMaxVideo} onChange={setDiscMaxVideo}
                  min={0} max={90} step={5} format={(v) => `${v}%`} />
                <Slider label="Max off — bundles" name="discount_max_bundle" value={discMaxBundle} onChange={setDiscMaxBundle}
                  min={0} max={90} step={5} format={(v) => `${v}%`} />
                <Slider label="Max off — message packs" name="discount_max_credits" value={discMaxCredits} onChange={setDiscMaxCredits}
                  min={0} max={90} step={5} format={(v) => `${v}%`} />
              </div>
            )}
          </Section>

          <Section title="Advanced features" hint="Extra AI-driven monetization. Off by default.">
            <div className="flex flex-wrap gap-6">
              <Toggle label="Tips (ask for Stars / spoil me)" name="tips_enabled" checked={tips} onChange={setTips} accent="soft" />
              <Toggle label="AI rewrites media captions live" name="live_captions_enabled" checked={liveCaptions} onChange={setLiveCaptions} accent="soft" />
              <Toggle label="Auto thank-you after any purchase or gift" name="thank_you_enabled" checked={thankYou} onChange={setThankYou} accent="soft" />
            </div>
          </Section>

          {tips && (
            <Section title="Spoil menu buttons" hint="Shown when a fan wants to tip but names no amount. Each button = a Stars price + its label (blank label shows as ⭐ amount). Add/remove to choose how many.">
              <input type="hidden" name="spoil_options" value={JSON.stringify(spoilOptions.filter((o) => o.stars >= 1))} />
              <div className="grid gap-2">
                {spoilOptions.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="number" value={o.stars}
                      onChange={(e) => setSpoilOptions((prev) => prev.map((p, j) => (j === i ? { ...p, stars: Number(e.target.value) } : p)))}
                      placeholder="stars"
                      className="w-28 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100" />
                    <input value={o.label}
                      onChange={(e) => setSpoilOptions((prev) => prev.map((p, j) => (j === i ? { ...p, label: e.target.value } : p)))}
                      placeholder={`button text (blank = ⭐ ${o.stars || "amount"})`}
                      className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder-neutral-500" />
                    <button type="button" onClick={() => setSpoilOptions((prev) => prev.filter((_, j) => j !== i))}
                      className="rounded-lg border border-red-200 px-3 py-2 text-xs text-red-700 hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-950/30">
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setSpoilOptions((prev) => [...prev, { stars: 1000, label: "" }])}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-900">
                  + Add button
                </button>
                <button type="button" onClick={() => setSpoilOptions(DEFAULT_SPOIL_OPTIONS)}
                  className="text-[11px] font-medium text-gray-500 underline hover:text-gray-900 dark:text-neutral-400 dark:hover:text-white">
                  Reset to default
                </button>
              </div>
            </Section>
          )}

          <Section title="Emojis" hint="Applies to text and photo replies (voice notes are spoken, so it never affects them).">
            <Toggle label={emojis ? "Uses emojis" : "No emojis at all"} name="emojis_enabled" checked={emojis} onChange={setEmojis} accent="soft" />
            {emojis && (
              <label className="block">
                <span className="mb-1 block text-xs text-gray-600 dark:text-neutral-400">How much she uses them</span>
                <select name="emoji_amount" value={emojiAmount} onChange={(e) => setEmojiAmount(e.target.value as "low" | "medium" | "high")}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-lg outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100">
                  <option value="low">A little (most messages have none)</option>
                  <option value="medium">Some (about every other message)</option>
                  <option value="high">A lot (most messages have one or two)</option>
                </select>
              </label>
            )}
            {emojis && (
              <label className="block">
                <span className="mb-1 block text-xs text-gray-600 dark:text-neutral-400">Allowed emojis (blank = she picks any)</span>
                <input name="emoji_allowlist" value={emojiList} onChange={(e) => setEmojiList(e.target.value)}
                  placeholder="e.g. ❤️ 😘 💕 🥹 (blank = any)"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-lg outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder-neutral-500" />
                <span className="mt-1 block text-[11px] text-gray-500 dark:text-neutral-500">When set, these are the ONLY emojis she can ever use. Leave blank to let her choose any (still sparingly).</span>
              </label>
            )}
            {!emojis && <input type="hidden" name="emoji_allowlist" value="" />}
          </Section>

          <Section title="Voice (ElevenLabs)">
            <Field label="Voice ID" name="voice_id" defaultValue={clone.voice_id} placeholder="Paste ElevenLabs voice ID" />
            <div className="grid grid-cols-2 gap-4">
              <Slider label="Stability" name="voice_stability" value={stability} onChange={setStability} />
              <Slider label="Similarity" name="voice_similarity" value={similarity} onChange={setSimilarity} />
              <Slider label="Style" name="voice_style" value={style} onChange={setStyle} />
              <Slider label="Speed" name="voice_speed" value={speed} onChange={setSpeed} min={0.5} max={1.2} />
            </div>
            <input type="hidden" name="voice_speaker_boost" value={String(speakerBoost)} />
            <Toggle label="Speaker boost" name="_sb_toggle" checked={speakerBoost} onChange={setSpeakerBoost} />
          </Section>

          {charge && (
            <Section title="Charge for messages" hint="Telegram Stars. Credits = messages.">
              <div className="grid grid-cols-3 gap-4">
                <Field label="Starting credits (free)" name="starting_credits" type="number" defaultValue={clone.starting_credits ?? 50} />
                <Field label="Pack size (msgs)" name="credit_pack_size" type="number" defaultValue={clone.credit_pack_size ?? 50} />
                <Field label="Pack price (⭐)" name="credit_pack_price_stars" type="number" defaultValue={clone.credit_pack_price_stars ?? 199} />
              </div>
            </Section>
          )}

          <Section title="New user flow" hint="What happens as a new fan warms up. You write instructions — she generates the actual wording per fan. Leave a field blank to skip it.">
            <Area label="Welcome greeting instruction (optional)" name="welcome_instruction" rows={2}
              placeholder="e.g. greet him warmly, introduce yourself, ask his name"
              defaultValue={clone.welcome_instruction} />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Reply as a voice note on fan's Nth message (blank = off)" name="onboarding_voice_after" type="number"
                defaultValue={clone.onboarding_voice_after} placeholder="e.g. 3"
                hint="Her actual reply that turn comes as a voice note — no script, just so he learns she can." />
              <Field label="Photo bundle after fan's Nth message" name="welcome_bundle_after" type="number"
                defaultValue={clone.welcome_bundle_after ?? 10} />
            </div>
            <Field label="…or send the bundle on a timer if he goes quiet (minutes after signup, blank = off)" name="welcome_bundle_after_minutes" type="number"
              defaultValue={clone.welcome_bundle_after_minutes} placeholder="e.g. 30" />
          </Section>

          <Section title="Drip / re-engagement" hint="Automatic messages that win a fan's attention back when he goes quiet. She writes each one fresh from your chat history — never templated.">
            <Toggle label={dripEnabled ? "Drip is on" : "Drip is off"} name="drip_enabled" checked={dripEnabled} onChange={setDripEnabled} accent="soft" />
            {dripEnabled && (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Drips per day (for a quiet fan)" name="drip_per_day" type="number"
                  defaultValue={clone.drip_per_day ?? 1} placeholder="1"
                  hint="Chattier fans get more automatically (up to 4x this)." />
                <Field label="Don't drip if he messaged in the last… (minutes)" name="drip_active_window_minutes" type="number"
                  defaultValue={clone.drip_active_window_minutes ?? 360} placeholder="360"
                  hint="Avoids a drip landing mid-conversation. 360 = 6 hours." />
              </div>
            )}
          </Section>

          <Section title="Out of messages flow" hint="What a fan sees when he runs out of message credits. The buy-more button is attached automatically.">
            {/* Default message + button — always used, fully customizable */}
            <div className="rounded-lg border border-gray-200 p-4 dark:border-neutral-800 grid gap-3">
              <p className="text-xs font-medium text-gray-700 dark:text-neutral-200">
                Default message {smartPaywall ? "(every time after the first)" : "(every time)"}
              </p>
              <label className="block">
                <span className="mb-1 block text-xs text-gray-600 dark:text-neutral-400">Message text</span>
                <textarea name="paywall_default_message" rows={2} value={paywallDefault}
                  onChange={(e) => setPaywallDefault(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder-neutral-500" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-gray-600 dark:text-neutral-400">Button text</span>
                <input name="paywall_button_label" value={paywallButton}
                  onChange={(e) => setPaywallButton(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder-neutral-500" />
              </label>
              <button type="button"
                onClick={() => { setPaywallDefault(DEFAULT_PAYWALL_MESSAGE); setPaywallButton(DEFAULT_PAYWALL_BUTTON); }}
                className="justify-self-start text-[11px] font-medium text-gray-500 underline hover:text-gray-900 dark:text-neutral-400 dark:hover:text-white">
                Reset to default
              </button>
            </div>

            {/* Smart first-time message — just an on/off switch, AI fully writes it */}
            <div className="rounded-lg border border-gray-200 p-4 dark:border-neutral-800">
              <Toggle label="Smart first-time message (she writes it herself, once)" name="smart_paywall_enabled" checked={smartPaywall} onChange={setSmartPaywall} accent="soft" />
              {smartPaywall && (
                <div className="mt-3">
                  <Toggle label="Send that first one as a voice note" name="paywall_as_voice" checked={paywallVoice} onChange={setPaywallVoice} accent="soft" />
                </div>
              )}
              <p className="mt-2 text-[11px] text-gray-500 dark:text-neutral-500">
                Only the very first time a fan runs out, she writes a personal line referencing the chat. She fully decides what to say. Off = the default message above is used every time.
              </p>
            </div>
          </Section>

          <Section title="Response timing" hint="How long the bot waits silently before typing starts. 0s = instant. Pick a range — each reply picks a random wait between min and max. Typing only shows after the wait, so a 60s max means no typing indicator for up to 60s.">
            <div className="grid grid-cols-2 gap-4">
              <Slider label="Min wait" name="response_wait_min" value={waitMin} onChange={setWaitMin}
                min={0} max={60} step={1} format={(v) => `${v}s`} />
              <Slider label="Max wait" name="response_wait_max" value={waitMax} onChange={setWaitMax}
                min={0} max={60} step={1} format={(v) => `${v}s`} />
            </div>
          </Section>

          <Section title="Memory" hint="How many past messages she remembers each reply. Higher = better continuity but costs more tokens; lower = cheaper, shorter memory.">
            <div className="grid grid-cols-2 gap-4">
              <Slider label="Past messages remembered" name="memory_window" value={memoryWindow} onChange={setMemoryWindow}
                min={1} max={100} step={1} format={(v) => `${v} msgs`} />
            </div>
          </Section>

          <Section title="AI Models" hint="Search by name — price shown per 1M prompt tokens.">
            <div className="grid grid-cols-2 gap-4">
              {MODEL_FIELDS.map((m) => (
                <ModelSelect key={m.name} label={m.label} name={m.name} models={models}
                  defaultValue={(clone[m.name] as string) || m.def} />
              ))}
            </div>
          </Section>
        </div>

        {/* ── PROMPTS ────────────────────────────────────────────── */}
        <div className={hide("prompts")}>
          <Section title="Onboarding questionnaire" hint="Her answers — the source the AI builds her personality from. Saving auto-recompiles her personality whenever you change these (toggles/models don't need it).">
            <IntakeFields fields={clone.intake?.fields} legacyAnswers={clone.intake?.answers} />
          </Section>

          <Section title="Live prompt — exactly what the bot uses now" hint="Built automatically from her answers + your current toggles. Turn a feature off in Config and it disappears here after you Save. Read-only — to change it, edit her answers above or the toggles in Config.">
            {([
              ["text", "Text"],
              ["voice", "Voice"],
              ["routing", "Routing"],
              ["vision", "Photo-reply"],
            ] as const).map(([key, label]) => (
              <label key={key} className="block">
                <span className="mb-1 block text-xs text-gray-500 dark:text-neutral-400">{label}</span>
                <textarea
                  readOnly
                  rows={6}
                  value={livePrompts[key] || "(empty — add her answers and Save to generate)"}
                  className="w-full cursor-default rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 font-mono text-xs leading-relaxed text-gray-600 outline-none dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400"
                />
              </label>
            ))}
            <div>
              <button type="button" onClick={recompile} disabled={busy}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-50 dark:border-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-900">
                {step === "compiling" ? "Re-compiling…" : "Re-compile her personality from answers"}
              </button>
            </div>
          </Section>
        </div>

        {/* Save bar — shared by Config + Prompts, hidden on Media */}
        <div className={"flex items-center justify-between gap-4 " + (tab === "media" ? "hidden" : "")}>
          <button type="button" onClick={handleDelete}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 transition">
            Delete clone
          </button>

          <div className="flex items-center gap-3">
            {step === "saving" && <span className="text-sm text-gray-500 dark:text-neutral-400">Saving…</span>}
            {step === "compiling" && <span className="text-sm text-gray-500 dark:text-neutral-400">Compiling…</span>}
            {step === "done" && <span className="text-sm text-green-600 font-medium">Saved ✓</span>}
            {step === "save-error" && <span className="text-sm text-red-600">Save failed: {errorMsg}</span>}
            {step === "compile-error" && <span className="text-sm text-red-600">Compile failed: {errorMsg}</span>}

            <button type="submit" disabled={busy}
              className="rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 transition disabled:opacity-50">
              {isPaused ? "Save (stay paused)" : "Save changes"}
            </button>
            {isPaused && (
              <button type="button" onClick={() => save(true)} disabled={busy}
                className="rounded-lg bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-700 transition disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white">
                Finalise → go live
              </button>
            )}
          </div>
        </div>
      </form>

      {/* ── MEDIA (outside the form — own upload actions) ─────────── */}
      <div className={tab === "media" ? "" : "hidden"}>
        <MediaManager cloneId={clone.id} photos={photos} videos={videos} bundles={bundles} />
      </div>
    </div>
  );
}
