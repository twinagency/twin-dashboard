"use client";
import { AdminOnly, ManagerOnly, ReadOnlyEditor, useDashboardAccess } from "./DashboardAccessProvider";
import { isMoxy } from "@/lib/agency-brand";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import type { Clone } from "@/lib/types";
import type { PromptPreview } from "@/lib/compiler";
import type { OrModel } from "@/app/api/models/route";
import IntakeFields from "./IntakeFields";
import { INTAKE_FIELD_KEYS, INTAKE_SECTIONS, proseValue } from "@/lib/intake";
import PersonaFactsFields from "./clone/PersonaFactsFields";
import CloneAppearanceEditor from "./clone/CloneAppearanceEditor";
import MediaManager from "@/app/media/MediaManager";
import FlowGraph from "./flow/FlowGraph";
import type { CloneCfg } from "./flow/graph";
import ConfigSections from "./clone/ConfigSections";
import IntelligenceControls from "./clone/intelligence/IntelligenceControls";
import { canShowIntelligence } from "./clone/intelligence/model";
import { resolveAdvancedView, type AdvancedView } from "./clone/intelligence/sections";
import advancedStyles from "./clone/intelligence/IntelligenceControls.module.css";
import { STUDIO_PAGES, StudioNavigation, isStudioTab, resolveStudioPanel } from "./clone/CreatorStudio";
import studioStyles from "./clone/CreatorStudio.module.css";
import BlurToggle from "./BlurToggle";
import { FieldLabel, Modal, Section } from "./clone/fields";
import { useCloneConfig } from "./clone/useCloneConfig";
import { updateClone, deleteClone } from "@/app/clones/actions";
import { Button } from "./ui/button";
import {
  ControlPlaneNavigation,
  CreatorStudioStatus,
  ReadOnlyControlPlaneNotice,
  type ControlPlaneTab,
} from "./clone/CreatorControlPlaneShell";

type Step = "idle" | "saving" | "done" | "save-error";

// ONE flat tab bar for the whole page — PPVs, Identity, Config, Money, View.
// There used to be two stacked strips (an outer PPVs/Edit/Monetization row plus
// Edit's own sub-tabs); that made you drill two levels to reach a setting and
// ate ~140px before any content. ConfigSections renders the single bar (it owns
// Identity/Config/Money); PPVs and View are passed in as extraTabs and rendered
// here.
// "advanced" isn't in ConfigSections' extraTabs/leadingTabs — it's one of its
// own built-in TABS (identity/config/money/advanced) — but its clicks still
// flow up through onTabChange into this state via an `as Tab` cast, so it
// must be a real member here too or comparisons against it silently miss.
type Tab = ControlPlaneTab;
type MediaProps = React.ComponentProps<typeof MediaManager>;

const EXTRA_TABS: { key: Tab; label: string; hint: string }[] = [
  { key: "view", label: "System view", hint: "Read-only: flow diagram + compiled prompts" },
];
const ALL_TABS: Tab[] = ["ppvs", "identity", "config", "money", "advanced", "view"];

