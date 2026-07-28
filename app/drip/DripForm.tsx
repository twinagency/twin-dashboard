"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Area, Field, FieldLabel, GroupHeader, Section, Toggle, inputCls } from "@/components/clone/fields";
import { saveCampaign } from "./actions";

type MediaRow = {
  id: string;
  storage_path: string;
  caption: string | null;
  teaser_caption: string | null;
  star_value: number;
  is_free: boolean | null;
};

type BundleRow = {
  id: string;
  name: string;
  caption: string | null;
  star_price: number;
  photo_bundle_items: { id: string; storage_path: string; sort_order: number }[];
};

type StepType = "text" | "voice" | "photo" | "video" | "bundle";
// mediaId: for photo/video/bundle steps, the specific item to send; null = AI picks.
type Step = { type: StepType; afterHours: number; mediaId: string | null };
const isMediaType = (t: StepType) => t === "photo" || t === "video" || t === "bundle";

// Emoji type chips, same visual language as the Fans page filter chips.
const STEP_TYPES: { key: StepType; label: string; emoji: string; hint: string }[] = [
  { key: "text", label: "Text", emoji: "💬", hint: "AI writes a fresh line in her voice." },
  { key: "voice", label: "Voice", emoji: "🎙️", hint: "AI writes the line, sent as a voice note." },
  { key: "photo", label: "Photo", emoji: "📷", hint: "Teases a fresh pic he hasn't seen." },
  { key: "video", label: "Video", emoji: "🎥", hint: "Teases a fresh video he hasn't seen." },
  { key: "bundle", label: "Bundle", emoji: "🎁", hint: "Sends the next bundle he hasn't been sent." },
];
const STEP_EMOJI: Record<StepType, string> = Object.fromEntries(
  STEP_TYPES.map((t) => [t.key, t.emoji]),
) as Record<StepType, string>;

type Initial = {
  enabled: boolean;
  steps: Step[];
  // New-fan onboarding: free-text steer for her first message, a voice note on
  // message N, the welcome bundle on message N (optionally teased first), the
  // details she should naturally try to collect, and how long that collection
  // steer keeps getting nudged before she just chats normally.
  welcomeInstruction: string | null;
  welcomeBundleAfter: number;
  welcomeBundleTeased: boolean;
  onboardingVoiceAfter: number | null;
  onboardingCollectFields: string[];
  onboardingLength: number;
  followupAfterMinutes: number;
};

// Predefined onboarding detail keys, in the exact order + keys that
// bot/src/flows/human.ts's COLLECT_FIELD_PHRASE map uses, so the AI's steer
// reads naturally ("naturally work out his name, age, ..."). A fan operator can
// also type a custom key (slugified below) — human.ts falls back to
// `his ${key.replace(/_/g,' ')}` for anything not in that map.
const COLLECT_FIELD_CHIPS: { key: string; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "age", label: "Age" },
  { key: "country", label: "Country" },
  { key: "city", label: "City" },
  { key: "timezone", label: "Timezone" },
  { key: "job", label: "Job" },
  { key: "relationship_status", label: "Relationship status" },
  { key: "interests", label: "Interests" },
  { key: "likes", label: "Likes / turn-ons" },
  { key: "birthday", label: "Birthday" },
  { key: "language", label: "Language" },
  { key: "how_found", label: "How he found her" },
];

// lowercase, spaces/punctuation → underscores, so a typed "shoe size" becomes
// the key "shoe_size" (reads as "his shoe size" via human.ts's fallback phrasing).
function slugifyCollectKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Chip picker for onboarding_collect_fields: predefined chips toggle on/off,
// plus a text box to add a custom key. Same chip visual language as STEP_TYPES
// below. Uncontrolled-by-name isn't possible here (it's an array), so the parent
// keeps the array in state and JSON-stringifies it into a hidden field on submit
// (drip_steps in this same file does the identical thing).
function CollectFieldsPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [customInput, setCustomInput] = useState("");
  const toggle = (key: string) =>
    onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);
  const addCustom = () => {
    const key = slugifyCollectKey(customInput);
    if (key && !value.includes(key)) onChange([...value, key]);
    setCustomInput("");
  };
  // Any selected key not in the predefined list is a custom one — show it as its
  // own removable chip so it's visible after being added.
  const customChips = value.filter((k) => !COLLECT_FIELD_CHIPS.some((c) => c.key === k));

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-1.5">
        {COLLECT_FIELD_CHIPS.map((c) => {
          const on = value.includes(c.key);
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => toggle(c.key)}
              className={
                "rounded-full border px-2.5 py-1 text-xs font-medium transition " +
                (on ? "border-accent/50 bg-accent/15 text-accent" : "border-line text-ink/70 hover:border-accent/40")
              }
            >
              {c.label}
            </button>
          );
        })}
        {customChips.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => toggle(k)}
            title="Custom - click to remove"
            className="rounded-full border border-accent/50 bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent"
          >
            {k.replace(/_/g, " ")} ✕
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input
          type="text"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder="Add a custom detail (e.g. shoe size)"
          className={inputCls + " flex-1"}
        />
        <button
          type="button"
          onClick={addCustom}
          className="shrink-0 rounded-md border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-bg"
        >
          + Add
        </button>
      </div>
    </div>
  );
}

