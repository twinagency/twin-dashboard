"use client";

import type { LucideIcon } from "lucide-react";
import {
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Eye,
  FileText,
  GitBranch,
  IdCard,
  ImageIcon,
  Library,
  PauseCircle,
  RadioTower,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";

import type { Clone } from "@/lib/types";
import type { CloneConfigState } from "./useCloneConfig";

export type ControlPlaneTab = "ppvs" | "identity" | "config" | "money" | "view" | "advanced";

type DomainDefinition = {
  key: ControlPlaneTab;
  title: string;
  eyebrow: string;
  description: string;
  icon: LucideIcon;
};

const DOMAINS: DomainDefinition[] = [
  {
    key: "identity",
    title: "Identity",
    eyebrow: "Domain 01",
    description: "Canon, voice, relationships and boundaries",
    icon: IdCard,
  },
  {
    key: "config",
    title: "Configuration",
    eyebrow: "Domain 02",
    description: "Runtime, capabilities and behaviour",
    icon: SlidersHorizontal,
  },
  {
    key: "money",
    title: "Monetization",
    eyebrow: "Domain 03",
    description: "Credits, paywalls and commercial rules",
    icon: CircleDollarSign,
  },
  {
    key: "advanced",
    title: "Advanced",
    eyebrow: "Domain 04",
    description: "Routing, recovery, memory and safeguards",
    icon: Settings2,
  },
  {
    key: "view",
    title: "System view",
    eyebrow: "Verification",
    description: "Execution map and compiled prompts",
    icon: Eye,
  },
  {
    key: "ppvs",
    title: "PPV library",
    eyebrow: "Content",
    description: "Paid media and bundle inventory",
    icon: Library,
  },
];

const isPresent = (value: unknown) => {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
};

function identityFactCount(clone: Clone) {
  return [
    clone.stage_name,
    clone.real_name,
    clone.date_of_birth,
    clone.gender,
    clone.height,
    clone.ethnicity_tags,
    clone.ethnicity_other,
    clone.sexuality,
    clone.hometown,
    clone.current_city,
    clone.creator_type,
    clone.known_for,
    clone.career_start_year,
    clone.career_history,
    clone.cover_story,
    clone.platforms,
    clone.hair_color,
    clone.hair_length,
    clone.eye_color,
    clone.body_type,
    clone.cup_size,
    clone.measurements,
    clone.voice_accent,
    clone.voice_pace,
    clone.voice_texture,
    clone.relationship_canon,
    clone.wake_time,
    clone.sleep_time,
    clone.daily_blocks,
    clone.hobbies,
    clone.pet_details,
    clone.catchphrases,
    clone.favorite_things,
    clone.dislikes,
    clone.saving_goal,
    clone.content_hard_nos,
    clone.content_done,
    clone.hard_limits,
    clone.hard_limits_extra,
  ].filter(isPresent).length;
}

function enabledDeliveryCount(cfg: CloneConfigState) {
  return [cfg.photosEnabled, cfg.videosEnabled, cfg.bundlesEnabled, cfg.voice].filter(Boolean).length;
}

function savedAtLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved state";
  const iso = date.toISOString();
  return `Saved ${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "CP";
}

function modeLabel(cfg: CloneConfigState) {
  if (cfg.aiMode === "classic") return "Classic";
  return cfg.smartSplit ? "Smart split" : "Smart single-model";
}

function domainSummary(
  key: ControlPlaneTab,
  clone: Clone,
  cfg: CloneConfigState,
  promptBlockCount: number,
  mediaCounts: { photos: number; videos: number; bundles: number },
) {
  switch (key) {
    case "identity": {
      const count = identityFactCount(clone);
      return count ? `${count} saved canon fields` : "No saved canon fields";
    }
    case "config":
      return `${enabledDeliveryCount(cfg)} of 4 delivery types enabled`;
    case "money":
      return cfg.charge
        ? `${clone.credit_pack_price_stars} Stars / ${clone.credit_pack_size} messages`
        : "Message charging disabled";
    case "advanced":
      return modeLabel(cfg);
    case "view":
      return `${promptBlockCount} compiled prompt block${promptBlockCount === 1 ? "" : "s"}`;
    case "ppvs": {
      const total = mediaCounts.photos + mediaCounts.videos + mediaCounts.bundles;
      return `${total} library entr${total === 1 ? "y" : "ies"}`;
    }
  }
}

export function CreatorControlPlaneHeader({
  clone,
  cfg,
  imageUrl,
  appearanceColor,
  onOpenSystemView,
}: {
  clone: Clone;
  cfg: CloneConfigState;
  imageUrl?: string;
  appearanceColor: string;
  onOpenSystemView: () => void;
}) {
  const active = clone.status === "active";
  const connected = Boolean(clone.business_username);
  const followsFleet = clone.uses_default_config ?? true;

  return (
    <header className="overflow-hidden rounded-xl border border-accent-deep/20 bg-accent-deep text-white shadow-[0_18px_50px_rgb(7_26_47/0.16)]">
      <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <span
            className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/20 text-sm font-semibold text-white shadow-[0_8px_24px_rgb(0_0_0/0.24)]"
            style={{ backgroundColor: appearanceColor }}
          >
            {imageUrl ? <img src={imageUrl} alt="" className="size-full object-cover" /> : initials(clone.name)}
            <span
              className={`absolute bottom-1 right-1 size-2.5 rounded-full border-2 border-accent-deep ${active ? "bg-good" : "bg-warn"}`}
              aria-hidden="true"
            />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55">
              <Bot className="size-3.5" />
              Creator control plane
            </div>
            <h1 className="creator-name mt-1 truncate text-2xl font-semibold tracking-[-0.025em] text-white">{clone.name}</h1>
            <div className="mt-1 flex min-w-0 items-center gap-2 text-[11px] text-white/50">
              <span className="truncate font-mono">/{clone.slug}</span>
              <span aria-hidden="true">·</span>
              <span className="truncate font-mono">{clone.id}</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenSystemView}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-white/16 bg-white/8 px-3 text-xs font-semibold text-white transition hover:border-white/28 hover:bg-white/12"
        >
          <Eye className="size-3.5" />
          Inspect system
        </button>
      </div>

      <div className="grid border-t border-white/10 sm:grid-cols-2 xl:grid-cols-5">
        <HeaderDatum
          icon={active ? CheckCircle2 : PauseCircle}
          label="Operating state"
          value={active ? "Live" : "Paused"}
          state={active ? "good" : "warn"}
        />
        <HeaderDatum
          icon={RadioTower}
          label="Telegram business"
          value={connected ? `@${clone.business_username}` : "Not observed"}
          state={connected ? "good" : "neutral"}
        />
        <HeaderDatum icon={GitBranch} label="Runtime mode" value={modeLabel(cfg)} />
        <HeaderDatum
          icon={followsFleet ? ShieldCheck : Settings2}
          label="Configuration source"
          value={followsFleet ? "Fleet default" : "Custom configuration"}
        />
        <HeaderDatum icon={FileText} label="Persistence" value={savedAtLabel(clone.updated_at)} />
      </div>
    </header>
  );
}

function HeaderDatum({
  icon: Icon,
  label,
  value,
  state = "neutral",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  state?: "good" | "warn" | "neutral";
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 border-b border-white/10 px-4 py-3 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 xl:border-b-0 xl:border-r xl:border-white/10 xl:last:border-r-0">
      <span
        className={`grid size-8 shrink-0 place-items-center rounded-lg border ${
          state === "good"
            ? "border-good/30 bg-good/15 text-[#5ee0af]"
            : state === "warn"
              ? "border-warn/35 bg-warn/15 text-[#f2bd66]"
              : "border-white/10 bg-white/5 text-white/58"
        }`}
      >
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block text-[9px] font-semibold uppercase tracking-[0.15em] text-white/40">{label}</span>
        <span className="mt-0.5 block truncate text-xs font-medium text-white/85" title={value}>{value}</span>
      </span>
    </div>
  );
}

export function ControlPlaneNavigation({
  tab,
  clone,
  cfg,
  promptBlockCount,
  mediaCounts,
  onTabChange,
}: {
  tab: ControlPlaneTab;
  clone: Clone;
  cfg: CloneConfigState;
  promptBlockCount: number;
  mediaCounts: { photos: number; videos: number; bundles: number };
  onTabChange: (tab: ControlPlaneTab) => void;
}) {
  return (
    <nav aria-label="Control plane domains" className="min-w-0 lg:sticky lg:top-4 lg:self-start">
      <div className="overflow-hidden rounded-xl border border-line bg-panel shadow-[0_8px_30px_rgb(21_32_51/0.055)]">
        <div className="border-b border-line px-4 py-3">
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">Control domains</p>
          <p className="mt-1 text-xs leading-5 text-ink">One creator, one effective configuration.</p>
        </div>
        <div className="flex gap-1 overflow-x-auto p-2 [scrollbar-width:none] lg:block lg:space-y-1 lg:overflow-visible">
          {DOMAINS.map((domain) => {
            const Icon = domain.icon;
            const active = tab === domain.key;
            const summary = domainSummary(domain.key, clone, cfg, promptBlockCount, mediaCounts);
            return (
              <button
                key={domain.key}
                type="button"
                onClick={() => onTabChange(domain.key)}
                aria-current={active ? "page" : undefined}
                className={`group flex min-w-[13rem] items-center gap-3 rounded-lg border px-3 py-3 text-left transition lg:w-full lg:min-w-0 ${
                  active
                    ? "border-accent-2/25 bg-accent-tint/45 text-accent"
                    : "border-transparent text-muted hover:border-line hover:bg-bg hover:text-ink"
                }`}
              >
                <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${active ? "bg-accent text-white" : "bg-elev text-muted group-hover:text-ink"}`}>
                  <Icon className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] opacity-65">{domain.eyebrow}</span>
                  <span className="mt-0.5 block text-xs font-semibold">{domain.title}</span>
                  <span className="mt-0.5 block truncate text-[10px] font-medium opacity-65" title={summary}>{summary}</span>
                </span>
                <ChevronRight className={`size-3.5 shrink-0 transition ${active ? "translate-x-0 text-accent" : "-translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-60"}`} />
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

