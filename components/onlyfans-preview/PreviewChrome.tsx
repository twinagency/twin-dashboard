// The preview shell: Twin branding, the OnlyFans surface name, and the sample
// data indicator.
//
// The indicator is not decoration. Every number, name and message on this
// screen is synthetic, and a preview that looks like production is how a
// fixture ends up quoted as a real balance.

import TwinWordmark from "@/components/TwinWordmark";
import { QuietLabel } from "@/components/crm/CrmPreview";
import type { Freshness, PreviewViewer } from "@/lib/onlyfans-preview/types";
import { PREVIEW_NOW, formatAge, formatPreviewTime } from "@/lib/onlyfans-preview/fixtures";
import { HealthPill } from "./labels";
import type { ConnectionHealth } from "@/lib/onlyfans-preview/types";

export function PreviewBadge({ sourceLabel }: { sourceLabel: string }) {
  return (
    <span
      data-of-preview-badge
      className="inline-flex h-7 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-[#f0d9a8] bg-[#fff8e8] px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#8a5f06]"
    >
      <span aria-hidden className="inline-block size-2 rounded-full bg-[#d69a08]" />
      Preview
      <span className="whitespace-nowrap font-semibold normal-case tracking-normal text-[#a8791b]">
        {sourceLabel}
      </span>
    </span>
  );
}

export function PreviewHeader({
  sourceLabel,
  viewer,
}: {
  sourceLabel: string;
  viewer: PreviewViewer;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <TwinWordmark />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <h1 className="font-heading text-2xl font-semibold tracking-[-0.035em] text-ink sm:text-3xl">
            OnlyFans
          </h1>
          <PreviewBadge sourceLabel={sourceLabel} />
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          One place per creator account: connection health, conversations, who owns replies, and
          what actually left the building.
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
        <QuietLabel tone={viewer.kind === "view_as" ? "gold" : "navy"}>{viewer.label}</QuietLabel>
        <span className="text-[11px] text-muted">
          Fixture snapshot {formatPreviewTime(PREVIEW_NOW)}
        </span>
      </div>
    </header>
  );
}

export function FreshnessLine({ freshness }: { freshness: Freshness }) {
  return (
    <span
      data-of-freshness={freshness.stale ? "stale" : "fresh"}
      className={`text-[11px] ${freshness.stale ? "font-semibold text-[#8a5f06]" : "text-muted"}`}
    >
      {freshness.stale ? "Last known " : "Updated "}
      {formatAge(freshness.asOf)}
      {freshness.stale ? " (this view may be out of date)" : ""}
    </span>
  );
}

export function ConnectionSummary({
  health,
  healthReason,
  freshness,
}: {
  health: ConnectionHealth;
  healthReason: string | null;
  freshness: Freshness;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <HealthPill health={health} />
        <FreshnessLine freshness={freshness} />
      </div>
      {healthReason ? (
        <p
          data-of-health-reason
          className="max-w-2xl text-xs leading-5 text-[#8a5f06]"
        >
          {healthReason}
        </p>
      ) : null}
    </div>
  );
}
