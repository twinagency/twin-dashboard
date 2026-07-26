"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Clone } from "@/lib/types";
import type { PromptPreview } from "@/lib/compiler";
import type { OrModel } from "@/app/api/models/route";
import IntakeFields from "./IntakeFields";
import { INTAKE_FIELD_KEYS, INTAKE_SECTIONS, proseValue } from "@/lib/intake";
import PersonaFactsFields from "./clone/PersonaFactsFields";
import MediaManager from "@/app/media/MediaManager";
import FlowGraph from "./flow/FlowGraph";
import type { CloneCfg } from "./flow/graph";
import ConfigSections from "./clone/ConfigSections";
import { Modal, Section } from "./clone/fields";
import { useCloneConfig } from "./clone/useCloneConfig";
import { updateClone, deleteClone } from "@/app/clones/actions";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

type Step = "idle" | "saving" | "compiling" | "done" | "save-error" | "compile-error";

// ONE flat tab bar for the whole page — PPVs, Identity, Config, Money, View.
// There used to be two stacked strips (an outer PPVs/Edit/Monetization row plus
// Edit's own sub-tabs); that made you drill two levels to reach a setting and
// ate ~140px before any content. ConfigSections renders the single bar (it owns
// Identity/Config/Money); PPVs and View are passed in as extraTabs and rendered
// here.
type Tab = "ppvs" | "identity" | "config" | "money" | "view";
type MediaProps = React.ComponentProps<typeof MediaManager>;

const EXTRA_TABS: { key: Tab; label: string; hint: string }[] = [
  { key: "view", label: "👁 View", hint: "Read-only: flow diagram + live prompts" },
];
const ALL_TABS: Tab[] = ["ppvs", "identity", "config", "money", "view"];

// Every retired route shape still in links, bookmarks and the sidebar. Old URLs
// carried tab= plus an optional sub=; both collapse onto the flat tab list.
const LEGACY_TAB: Record<string, Tab> = {
  config: "identity",
  media: "ppvs",
  monetization: "money",
  advanced: "config",
};
const LEGACY_SUB: Record<string, Tab> = {
  persona: "identity",
  media: "identity",
  engagement: "identity",
  advanced: "config",
  prompts: "view",
  flow: "view",
};
function resolveTab(tabParam: string | null, subParam: string | null): Tab {
  // A sub= is more specific than the tab= it came with, so it wins.
  if (subParam && LEGACY_SUB[subParam]) return LEGACY_SUB[subParam];
  if (tabParam && ALL_TABS.includes(tabParam as Tab)) return tabParam as Tab;
  if (tabParam && LEGACY_TAB[tabParam]) return LEGACY_TAB[tabParam];
  return "identity";
}