// Signed-url thumbnail (private bucket), same pattern as the Media manager.
function Thumb({ path, type }: { path: string; type: "photo" | "video" }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/media-sign?path=${encodeURIComponent(path)}`)
      .then((r) => r.json())
      .then((d) => d.url && setUrl(d.url))
      .catch(() => {});
  }, [path]);
  const cls = "h-full w-full object-cover";
  if (!url) return <div className="h-full w-full animate-pulse bg-muted/10" />;
  if (type === "video") return <video src={url} className={cls} muted preload="metadata" />;
  return <img src={url} alt="" className={cls} />;
}

// Per-step media picker: a compact horizontal strip shown under a photo/video/
// bundle step. First chip is "AI picks" (auto, the default); the rest are the
// clone's items of that type — tap one to lock this step to that exact item.
function StepMediaPicker({
  type,
  photos,
  videos,
  bundles,
  photosEnabled,
  videosEnabled,
  bundlesEnabled,
  value,
  onPick,
}: {
  type: "photo" | "video" | "bundle";
  photos: MediaRow[];
  videos: MediaRow[];
  bundles: BundleRow[];
  photosEnabled: boolean;
  videosEnabled: boolean;
  bundlesEnabled: boolean;
  value: string | null;
  onPick: (id: string | null) => void;
}) {
  const enabled = type === "photo" ? photosEnabled : type === "video" ? videosEnabled : bundlesEnabled;
  if (!enabled) {
    return (
      <p className="mt-1 w-full text-[11px] text-warn">
        {type[0].toUpperCase() + type.slice(1)}s are off for this clone - turn them on in Configure, or this step falls
        back to an AI text line.
      </p>
    );
  }

  const cover = (b: BundleRow) =>
    [...b.photo_bundle_items].sort((a, c) => a.sort_order - c.sort_order)[0]?.storage_path ?? null;

  const items: { id: string; path: string | null; label: string; isVideo: boolean }[] =
    type === "bundle"
      ? bundles.map((b) => ({ id: b.id, path: cover(b), label: b.name, isVideo: false }))
      : (type === "photo" ? photos : videos).map((m) => ({
          id: m.id,
          path: m.storage_path,
          label: m.is_free || m.star_value === 0 ? "free" : `${m.star_value}⭐`,
          isVideo: type === "video",
        }));

  return (
    <div className="mt-1 w-full">
      <div className="mb-1 text-[11px] text-muted">
        {value ? "Sends this exact item:" : "AI picks a fresh unseen item for this step."}
      </div>
      {items.length === 0 ? (
        <p className="text-[11px] text-muted">No {type}s uploaded yet - add some in the Media tab.</p>
      ) : (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => onPick(null)}
            className={
              "flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border-2 text-[10px] font-medium leading-tight transition " +
              (value === null
                ? "border-accent bg-accent/15 text-accent"
                : "border-line text-muted hover:border-accent/60")
            }
          >
            <span className="text-base">🤖</span>
            AI picks
          </button>
          {items.map((it) => {
            const on = value === it.id;
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => onPick(it.id)}
                title={it.label}
                className={
                  "relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition " +
                  (on ? "border-good ring-2 ring-good/30" : "border-line hover:border-accent/60")
                }
              >
                {it.path ? (
                  <Thumb path={it.path} type={it.isVideo ? "video" : "photo"} />
                ) : (
                  <div className="h-full w-full bg-muted/10" />
                )}
                <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 py-0.5 text-[9px] font-medium text-white">
                  {type === "bundle" ? "🎁 " : ""}
                  {it.label}
                </span>
                {on && (
                  <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-good text-[10px] font-bold text-white">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Small 0h to 24h strip with a dot per step, so the day's rhythm reads at a glance.
function Timeline({ steps }: { steps: Step[] }) {
  if (steps.length === 0) return null;
  return (
    <div className="pt-1">
      <div className="relative mx-1 h-9">
        {/* baseline */}
        <div className="absolute left-0 right-0 top-6 h-px bg-line" />
        {/* window edges */}
        <div className="absolute left-0 top-5 h-2 w-px bg-line" />
        <div className="absolute right-0 top-5 h-2 w-px bg-line" />
        {steps.map((s, i) => (
          <div
            key={i}
            className="absolute top-0 -translate-x-1/2 text-center"
            style={{ left: `${(s.afterHours / 24) * 100}%` }}
            title={`${STEP_EMOJI[s.type]} ${s.afterHours}h`}
          >
            <div className="text-sm leading-4">{STEP_EMOJI[s.type]}</div>
            <div className="mx-auto mt-1 h-1.5 w-1.5 rounded-full bg-accent" />
          </div>
        ))}
      </div>
      <div className="mx-1 flex justify-between text-[10px] text-muted">
        <span>0h (his last message)</span>
        <span>24h (window closes)</span>
      </div>
    </div>
  );
}

export default function DripForm({
  cloneId,
  photosEnabled,
  videosEnabled,
  bundlesEnabled,
  photos,
  videos,
  bundles,
  initial,
}: {
  cloneId: string;
  photosEnabled: boolean;
  videosEnabled: boolean;
  bundlesEnabled: boolean;
  photos: MediaRow[];
  videos: MediaRow[];
  bundles: BundleRow[];
  initial: Initial;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const [enabled, setEnabled] = useState(initial.enabled);
  const [steps, setSteps] = useState<Step[]>(initial.steps);
  const [welcomeBundleTeased, setWelcomeBundleTeased] = useState(initial.welcomeBundleTeased);
  const [collectFields, setCollectFields] = useState<string[]>(initial.onboardingCollectFields);

  // Switching a step's type clears any picked media (ids don't carry across
  // types, and text/voice steps have no media).
  const setStepType = (i: number, type: StepType) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, type, mediaId: null } : s)));
  const setStepMedia = (i: number, mediaId: string | null) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, mediaId } : s)));
  const setStepHours = (i: number, raw: string) => {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n)) return;
    const afterHours = Math.min(23, Math.max(1, n));
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, afterHours } : s)));
  };
  const addStep = () =>
    setSteps((prev) => {
      // Default the new step a couple hours past the latest one, capped at 23.
      const last = prev.reduce((m, s) => Math.max(m, s.afterHours), 0);
      return [...prev, { type: "text", afterHours: Math.min(23, Math.max(1, last + 2)), mediaId: null }];
    });
  const removeStep = (i: number) => setSteps((prev) => prev.filter((_, idx) => idx !== i));
  const moveStep = (i: number, dir: -1 | 1) =>
    setSteps((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const sortedSteps = [...steps].sort((a, b) => a.afterHours - b.afterHours);

  async function onSubmit(fd: FormData) {
    // Steps save sorted by hour: the stored list is the firing order.
    fd.set(
      "drip_steps",
      JSON.stringify(
        sortedSteps.map((s) => ({
          type: s.type,
          after_hours: s.afterHours,
          ...(isMediaType(s.type) && s.mediaId ? { media_id: s.mediaId } : {}),
        })),
      ),
    );
    // Onboarding collect-fields: same hidden-field JSON pattern as drip_steps above.
    fd.set("onboarding_collect_fields", JSON.stringify(collectFields));
    startTransition(async () => {
      await saveCampaign(cloneId, fd);
      setSteps(sortedSteps);
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2500);
    });
  }

  return (
    <form action={onSubmit} className="grid max-w-3xl gap-6">
      {/* ── New fan onboarding - trimmed to the two triggers that matter.
          Greeting/voice scripts and detail-collection were removed: she greets
          and gets to know a new fan naturally in chat. Bundle timing lives in
          the automated campaign, not here. ─────────────────────────────── */}
      <GroupHeader
        label="New fan"
        hint="Configurable triggers and instructions for a brand-new fan. Leave a field blank to skip it - she still greets and gets to know him naturally in chat."
      />
      <Section icon="🚀" accent="cyan" title="Onboarding" cols={2}>
        <Field
          label="Voice note on msg #"
          name="onboarding_voice_after"
          type="number"
          defaultValue={initial.onboardingVoiceAfter}
          placeholder="blank = off"
          hint="That turn's reply comes as a voice note instead of text."
        />
        <Field
          label="Bundle on msg #"
          name="welcome_bundle_after"
          type="number"
          defaultValue={initial.welcomeBundleAfter}
          placeholder="blank = off"
          hint="Sends the welcome bundle on this message."
        />
        <div className="sm:col-span-2">
          <Toggle
            label={welcomeBundleTeased ? "She sends a short tease line first" : "Bundle sends with no lead-in"}
            name="welcome_bundle_teased"
            checked={welcomeBundleTeased}
            onChange={setWelcomeBundleTeased}
            accent="soft"
            hint="A short AI-written flirty tease message ('I've got something for you...') goes out as its own text right before the paid bundle."
          />
        </div>
        <Field
          label="Onboarding runs for (messages)"
          name="onboarding_length"
          type="number"
          defaultValue={initial.onboardingLength}
          hint="After this many messages she stops steering to collect the info below and just chats normally, regardless of what's still missing."
        />
        <div className="sm:col-span-2">
          <Area
            label="First message instructions"
            name="welcome_instruction"
            defaultValue={initial.welcomeInstruction}
            rows={2}
            placeholder='blank = "greet him warmly, introduce yourself by name, be flirty, and ask his name"'
            hint="How she should open the very FIRST message to a brand-new fan - a free-text steer, written into her own AI-generated line."
          />
        </div>
        <div className="sm:col-span-2">
          <FieldLabel
            label="Info to collect"
            hint="Details she'll naturally, gently try to work into the first several messages (never an interview). Toggle the ones you want, or add your own below."
          />
          <CollectFieldsPicker value={collectFields} onChange={setCollectFields} />
        </div>
      </Section>

      {/* ── Mid-chat follow-up (moved off Configure) ─────────────── */}
      <Section
        icon="⏰"
        accent="amber"
        title="Follow-up"
        hint="One short nudge in her voice if he goes quiet mid-chat, once per hang, never repeated until he replies."
      >
        <Field
          label="Follow-up (mins)"
          name="followup_after_minutes"
          type="number"
          defaultValue={initial.followupAfterMinutes}
          placeholder="0"
        />
      </Section>

      {/* ── Automated campaign ───────────────────────────────────── */}
      <GroupHeader
        label="Automated campaign"
        hint="Timed steps that fire while a fan goes quiet. Telegram only lets her message a fan within 24 hours of his last activity, so every step lands inside that window."
      />
      <Section
        title="Steps"
        hint="Each step is WHEN (hours after his last message) plus WHAT (text, voice, photo, video, or bundle). Content is never canned: text and voice lines are AI-written fresh in her voice, media is always something he hasn't seen. The moment he replies, the timer resets to 0."
        tip="Steps fire in hour order (they re-sort on save). Voice, photo, video and bundle steps only fire when that feature is on for this clone; a step with nothing fresh to send falls back to an AI text line."
      >
        <Toggle
          label={enabled ? "Campaign is on: she re-engages quiet fans" : "Campaign is off: she never messages first"}
          name="drip_enabled"
          checked={enabled}
          onChange={setEnabled}
          accent="soft"
        />

        {enabled && (
          <>
            {steps.length === 0 && (
              <p className="text-[11px] text-warn">No steps yet. She won't reach out until you add at least one.</p>
            )}

            <div className="grid gap-2">
              {steps.map((s, i) => {
                return (
                  <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-2.5">
                    <span className="w-5 shrink-0 text-right text-xs font-medium text-muted">{i + 1}</span>
                    <label className="flex shrink-0 items-center gap-1.5 text-sm text-ink">
                      after
                      <input
                        type="number"
                        min={1}
                        max={23}
                        value={s.afterHours}
                        onChange={(e) => setStepHours(i, e.target.value)}
                        className={inputCls + " w-16 text-center"}
                      />
                      h
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {STEP_TYPES.map((t) => (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => setStepType(i, t.key)}
                          title={t.hint}
                          className={
                            "rounded-full border px-2.5 py-1 text-xs font-medium transition " +
                            (s.type === t.key
                              ? "border-accent/50 bg-accent/15 text-accent"
                              : "border-line text-ink/70 hover:border-accent/40")
                          }
                        >
                          {t.emoji} {t.label}
                        </button>
                      ))}
                    </div>
                    <div className="ml-auto flex shrink-0 gap-1">
                      <button type="button" onClick={() => moveStep(i, -1)} disabled={i === 0} className="rounded border border-line px-1.5 text-xs text-muted disabled:opacity-30" title="Move up">↑</button>
                      <button type="button" onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} className="rounded border border-line px-1.5 text-xs text-muted disabled:opacity-30" title="Move down">↓</button>
                      <button type="button" onClick={() => removeStep(i)} className="rounded border border-line px-1.5 text-xs text-crit" title="Remove">✕</button>
                    </div>
                    {isMediaType(s.type) && (
                      <StepMediaPicker
                        type={s.type as "photo" | "video" | "bundle"}
                        photos={photos}
                        videos={videos}
                        bundles={bundles}
                        photosEnabled={photosEnabled}
                        videosEnabled={videosEnabled}
                        bundlesEnabled={bundlesEnabled}
                        value={s.mediaId}
                        onPick={(id) => setStepMedia(i, id)}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={addStep}
              className="justify-self-start rounded-md border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-bg"
            >
              + Add step
            </button>

            <Timeline steps={sortedSteps} />
          </>
        )}

      </Section>

      {/* ── Save bar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink transition hover:bg-accent-deep disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save campaign"}
        </button>
        {saved && <span className="text-sm text-good">Saved ✓</span>}
      </div>
    </form>
  );
}