export function ControlPlaneWorkspaceHeader({ tab }: { tab: ControlPlaneTab }) {
  const domain = DOMAINS.find((item) => item.key === tab) ?? DOMAINS[0];
  const Icon = domain.icon;
  return (
    <div className="mb-4 flex items-start gap-3 border-b border-line pb-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-panel text-accent shadow-sm">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-accent-2">{domain.eyebrow}</p>
        <h2 className="mt-0.5 text-lg font-semibold tracking-[-0.015em] text-ink">{domain.title}</h2>
        <p className="mt-1 text-xs leading-5 text-muted">{domain.description}</p>
      </div>
    </div>
  );
}

type InspectorRow = {
  label: string;
  value: string;
  tone?: "good" | "warn" | "neutral";
  mono?: boolean;
};

export function ControlPlaneInspector({
  tab,
  clone,
  cfg,
  promptBlocks,
  mediaCounts,
  showModelDetails,
}: {
  tab: ControlPlaneTab;
  clone: Clone;
  cfg: CloneConfigState;
  promptBlocks: { key: string; label: string }[];
  mediaCounts: { photos: number; videos: number; bundles: number };
  showModelDetails: boolean;
}) {
  const factCount = identityFactCount(clone);
  const enabledDelivery = [
    cfg.photosEnabled && "Photos",
    cfg.videosEnabled && "Videos",
    cfg.bundlesEnabled && "Bundles",
    cfg.voice && "Voice",
  ].filter(Boolean) as string[];

  let title = "Effective state";
  let detail = "Current values used by this creator.";
  let rows: InspectorRow[] = [];
  let path: string[] | null = null;

  if (tab === "identity") {
    title = "Identity surface";
    detail = "Saved canon that can shape fan-facing responses.";
    rows = [
      { label: "Public name", value: clone.stage_name?.trim() || clone.name },
      { label: "Saved canon", value: `${factCount} populated fields` },
      { label: "Current city", value: clone.current_city?.trim() || "Not set", tone: clone.current_city ? "neutral" : "warn" },
      { label: "Hard limits", value: `${(clone.hard_limits?.length ?? 0) + (clone.content_hard_nos?.length ?? 0)} recorded` },
    ];
  } else if (tab === "config") {
    title = "Execution context";
    detail = "Live selections from the currently mounted form.";
    rows = [
      { label: "Runtime", value: modeLabel(cfg) },
      { label: "Business account", value: clone.business_username ? `@${clone.business_username}` : "Not observed", tone: clone.business_username ? "good" : "warn", mono: Boolean(clone.business_username) },
      { label: "Delivery", value: enabledDelivery.length ? enabledDelivery.join(", ") : "All delivery types disabled", tone: enabledDelivery.length ? "neutral" : "warn" },
      { label: "Configuration", value: (clone.uses_default_config ?? true) ? "Fleet default" : "Custom configuration" },
    ];
    path = ["Telegram", cfg.aiMode === "smart" ? "Smart router" : "Classic handler", cfg.smartSplit && cfg.aiMode === "smart" ? "Writer model" : "Response model", "Delivery"];
  } else if (tab === "money") {
    title = "Revenue path";
    detail = "Saved pack economics with live feature switches.";
    rows = [
      { label: "Message charging", value: cfg.charge ? "Enabled" : "Disabled", tone: cfg.charge ? "good" : "neutral" },
      { label: "Starting allowance", value: `${clone.starting_credits} messages` },
      { label: "Credit pack", value: `${clone.credit_pack_size} messages · ${clone.credit_pack_price_stars} Stars` },
      { label: "Tips", value: cfg.tips ? "Enabled" : "Disabled", tone: cfg.tips ? "good" : "neutral" },
      { label: "Discount engine", value: cfg.discountsEnabled ? "Enabled" : "Disabled", tone: cfg.discountsEnabled ? "warn" : "neutral" },
    ];
    path = cfg.charge ? ["Free allowance", "Credit gate", "Purchase", cfg.paywallResumeEnabled ? "Configured resume" : "Conversation resumes"] : ["Conversation", "No message gate"];
  } else if (tab === "advanced") {
    title = "Runtime safeguards";
    detail = "Effective routing and recovery controls.";
    rows = [
      { label: "Model topology", value: modeLabel(cfg) },
      { label: "Writer model", value: showModelDetails ? clone.text_model : "Restricted", mono: showModelDetails },
      { label: "Routing model", value: showModelDetails ? clone.routing_model : "Restricted", mono: showModelDetails },
      { label: "Memory window", value: `${cfg.memoryWindow} messages` },
      { label: "Price guard", value: cfg.priceGuardMode === "block" ? "Blocking invalid prices" : cfg.priceGuardMode === "log" ? "Log only" : "Disabled", tone: cfg.priceGuardMode === "off" ? "warn" : "good" },
      { label: "Minor gate", value: cfg.strictMinorGate ? "Armed" : "Disabled", tone: cfg.strictMinorGate ? "good" : "warn" },
    ];
  } else if (tab === "view") {
    title = "Verification view";
    detail = "Flow state is live; compiled prompts reflect the saved creator.";
    rows = [
      { label: "Runtime", value: modeLabel(cfg) },
      { label: "Compiled blocks", value: String(promptBlocks.length) },
      ...promptBlocks.slice(0, 4).map((block) => ({ label: "Prompt block", value: block.label })),
    ];
  } else {
    title = "Content inventory";
    detail = "Current saved entries available to paid media flows.";
    rows = [
      { label: "Photos", value: String(mediaCounts.photos) },
      { label: "Videos", value: String(mediaCounts.videos) },
      { label: "Bundles", value: String(mediaCounts.bundles) },
      { label: "Media delivery", value: [cfg.photosEnabled && "Photos", cfg.videosEnabled && "Videos", cfg.bundlesEnabled && "Bundles"].filter(Boolean).join(", ") || "Disabled", tone: enabledDelivery.length ? "neutral" : "warn" },
    ];
  }

  return (
    <aside className="hidden min-w-0 2xl:sticky 2xl:top-4 2xl:block 2xl:self-start">
      <div className="overflow-hidden rounded-xl border border-line bg-panel shadow-[0_8px_30px_rgb(21_32_51/0.055)]">
        <div className="border-b border-line bg-accent-deep px-4 py-4 text-white">
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.17em] text-white/50">
            <ShieldCheck className="size-3.5" />
            Context inspector
          </div>
          <h3 className="mt-2 text-sm font-semibold text-white">{title}</h3>
          <p className="mt-1 text-[11px] leading-5 text-white/55">{detail}</p>
        </div>

        {path ? (
          <div className="border-b border-line px-4 py-4">
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted">Active path</p>
            <div className="mt-3 space-y-0">
              {path.map((step, index) => (
                <div key={`${step}-${index}`} className="flex gap-3">
                  <div className="flex w-4 flex-col items-center">
                    <span className={`mt-0.5 size-2 rounded-full border ${index === 0 ? "border-accent-2 bg-accent-2" : "border-accent/25 bg-panel"}`} />
                    {index < path!.length - 1 ? <span className="min-h-5 w-px flex-1 bg-line" /> : null}
                  </div>
                  <span className="pb-3 text-[11px] font-medium text-ink">{step}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <dl className="divide-y divide-line">
          {rows.map((row, index) => (
            <div key={`${row.label}-${index}`} className="px-4 py-3">
              <dt className="text-[9px] font-semibold uppercase tracking-[0.13em] text-muted">{row.label}</dt>
              <dd
                className={`mt-1 break-words text-xs font-medium ${row.mono ? "font-mono" : ""} ${
                  row.tone === "good" ? "text-good" : row.tone === "warn" ? "text-warn" : "text-ink"
                }`}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </aside>
  );
}

export function ReadOnlyControlPlaneNotice() {
  return (
    <div className="sticky bottom-4 z-40 mt-4 flex items-center gap-3 rounded-xl border border-line bg-panel/95 px-4 py-3 shadow-[0_16px_44px_rgb(21_32_51/0.13)] backdrop-blur-xl">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-elev text-muted">
        <Eye className="size-4" />
      </span>
      <div>
        <p className="text-xs font-semibold text-ink">Read-only control plane</p>
        <p className="mt-0.5 text-[11px] text-muted">You can inspect every domain, but configuration changes require manager access.</p>
      </div>
    </div>
  );
}

export function ControlPlaneLegend() {
  return (
    <div className="hidden items-center gap-3 text-[10px] text-muted xl:flex">
      <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-good" /> Effective</span>
      <span className="inline-flex items-center gap-1.5"><ImageIcon className="size-3" /> Saved assets</span>
    </div>
  );
}