export default function CloneForm({
  clone,
  promptPreview,
  photos,
  videos,
  bundles,
}: {
  clone: Clone;
  promptPreview: PromptPreview;
  photos: MediaProps["photos"];
  videos: MediaProps["videos"];
  bundles: MediaProps["bundles"];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const formRef = useRef<HTMLFormElement>(null);
  const tabParam = searchParams.get("tab");
  const subParam = searchParams.get("sub");
  const [tab, setTab] = useState<Tab>(resolveTab(tabParam, subParam));
  const [questionnaireOpen, setQuestionnaireOpen] = useState(false);
  const [models, setModels] = useState<OrModel[]>([]);
  const [step, setStep] = useState<Step>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const [cfg, set] = useCloneConfig(clone);

  useEffect(() => {
    fetch("/api/models").then((r) => r.json()).then((d) => Array.isArray(d) && setModels(d)).catch(() => {});
  }, []);

  // The sidebar deep-links via ?tab= — clicking one doesn't remount CloneForm
  // (same route, just a query change), so pick the change up here.
  useEffect(() => {
    const next = resolveTab(tabParam, subParam);
    if (next !== tab) setTab(next);
  }, [tabParam, subParam]);

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

  const intakeFilled = useMemo(
    () => INTAKE_FIELD_KEYS.filter((k) => (proseValue(k, clone.intake?.fields) ?? "").trim() !== "").length,
    [clone.intake?.fields],
  );

  const busy = step === "saving" || step === "compiling";
  const isPaused = clone.status !== "active";
  const show = (t: Tab) => (tab === t ? "grid gap-4" : "hidden");

  // Live view config for the Flow tab — built from current form state so the
  // graph reflects toggles instantly. Model names + welcome/onboarding counts
  // read from the saved clone (uncontrolled fields).
  const flowCfg: CloneCfg = useMemo(
    () => ({
      ai_mode: cfg.aiMode,
      smart_split: cfg.smartSplit,
      charge_messages: cfg.charge,
      photos_enabled: cfg.photosEnabled,
      videos_enabled: cfg.videosEnabled,
      bundles_enabled: cfg.bundlesEnabled,
      voice_enabled: cfg.voice,
      tips_enabled: cfg.tips,
      discounts_enabled: cfg.discountsEnabled,
      emojis_enabled: cfg.emojis,
      live_captions_enabled: cfg.liveCaptions,
      thank_you_enabled: cfg.thankYou,
      drip_enabled: cfg.dripEnabled,
      welcome_bundle_after: clone.welcome_bundle_after ?? null,
      onboarding_voice_after: clone.onboarding_voice_after ?? null,
      text_model: clone.text_model,
      routing_model: clone.routing_model,
    }),
    [cfg, clone.welcome_bundle_after, clone.onboarding_voice_after, clone.text_model, clone.routing_model],
  );

  return (
    <div className="grid gap-4">
      {/* Identity + Config + Money live in one form so a single Save persists
          all of them, from any tab. The tab bar itself is rendered by
          ConfigSections (one flat strip, PPVs and View injected as extraTabs). */}
      <form ref={formRef} onSubmit={(e) => { e.preventDefault(); save(false); }} className="grid gap-4">
        <div className={tab === "ppvs" ? "hidden" : "grid gap-4"}>
        <ConfigSections
          cfg={cfg}
          set={set}
          clone={clone}
          models={models}
          mode="edit"
          tab={tab}
          onTabChange={(t) => setTab(t as Tab)}
          extraTabs={EXTRA_TABS}
          identityWhoSlot={<PersonaFactsFields clone={clone} legacyFields={clone.intake?.fields} part="who" />}
          identitySocialsSlot={<PersonaFactsFields clone={clone} legacyFields={clone.intake?.fields} part="socials" />}
          identityVibeSlot={<PersonaFactsFields clone={clone} legacyFields={clone.intake?.fields} part="vibe" />}
          identityLimitsSlot={<PersonaFactsFields clone={clone} legacyFields={clone.intake?.fields} part="limits" />}
          identityQuestionnaireSlot={
            <>
              {/* This is the highest-leverage writing on the page - her voice
                  comes from these answers — so it gets a full card that shows
                  what's inside and how much is filled, not a thin row. The
                  fields live in an overlay to keep the tab short, but they stay
                  mounted inside the form so Save always submits them. */}
              <button
                type="button"
                onClick={() => setQuestionnaireOpen(true)}
                className="flex h-full w-full flex-col rounded-xl border border-line border-l-[3px] border-l-cyan-400/70 bg-panel p-3 text-left transition hover:border-accent/60"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-cyan-400/15 text-[11px]">
                    📝
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-ink">
                    Onboarding questionnaire
                  </span>
                  <span className="ml-auto flex shrink-0 items-center gap-2">
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold " +
                        (intakeFilled === 0
                          ? "bg-warn/15 text-warn"
                          : intakeFilled === INTAKE_FIELD_KEYS.length
                            ? "bg-good/15 text-good"
                            : "bg-accent/15 text-accent")
                      }
                    >
                      {intakeFilled}/{INTAKE_FIELD_KEYS.length} answered
                    </span>
                    <span className="text-[11px] font-medium text-accent">Open ↗</span>
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {INTAKE_SECTIONS.map((sec) => (
                    <span
                      key={sec.title}
                      className="rounded-full border border-line px-2 py-0.5 text-[10px] text-muted"
                    >
                      {sec.title}
                    </span>
                  ))}
                </div>
              </button>
              <Modal
                open={questionnaireOpen}
                onClose={() => setQuestionnaireOpen(false)}
                title="Onboarding questionnaire"
                hint="The writing only you can do. Saving auto-recompiles her personality whenever these (or the typed facts) change."
              >
                <IntakeFields fields={clone.intake?.fields} legacyAnswers={clone.intake?.answers} />
              </Modal>
            </>
          }
        />

        </div>

        {/* ── VIEW (read-only: flow diagram, then the live prompts) ── */}
        <div className={tab === "view" ? "grid gap-4" : "hidden"}>
          <FlowGraph cfg={flowCfg} />
          <Section
            title={`Live prompt: ${promptPreview.mode === "smart" ? (promptPreview.smartSplit ? "Smart (writer + decider)" : "Smart (one model)") : "Classic"} flow`}
            hint="Exactly what the bot feeds the model for THIS clone's live flow + toggles. Read-only - change it via Identity or Config, then Save."
          >
            {promptPreview.blocks.map((b) => (
              <label key={b.key} className="block">
                <span className="mb-1 block text-xs font-medium text-muted">{b.label}</span>
                <span className="mb-1 block text-[11px] text-muted">{b.hint}</span>
                <textarea
                  readOnly
                  rows={8}
                  value={b.content}
                  className="w-full cursor-default rounded-xl border border-line bg-bg px-3 py-2.5 font-mono text-xs leading-relaxed text-muted outline-none"
                />
              </label>
            ))}
            <div>
              <Button type="button" variant="outline" onClick={recompile} disabled={busy}>
                {step === "compiling" ? "Re-compiling…" : "Re-compile her personality from answers"}
              </Button>
            </div>
          </Section>
        </div>

        {/* Save bar - shared by Edit (except read-only Flow) + Monetization */}
        <div
          className={
            "flex items-center justify-between gap-4 " +
            (tab === "identity" || tab === "config" || tab === "money" ? "" : "hidden")
          }
        >
          <Button type="button" variant="destructive" onClick={handleDelete}>
            Delete clone
          </Button>

          <div className="flex items-center gap-3">
            {step === "saving" && <span className="text-sm text-muted">Saving…</span>}
            {step === "compiling" && <span className="text-sm text-muted">Compiling…</span>}
            {step === "done" && <Badge className="bg-good/15 text-good">Saved ✓</Badge>}
            {step === "save-error" && <span className="text-sm text-crit">Save failed: {errorMsg}</span>}
            {step === "compile-error" && <span className="text-sm text-crit">Compile failed: {errorMsg}</span>}

            <Button type="submit" disabled={busy}>
              {isPaused ? "Save (stay paused)" : "Save changes"}
            </Button>
            {isPaused && (
              <Button type="button" onClick={() => save(true)} disabled={busy}>
                Finalise → go live
              </Button>
            )}
          </div>
        </div>
      </form>

      {/* ── PPVs (its own page - own top bar, own upload actions) ─── */}
      <div className={tab === "ppvs" ? "grid gap-4" : "hidden"}>

        <MediaManager cloneId={clone.id} photos={photos} videos={videos} bundles={bundles} />
      </div>

    </div>
  );
}