// Every retired route shape still in links, bookmarks and the sidebar. Old URLs
// carried tab= plus an optional sub=; both collapse onto the flat tab list.
const LEGACY_TAB: Record<string, Tab> = {
  config: "identity",
  media: "ppvs",
  monetization: "money",
  advanced: "advanced",
};
const LEGACY_SUB: Record<string, Tab> = {
  persona: "identity",
  media: "identity",
  engagement: "identity",
  advanced: "advanced",
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

type FormSnapshot = Record<string, string[]>;

function snapshotForm(form: HTMLFormElement | null): FormSnapshot {
  if (!form) return {};
  const snapshot: FormSnapshot = {};
  for (const [name, rawValue] of new FormData(form).entries()) {
    // Leading-underscore inputs are UI controls paired with a canonical hidden
    // field (for example `_status_toggle` -> `status`). They are deliberately
    // ignored by the server action, so counting them would turn one logical
    // edit into two review rows and imply that a helper value is persisted.
    if (name.startsWith("_")) continue;
    // Browsers materialise an empty file input as a fresh zero-byte File on
    // each FormData read. Its generated timestamp changes even when the user
    // did nothing, so omit only that empty placeholder from dirty comparison.
    if (typeof File !== "undefined" && rawValue instanceof File && !rawValue.name && rawValue.size === 0) continue;
    const value =
      typeof File !== "undefined" && rawValue instanceof File
        ? `file:${rawValue.name}:${rawValue.size}:${rawValue.lastModified}`
        : String(rawValue);
    (snapshot[name] ??= []).push(value);
  }
  return snapshot;
}

function changedSnapshotKeys(baseline: FormSnapshot, current: FormSnapshot) {
  const names = new Set([...Object.keys(baseline), ...Object.keys(current)]);
  return [...names]
    .filter((name) => JSON.stringify(baseline[name] ?? []) !== JSON.stringify(current[name] ?? []))
    .sort((a, b) => a.localeCompare(b));
}

function humanFieldName(name: string) {
  const initialisms: Record<string, string> = {
    ai: "AI",
    id: "ID",
    llm: "LLM",
    nsfw: "NSFW",
    ppv: "PPV",
    url: "URL",
  };
  return name
    .replace(/^dashboard_/, "dashboard ")
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => initialisms[word.toLowerCase()] ?? word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

function snapshotValueLabel(name: string, values: string[] | undefined) {
  if (!values?.length) return "Not set";
  // Match the same shoulder-surfing boundary as the form itself: credentials,
  // voice identifiers and routing/model assignments never appear in review.
  if (/(?:token|password|secret|api[_-]?key|voice[_-]?id|(?:^|[_-])model(?:$|[_-]))/i.test(name)) {
    return "Protected value";
  }
  const displayValues = values.map((value) => {
    if (!value.startsWith("file:")) return value || "Not set";
    const fileParts = value.slice(5).split(":");
    return fileParts.slice(0, Math.max(1, fileParts.length - 2)).join(":") || "Selected file";
  });
  return displayValues.join(", ");
}

export default function CloneForm({
  clone,
  promptPreview,
  photos,
  videos,
  bundles,
  catalogueBundles,
  appearanceImageUrl,
  appearanceColor,
}: {
  clone: Clone;
  promptPreview: PromptPreview;
  photos: MediaProps["photos"];
  videos: MediaProps["videos"];
  bundles: MediaProps["bundles"];
  catalogueBundles: MediaProps["catalogueBundles"];
  appearanceImageUrl?: string;
  appearanceColor: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const {agencyName, readOnly, audience} = useDashboardAccess();
  const searchParams = useSearchParams();
  const formRef = useRef<HTMLFormElement>(null);
  const baselineRef = useRef<FormSnapshot>({});
  const dirtyFrameRef = useRef<number | null>(null);
  const tabParam = searchParams.get("tab");
  const subParam = searchParams.get("sub");
  const tab = resolveTab(tabParam, subParam);
  const briannaAdvanced = canShowIntelligence(audience, clone.id) && tab === "advanced";
  // The operational editor is shared by every creator and operator. Only
  // the extended, local demo controls keep the separate intelligence gate.
  const studioForms = isStudioTab(tab);
  const studioPanel = resolveStudioPanel(tab, searchParams.get("panel"));
  const changeStudioPanel = (panel: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    params.delete("sub");
    params.delete("section");
    if (panel === "overview") params.delete("panel"); else params.set("panel", panel);
    window.history.pushState(null, "", `${pathname}?${params.toString()}`);
  };
  const advancedView = resolveAdvancedView(searchParams.get("section"));
  const changeAdvancedSection = (section: AdvancedView) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "advanced");
    params.delete("sub");
    if (section === "overview") params.delete("section");
    else params.set("section", section);
    const href = `${pathname}?${params.toString()}`;
    if (href !== `${pathname}?${searchParams.toString()}`) window.history.pushState(null, "", href);
  };
  const changeTab = (nextTab: Tab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    params.delete("sub");
    if (nextTab !== tab) { params.delete("panel"); params.delete("section"); }
    const href = `${pathname}?${params.toString()}`;
    if (href === `${pathname}?${searchParams.toString()}`) return;
    // Next synchronizes native history with useSearchParams. Query-only
    // navigation preserves this mounted form and its unsaved fields.
    window.history.pushState(null, "", href);
  };
  const [models, setModels] = useState<OrModel[]>([]);
  const [step, setStep] = useState<Step>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [changedFields, setChangedFields] = useState<string[]>([]);
  const [reviewSnapshot, setReviewSnapshot] = useState<FormSnapshot>({});
  const [reviewOpen, setReviewOpen] = useState(false);

  const [cfg, set] = useCloneConfig(clone);

  useEffect(() => {
    if (isMoxy(agencyName)) return;
    fetch("/api/models").then((r) => r.json()).then((d) => Array.isArray(d) && setModels(d)).catch(() => {});
  }, [agencyName]);

  const refreshDirtyState = useCallback(() => {
    const current = snapshotForm(formRef.current);
    const changed = changedSnapshotKeys(baselineRef.current, current);
    setChangedFields(changed);
    if (changed.length > 0) setStep((currentStep) => currentStep === "done" ? "idle" : currentStep);
  }, []);

  const scheduleDirtyCheck = useCallback(() => {
    if (dirtyFrameRef.current != null) cancelAnimationFrame(dirtyFrameRef.current);
    dirtyFrameRef.current = requestAnimationFrame(() => {
      dirtyFrameRef.current = null;
      refreshDirtyState();
    });
  }, [refreshDirtyState]);

  const openReview = useCallback(() => {
    const current = snapshotForm(formRef.current);
    setChangedFields(changedSnapshotKeys(baselineRef.current, current));
    setReviewSnapshot(current);
    setReviewOpen(true);
  }, []);

  // All configuration domains intentionally stay mounted. Capture that full
  // submitted shape once, then compare the exact FormData payload after any
  // input or control interaction. This gives the review dock a real count
  // without migrating hundreds of existing uncontrolled fields.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      baselineRef.current = snapshotForm(formRef.current);
      setChangedFields([]);
    });
    return () => {
      cancelAnimationFrame(frame);
      if (dirtyFrameRef.current != null) cancelAnimationFrame(dirtyFrameRef.current);
    };
  }, [clone.id]);

  // Save as-is — does NOT recompile, so your prompt/caption edits survive.
  // goLive=true also flips status to active.
  async function save(goLive: boolean) {
    const fd = new FormData(formRef.current!);
    if (goLive) fd.set("status", "active");
    setStep("saving");
    setErrorMsg("");
    try {
      await updateClone(clone.id, fd);
      baselineRef.current = snapshotForm(formRef.current);
      setChangedFields([]);
      setReviewOpen(false);
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

  async function handleDelete() {
    if (!confirm("Delete this creator permanently? This cannot be undone.")) return;
    await deleteClone(clone.id);
    router.push("/clones");
  }

  const busy = step === "saving";
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
      text_model: clone.text_model,
      routing_model: clone.routing_model,
    }),
    [cfg, clone.text_model, clone.routing_model],
  );

  const editableTab = tab === "identity" || tab === "config" || tab === "money" || tab === "advanced";
  const formId = "creator-control-plane-form";

  return (
    <div data-creator-studio={tab} data-brianna-advanced={briannaAdvanced || undefined} data-brianna-studio={canShowIntelligence(audience, clone.id) && studioForms ? tab : undefined} className={`creator-control-plane grid min-w-0 gap-4 font-sans ${advancedStyles.page} ${studioStyles.page}`}>
      <header className={advancedStyles.pageHeader}><div><p><span className="creator-name">{clone.stage_name || clone.name}</span> / Creator configuration</p><h1>{isStudioTab(tab) ? STUDIO_PAGES[tab].title : tab === "ppvs" ? "PPV library" : tab === "view" ? "System view" : "Advanced"}</h1><small>{isStudioTab(tab) ? STUDIO_PAGES[tab].subtitle : tab === "ppvs" ? "Manage this creator’s photos, videos and bundles." : tab === "view" ? "Flow map and compiled prompts for this creator." : briannaAdvanced ? "56 extended controls · 7 sections" : "Runtime, delivery and advanced creator settings."}</small></div><BlurToggle /></header>
      <CreatorStudioStatus clone={clone} cfg={cfg} />

      <ControlPlaneNavigation tab={tab} onTabChange={changeTab} />

      <div className="min-w-0">
        <main className={briannaAdvanced ? advancedStyles.pageMain : "min-w-0"}>
          {isStudioTab(tab) && <StudioNavigation tab={tab} panel={studioPanel} onChange={changeStudioPanel} />}

          {/* Identity, Configuration, Monetization and Advanced remain one
              mounted form. Hiding a domain is CSS-only because updateClone
              expects the complete FormData shape on every save. */}
          <form
            id={formId}
            ref={formRef}
            hidden={briannaAdvanced && advancedView !== "live"}
            onSubmit={(event) => {
              event.preventDefault();
              save(false);
            }}
            onInputCapture={scheduleDirtyCheck}
            onChangeCapture={scheduleDirtyCheck}
            onClickCapture={scheduleDirtyCheck}
            className={`grid min-w-0 gap-4 [&_.clone-editor-tabs]:hidden ${briannaAdvanced ? advancedStyles.liveForm : ""}`}
          >
            <div className={tab === "ppvs" ? "hidden" : "grid min-w-0 gap-4"}>
              <ReadOnlyEditor>
                <ConfigSections
                  cfg={cfg}
                  set={set}
                  clone={clone}
                  models={models}
                  mode="edit"
                  studio
                  studioPanel={studioPanel}
                  onStudioPanelChange={changeStudioPanel}
                  tab={tab}
                  onTabChange={(nextTab) => changeTab(nextTab as Tab)}
                  extraTabs={EXTRA_TABS}
                  photos={photos}
                  videos={videos}
                  bundles={bundles}
                  identityWhoSlot={
                    <>
                      <CloneAppearanceEditor
                        studio
                        useStudioPortrait={canShowIntelligence(audience, clone.id)}
                        cloneName={clone.name}
                        initialColor={appearanceColor}
                        initialImagePath={clone.intake?.appearance?.profile_image_path ?? null}
                        initialImageUrl={appearanceImageUrl}
                      />
                      <PersonaFactsFields studio clone={clone} legacyFields={clone.intake?.fields} part="who" cfg={cfg} set={set} />
                    </>
                  }
                  identityCreatorSlot={<PersonaFactsFields studio clone={clone} legacyFields={clone.intake?.fields} part="creator" cfg={cfg} set={set} />}
                  identityPhysicalSlot={<PersonaFactsFields studio clone={clone} legacyFields={clone.intake?.fields} part="physical" cfg={cfg} set={set} />}
                  identitySocialsSlot={<PersonaFactsFields studio clone={clone} legacyFields={clone.intake?.fields} part="socials" cfg={cfg} set={set} />}
                  identityVibeSlot={<PersonaFactsFields studio clone={clone} legacyFields={clone.intake?.fields} part="vibe" cfg={cfg} set={set} />}
                  identityBehaviourSlot={<PersonaFactsFields studio clone={clone} legacyFields={clone.intake?.fields} part="behaviour" cfg={cfg} set={set} />}
                  identityRhythmSlot={<PersonaFactsFields studio clone={clone} legacyFields={clone.intake?.fields} part="rhythm" cfg={cfg} set={set} />}
                  identityLifeSlot={<PersonaFactsFields studio clone={clone} legacyFields={clone.intake?.fields} part="life" cfg={cfg} set={set} />}
                  identityContentSlot={<PersonaFactsFields studio clone={clone} legacyFields={clone.intake?.fields} part="content" cfg={cfg} set={set} />}
                  identityImperfectionSlot={<PersonaFactsFields studio clone={clone} legacyFields={clone.intake?.fields} part="imperfection" cfg={cfg} set={set} />}
                  identityLimitsSlot={<PersonaFactsFields studio clone={clone} legacyFields={clone.intake?.fields} part="limits" cfg={cfg} set={set} />}
                  identityQuestionnaireSlot={
                    <Section
                      title="Her own words"
                      hint="Goes into her prompt exactly as you type it. Nothing here is rewritten. One entry per row, use Add another for more."
                    >
                      <IntakeFields fields={clone.intake?.fields} legacyAnswers={clone.intake?.answers} />
                    </Section>
                  }
                />
              </ReadOnlyEditor>
            </div>

            <div className={tab === "view" ? "grid gap-4" : "hidden"}>
              <FlowGraph cfg={flowCfg} />
              <Section
                title={`Compiled prompt: ${promptPreview.mode === "smart" ? (promptPreview.smartSplit ? "Smart (writer + decider)" : "Smart (one model)") : "Classic"} flow`}
                hint="The prompt currently saved for this creator. The flow map responds to live toggles; save changes before using these prompt blocks for final verification."
              >
                {promptPreview.blocks.map((block) => (
                  <label key={block.key} className="block">
                    <FieldLabel label={<span className="font-medium">{block.label}</span>} hint={block.hint} />
                    <textarea
                      readOnly
                      rows={8}
                      value={block.content}
                      className="w-full cursor-default rounded-[3px] border border-ink/20 bg-panel px-3 py-2.5 font-mono text-xs leading-relaxed text-ink outline-none"
                    />
                  </label>
                ))}
              </Section>
            </div>
          </form>

          {/* Browser-local presentation policies are outside the operational
              form: they cannot enter FormData or update the live creator. */}
          <IntelligenceControls
            tab={tab}
            cloneId={clone.id}
            creatorName={clone.name}
            audience={audience}
            onTabChange={changeTab}
            section={advancedView}
            onSectionChange={changeAdvancedSection}
            readOnly={readOnly}
            liveActions={<ManagerOnly><div className={advancedStyles.liveActions}>
              <span role="status">{step === "saving" ? "Saving…" : step === "done" ? "Saved" : step === "save-error" ? errorMsg : changedFields.length ? `${changedFields.length} fields changed` : ""}</span>
              {changedFields.length > 0 && <Button type="button" variant="outline" onClick={openReview} disabled={busy}>Review</Button>}
              <Button type="button" variant="outline" onClick={() => save(false)} disabled={busy} className={advancedStyles.secondary}>{isPaused ? "Save paused" : "Save live settings"}</Button>
              {isPaused && advancedView === "live" && <Button type="button" onClick={() => save(true)} disabled={busy}>Finalise and go live</Button>}
            </div></ManagerOnly>}
          />


          <AdminOnly>
            <section className={tab === "advanced" && (!briannaAdvanced || advancedView === "live") ? `${advancedStyles.danger} mt-4 flex flex-col gap-4 rounded-[3px] border border-crit/30 bg-panel p-4 sm:flex-row sm:items-center sm:justify-between` : "hidden"}>
              <div>
                <p className="text-xs font-semibold text-ink">Danger zone</p>
                <p className="mt-1 text-[11px] leading-5 text-muted">Permanently removes this creator and leaves the normal configuration workflow.</p>
              </div>
              <Button type="button" variant="destructive" onClick={handleDelete} className="shrink-0">
                Delete creator
              </Button>
            </section>
          </AdminOnly>

          <div className={tab === "ppvs" ? "grid gap-4" : "hidden"}>
            <MediaManager
              cloneId={clone.id}
              photos={photos}
              videos={videos}
              bundles={bundles}
              catalogueBundles={catalogueBundles}
              categoryPricing={clone.category_pricing}
            />
          </div>
        </main>

      </div>

      <ManagerOnly>
        <div
          data-control-plane-save-bar
          className={editableTab && !briannaAdvanced ? `pointer-events-none mt-4 lg:sticky lg:bottom-4 lg:z-40 ${studioStyles.saveDock}` : "hidden"}
        >
          <div className="pointer-events-auto grid gap-2 rounded-[3px] border border-ink/25 bg-panel px-3 py-3 sm:px-4 lg:flex lg:items-center lg:justify-between lg:bg-panel/95 lg:py-2.5 lg:shadow-[0_8px_24px_rgb(21_32_51/0.1)] lg:backdrop-blur-xl">
            <div className="hidden min-w-0 items-center gap-3 lg:flex">
              <div className="min-w-0">
                <span className="text-xs font-semibold text-ink">
                  {changedFields.length
                    ? `${changedFields.length} field${changedFields.length === 1 ? "" : "s"} changed`
                    : "No changes"}
                </span>
                <p className="mt-0.5 hidden truncate text-[10px] text-muted sm:block">
                  {isPaused ? "Saving keeps this creator paused unless you choose go live." : "Saving updates the active creator configuration."}
                </p>
              </div>
            </div>

            <div className="grid w-full grid-cols-2 items-center gap-2 lg:flex lg:w-auto lg:shrink-0 lg:flex-wrap lg:justify-end lg:gap-1.5">
              {step === "saving" && <span className="col-span-2 inline-flex items-center gap-1.5 text-xs text-muted lg:col-auto"><LoaderCircle className="size-3.5 animate-spin" /> Saving</span>}
              {step === "done" && <span className="col-span-2 text-xs font-medium text-good lg:col-auto">Saved</span>}
              {step === "save-error" && <span className="col-span-2 truncate text-xs text-crit lg:col-auto lg:max-w-64">{errorMsg}</span>}
              <Button type="button" variant="outline" onClick={openReview} disabled={!changedFields.length || busy} className="w-full lg:w-auto">
                Review changes
              </Button>
              <Button type="submit" form={formId} disabled={busy} className="w-full lg:w-auto">
                {isPaused ? "Save paused" : "Save changes"}
              </Button>
              {isPaused && (
                <Button type="button" onClick={() => save(true)} disabled={busy} className="col-span-2 w-full lg:col-auto lg:w-auto">
                  Finalise and go live
                </Button>
              )}
            </div>
          </div>
        </div>
      </ManagerOnly>

      {readOnly ? <ReadOnlyControlPlaneNotice /> : null}

      <Modal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title={`Review ${changedFields.length} changed field${changedFields.length === 1 ? "" : "s"}`}
        hint="This is a comparison against the form payload loaded for this creator. Nothing is applied until you save."
      >
        <div className="rounded-[3px] border border-ink/20 bg-panel">
          {changedFields.length ? (
            <ul className="divide-y divide-line">
              {changedFields.map((field) => {
                const previousValue = snapshotValueLabel(field, baselineRef.current[field]);
                const proposedValue = snapshotValueLabel(field, reviewSnapshot[field]);
                return (
                  <li key={field} className="px-4 py-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium text-ink">{humanFieldName(field)}</span>
                      <code className="rounded-[2px] border border-ink/10 bg-elev/45 px-2 py-1 text-[10px] text-muted" title={field}>{field}</code>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                      <div className="min-w-0 rounded-[2px] border border-ink/15 bg-panel px-3 py-2">
                        <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-muted">Previous</span>
                        <span className="mt-1 block truncate text-xs text-ink" title={previousValue}>{previousValue}</span>
                      </div>
                      <span className="hidden text-muted sm:block" aria-hidden="true">→</span>
                      <div className="min-w-0 rounded-[2px] border border-ink/25 bg-elev/30 px-3 py-2">
                        <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-ink">Proposed</span>
                        <span className="mt-1 block truncate text-xs font-medium text-ink" title={proposedValue}>{proposedValue}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-muted">No fields differ from the loaded configuration.</p>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setReviewOpen(false)}>Continue editing</Button>
          <Button type="submit" form={formId} disabled={busy}>
            {isPaused ? "Save paused" : "Apply changes"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}



