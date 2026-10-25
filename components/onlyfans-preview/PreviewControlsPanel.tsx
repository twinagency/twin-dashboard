"use client";

// The reviewer's control panel.
//
// OF-D0 exists to prove that five dimensions stay independent, and a static
// screenshot cannot show that. This panel sets each one on its own so any
// combination can be inspected without a backend:
//
//   permission | connection health | automation mode | takeover | delivery
//   plus, separately, what each read did: loading, empty, error or stale.

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PreviewControls, ReadScenario } from "@/lib/onlyfans-preview/scenarios";
import { READ_SCENARIOS } from "@/lib/onlyfans-preview/scenarios";
import type {
  AutomationMode,
  ConnectionHealth,
  DeliveryOutcome,
  TakeoverState,
} from "@/lib/onlyfans-preview/types";
import { SimulatedTag } from "./labels";

const HEALTHS: ConnectionHealth[] = [
  "connected",
  "reconnecting",
  "disconnected",
  "expired_session",
  "revoked",
];
const AUTOMATIONS: AutomationMode[] = ["automated", "human_controlled", "paused", "no_contact"];
const TAKEOVERS: TakeoverState[] = ["none", "requested", "effective"];
const DELIVERIES: DeliveryOutcome[] = [
  "none",
  "generating",
  "queued",
  "dispatching",
  "sent",
  "partial",
  "unknown",
  "refused",
  "failed",
];

export type PreviewPreset = { key: string; label: string; controls: PreviewControls };

const selCls =
  "h-9 w-full rounded-lg border border-line bg-white px-2 text-xs font-semibold text-ink";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

export default function PreviewControlsPanel({
  controls,
  presets,
  onChange,
  onApplyPreset,
  onReset,
}: {
  controls: PreviewControls;
  presets: PreviewPreset[];
  onChange: (patch: Partial<PreviewControls>) => void;
  onApplyPreset: (preset: PreviewPreset) => void;
  onReset: () => void;
}) {
  // Collapsed by default: this is a developer panel, not part of the product,
  // and it should not be the first thing on the screen when the surface is
  // being reviewed for its look.
  const [open, setOpen] = useState(false);

  // Collapsed, it is a single right-aligned affordance rather than a band above
  // the page title: the product surface is what a reviewer should meet first.
  if (!open) {
    return (
      <div data-of-preview-controls className="flex items-center justify-end gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
          Developer preview
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 text-xs font-semibold text-ink transition hover:bg-elev/70"
        >
          <SlidersHorizontal className="size-3.5" />
          Show controls
          <ChevronDown className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <Card data-of-preview-controls className="rounded-2xl border border-[#e3c98b] bg-[#fffdf7]">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#fff3d6] text-[#8a5f06]">
              <SlidersHorizontal className="size-4" />
            </span>
            <div className="min-w-0">
              <CardTitle className="flex flex-wrap items-center gap-2">
                Preview controls
                <SimulatedTag />
              </CardTitle>
              <div className="text-xs text-muted">
                Every dimension below is independent. Nothing here reaches a provider or stored state.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onReset}
              className="h-8 rounded-lg border border-line bg-white px-2.5 text-xs font-semibold text-ink transition hover:bg-elev/70"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-expanded={open}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 text-xs font-semibold text-ink transition hover:bg-elev/70"
            >
              Hide
              <ChevronDown className="size-3.5 rotate-180 transition-transform" />
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
            Presets
          </div>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((preset) => (
              <button
                key={preset.key}
                type="button"
                data-of-preset={preset.key}
                onClick={() => onApplyPreset(preset)}
                className="h-7 rounded-full border border-line bg-white px-2.5 text-[11px] font-semibold text-ink transition hover:bg-elev/70"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
            Permission
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: "Operator", value: false },
              { label: "View as creator (read only)", value: true },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                data-of-viewer={option.value ? "view_as" : "operator"}
                aria-pressed={controls.viewAs === option.value}
                onClick={() => onChange({ viewAs: option.value })}
                className={`h-7 rounded-full px-2.5 text-[11px] font-semibold transition ${
                  controls.viewAs === option.value
                    ? "bg-accent text-white"
                    : "border border-line bg-white text-ink hover:bg-elev/70"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Connection health">
            <select
              data-of-control="health"
              className={selCls}
              value={controls.health ?? ""}
              onChange={(event) =>
                onChange({ health: (event.target.value || null) as ConnectionHealth | null })
              }
            >
              <option value="">Fixture default</option>
              {HEALTHS.map((value) => (
                <option key={value} value={value}>
                  {value.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Automation mode">
            <select
              data-of-control="automation"
              className={selCls}
              value={controls.automationMode ?? ""}
              onChange={(event) =>
                onChange({ automationMode: (event.target.value || null) as AutomationMode | null })
              }
            >
              <option value="">Fixture default</option>
              {AUTOMATIONS.map((value) => (
                <option key={value} value={value}>
                  {value.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Takeover">
            <select
              data-of-control="takeover"
              className={selCls}
              value={controls.takeoverState ?? ""}
              onChange={(event) =>
                onChange({ takeoverState: (event.target.value || null) as TakeoverState | null })
              }
            >
              <option value="">Fixture default</option>
              {TAKEOVERS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Delivery outcome">
            <select
              data-of-control="delivery"
              className={selCls}
              value={controls.delivery ?? ""}
              onChange={(event) =>
                onChange({ delivery: (event.target.value || null) as DeliveryOutcome | null })
              }
            >
              <option value="">Fixture default</option>
              {DELIVERIES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ["accountsRead", "Accounts read"],
              ["conversationsRead", "Conversation list read"],
              ["conversationRead", "Thread read"],
            ] as const
          ).map(([field, label]) => (
            <Field key={field} label={label}>
              <select
                data-of-control={field}
                className={selCls}
                value={controls[field]}
                onChange={(event) => onChange({ [field]: event.target.value as ReadScenario })}
              >
                {READ_SCENARIOS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </Field>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
