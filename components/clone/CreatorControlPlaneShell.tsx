"use client";

import type { Clone } from "@/lib/types";
import type { CloneConfigState } from "./useCloneConfig";

export type ControlPlaneTab = "ppvs" | "identity" | "config" | "money" | "view" | "advanced";

type DomainDefinition = {
  key: ControlPlaneTab;
  title: string;
};

const DOMAINS: DomainDefinition[] = [
  {
    key: "identity",
    title: "Identity",
  },
  {
    key: "config",
    title: "Configuration",
  },
  {
    key: "money",
    title: "Monetization",
  },
  {
    key: "advanced",
    title: "Advanced",
  },
  {
    key: "view",
    title: "System view",
  },
  {
    key: "ppvs",
    title: "PPV library",
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

function savedAtLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
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

export function CreatorControlPlaneHeader({
  clone,
  cfg,
  imageUrl,
}: {
  clone: Clone;
  cfg: CloneConfigState;
  imageUrl?: string;
}) {
  const active = clone.status === "active";
  const connected = Boolean(clone.business_username);
  const followsFleet = clone.uses_default_config ?? true;

  return (
    <header className="overflow-hidden rounded-[3px] border border-ink/20 bg-panel shadow-[0_1px_2px_rgb(21_32_51/0.04)]">
      <div className="px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-[2px] border border-ink/15 bg-elev text-xs font-semibold text-ink"
          >
            {imageUrl ? <img src={imageUrl} alt="" className="size-full object-cover" /> : initials(clone.name)}
            <span
              className={`absolute bottom-1 right-1 size-2 rounded-full ring-2 ring-panel ${active ? "bg-good" : "bg-warn"}`}
              aria-hidden="true"
            />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-[-0.025em] text-ink">Control Panel</h1>
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
              <span className="creator-name truncate font-medium text-ink">{clone.name}</span>
              <span aria-hidden="true">·</span>
              <span className="truncate font-mono">/{clone.slug}</span>
              <span aria-hidden="true" className="hidden sm:inline">·</span>
              <span className="hidden truncate font-mono sm:inline">{clone.id}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px border-t border-ink/15 bg-ink/10 [&>*:last-child]:col-span-2 xl:grid-cols-5 xl:[&>*:last-child]:col-span-1">
        <HeaderDatum
          label="Operating state"
          value={active ? "Live" : "Paused"}
          state={active ? "good" : "warn"}
        />
        <HeaderDatum
          label="Telegram business"
          value={connected ? `@${clone.business_username}` : "Not observed"}
          state={connected ? "good" : "neutral"}
        />
        <HeaderDatum label="Runtime mode" value={modeLabel(cfg)} />
        <HeaderDatum
          label="Configuration source"
          value={followsFleet ? "Fleet default" : "Custom configuration"}
        />
        <HeaderDatum label="Last saved" value={savedAtLabel(clone.updated_at)} />
      </div>
    </header>
  );
}

function HeaderDatum({
  label,
  value,
  state = "neutral",
}: {
  label: string;
  value: string;
  state?: "good" | "warn" | "neutral";
}) {
  return (
    <div className="min-w-0 bg-panel px-4 py-2.5">
      <span className="block text-[9px] font-semibold uppercase tracking-[0.11em] text-muted">{label}</span>
      <span
        className={`mt-1 block truncate text-xs font-medium ${
          state === "good" ? "text-good" : state === "warn" ? "text-warn" : "text-ink"
        }`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

export function ControlPlaneNavigation({
  tab,
  onTabChange,
}: {
  tab: ControlPlaneTab;
  onTabChange: (tab: ControlPlaneTab) => void;
}) {
  return (
    <nav aria-label="Control Panel sections" className="min-w-0">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[3px] border border-ink/20 bg-ink/15 sm:grid-cols-3 xl:grid-cols-6">
        {DOMAINS.map((domain) => {
          const active = tab === domain.key;
          return (
            <button
              key={domain.key}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => onTabChange(domain.key)}
              className={`min-h-11 min-w-0 border-b-2 bg-panel px-3 py-2.5 text-left text-xs font-semibold transition focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
                active
                  ? "border-accent text-ink"
                  : "border-transparent text-muted hover:bg-elev/55 hover:text-ink"
              }`}
            >
              {domain.title}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function ControlPlaneWorkspaceHeader({ tab }: { tab: ControlPlaneTab }) {
  const domain = DOMAINS.find((item) => item.key === tab) ?? DOMAINS[0];
  return (
    <div className="mb-3 border-b border-ink/15 pb-2.5">
      <h2 className="text-base font-semibold tracking-[-0.01em] text-ink">{domain.title}</h2>
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
  let rows: InspectorRow[] = [];
  let path: string[] | null = null;

  if (tab === "identity") {
    title = "Identity surface";
    rows = [
      { label: "Public name", value: clone.stage_name?.trim() || clone.name },
      { label: "Saved canon", value: `${factCount} populated fields` },
      { label: "Current city", value: clone.current_city?.trim() || "Not set", tone: clone.current_city ? "neutral" : "warn" },
      { label: "Hard limits", value: `${(clone.hard_limits?.length ?? 0) + (clone.content_hard_nos?.length ?? 0)} recorded` },
    ];
  } else if (tab === "config") {
    title = "Execution context";
    rows = [
      { label: "Runtime", value: modeLabel(cfg) },
      { label: "Business account", value: clone.business_username ? `@${clone.business_username}` : "Not observed", tone: clone.business_username ? "good" : "warn", mono: Boolean(clone.business_username) },
      { label: "Delivery", value: enabledDelivery.length ? enabledDelivery.join(", ") : "All delivery types disabled", tone: enabledDelivery.length ? "neutral" : "warn" },
      { label: "Configuration", value: (clone.uses_default_config ?? true) ? "Fleet default" : "Custom configuration" },
    ];
    path = ["Telegram", cfg.aiMode === "smart" ? "Smart router" : "Classic handler", cfg.smartSplit && cfg.aiMode === "smart" ? "Writer model" : "Response model", "Delivery"];
  } else if (tab === "money") {
    title = "Revenue path";
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
    rows = [
      { label: "Runtime", value: modeLabel(cfg) },
      { label: "Compiled blocks", value: String(promptBlocks.length) },
      ...promptBlocks.slice(0, 4).map((block) => ({ label: "Prompt block", value: block.label })),
    ];
  } else {
    title = "Content inventory";
    rows = [
      { label: "Photos", value: String(mediaCounts.photos) },
      { label: "Videos", value: String(mediaCounts.videos) },
      { label: "Bundles", value: String(mediaCounts.bundles) },
      { label: "Media delivery", value: [cfg.photosEnabled && "Photos", cfg.videosEnabled && "Videos", cfg.bundlesEnabled && "Bundles"].filter(Boolean).join(", ") || "Disabled", tone: enabledDelivery.length ? "neutral" : "warn" },
    ];
  }

  return (
    <aside className="hidden min-w-0 2xl:sticky 2xl:top-4 2xl:block 2xl:self-start">
      <div className="overflow-hidden rounded-[3px] border border-ink/20 bg-panel shadow-[0_1px_2px_rgb(21_32_51/0.04)]">
        <div className="border-b border-ink/15 px-4 py-3">
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted">Current state</p>
          <h3 className="mt-1 text-sm font-semibold text-ink">{title}</h3>
        </div>

        {path ? (
          <div className="border-b border-ink/15 px-4 py-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted">Active path</p>
            <div className="mt-3 space-y-0">
              {path.map((step, index) => (
                <div key={`${step}-${index}`} className="flex gap-3">
                  <div className="flex w-4 flex-col items-center">
                    <span className={`mt-0.5 size-1.5 rounded-[1px] ${index === 0 ? "bg-accent" : "bg-ink/30"}`} />
                    {index < path!.length - 1 ? <span className="min-h-5 w-px flex-1 bg-ink/15" /> : null}
                  </div>
                  <span className="pb-3 text-[11px] font-medium text-ink">{step}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <dl className="divide-y divide-ink/10">
          {rows.map((row, index) => (
            <div key={`${row.label}-${index}`} className="px-4 py-3">
              <dt className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted">{row.label}</dt>
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
    <div className="sticky bottom-4 z-40 mt-4 rounded-[3px] border border-ink/25 bg-panel/95 px-4 py-3 shadow-[0_8px_24px_rgb(21_32_51/0.1)] backdrop-blur-xl">
      <p className="text-xs font-semibold text-ink">Read-only access</p>
      <p className="mt-0.5 text-[11px] text-muted">Configuration changes require manager access.</p>
    </div>
  );
}
