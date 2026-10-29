// Plain-language labels for the OnlyFans preview.
//
// The model in lib/onlyfans-preview/types.ts keeps connection health, automation
// mode and delivery outcome strictly separate. These maps preserve that
// separation in the copy, so "connected" never reads as "replying" and "sent"
// never reads as "read" or "bought".

import { QuietLabel } from "@/components/crm/CrmPreview";
import type { Tone } from "@/components/crm/CrmPreview";
import type {
  AutomationMode,
  ConnectionHealth,
  DeliveryOutcome,
  TakeoverState,
} from "@/lib/onlyfans-preview/types";

type Pill = { label: string; tone: Tone };

export const HEALTH_LABEL: Record<ConnectionHealth, Pill> = {
  connected: { label: "Connected", tone: "green" },
  reconnecting: { label: "Reconnecting", tone: "gold" },
  disconnected: { label: "Disconnected", tone: "slate" },
  expired_session: { label: "Session expired", tone: "gold" },
  revoked: { label: "Access revoked", tone: "pink" },
};

export const MODE_LABEL: Record<AutomationMode, Pill> = {
  automated: { label: "Replies: automatic", tone: "green" },
  human_controlled: { label: "Replies: human", tone: "blue" },
  paused: { label: "Replies: paused", tone: "gold" },
  no_contact: { label: "No further contact", tone: "slate" },
};

export const TAKEOVER_LABEL: Record<TakeoverState, Pill | null> = {
  none: null,
  requested: { label: "Takeover requested", tone: "gold" },
  effective: { label: "Human control", tone: "blue" },
};

export const DELIVERY_LABEL: Record<DeliveryOutcome, Pill> = {
  none: { label: "Nothing sent yet", tone: "slate" },
  generating: { label: "Preparing", tone: "blue" },
  queued: { label: "Queued", tone: "blue" },
  dispatching: { label: "Sending", tone: "blue" },
  retracted: { label: "Retracted", tone: "slate" },
  accepted_pending: { label: "Provider accepted, CRM update pending", tone: "blue" },
  sent: { label: "Delivered", tone: "green" },
  partial: { label: "Partly sent", tone: "gold" },
  unknown: { label: "Outcome unknown", tone: "gold" },
  refused: { label: "Refused", tone: "slate" },
  failed: { label: "Failed", tone: "pink" },
};

export function StatusPill({ pill }: { pill: Pill | null }) {
  if (!pill) return null;
  return <QuietLabel tone={pill.tone}>{pill.label}</QuietLabel>;
}

/**
 * Marks a control or a value that exists only in the preview.
 *
 * Nothing in OF-D0 can connect an account, send a message or persist a setting,
 * so anything that looks like it might is tagged here rather than left to a
 * caption somewhere else on the page.
 */
export function SimulatedTag() {
  return (
    <span
      data-of-simulated
      title="Preview only. This control does not contact a provider or change stored state."
      className="inline-flex h-6 items-center rounded-full border border-[#e3c98b] bg-[#fffaee] px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8a5f06]"
    >
      Simulated
    </span>
  );
}

export function HealthPill({ health }: { health: ConnectionHealth }) {
  return <StatusPill pill={HEALTH_LABEL[health]} />;
}

export function ModePill({ mode }: { mode: AutomationMode }) {
  return <StatusPill pill={MODE_LABEL[mode]} />;
}

export function TakeoverPill({ state }: { state: TakeoverState }) {
  return <StatusPill pill={TAKEOVER_LABEL[state]} />;
}

export function DeliveryPill({ outcome }: { outcome: DeliveryOutcome }) {
  return <StatusPill pill={DELIVERY_LABEL[outcome]} />;
}

/** Money is formatted from minor units only. No floats, no implicit currency. */
export function formatMoney(money: { currency: string; minorUnits: number }): string {
  const whole = Math.trunc(money.minorUnits / 100);
  const cents = Math.abs(money.minorUnits % 100).toString().padStart(2, "0");
  return `${money.currency} ${whole}.${cents}`;
}
