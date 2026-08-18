// The chat_history.meta.flow contract, dashboard side.
//
// The bot stamps a stable slug on every row it writes (bot/src/types.ts
// ChatMeta.flow, emitted by chatMetaRow() in bot/src/data/supabase-store.ts).
// This file turns that slug into what the operator reads under the bubble.
//
// TWO RULES, both learned the expensive way on this project:
//
// 1. FORWARD ONLY. Nothing recorded which flow produced a message before the
//    bot started stamping it (2026-08-18), so a row with no `flow` gets NO
//    label. It is unknown, not "a normal reply". The same rule the drip marker
//    already runs under: never infer provenance from timestamps or content.
//
// 2. AN UNKNOWN SLUG STILL RENDERS. A new flow shipped on the bot side must
//    show up here as something rather than vanish, otherwise this file silently
//    becoming stale looks identical to the bot not stamping at all. Unknown
//    slugs fall through to a de-underscored version of the slug itself.
//
// Check C1 in scripts/check-fan-thread.ts asserts this map covers every slug the
// bot can write, by reading the bot's own FLOW_SLUGS list out of
// ../bot/src/types.ts rather than restating it. Adding a flow to the bot without
// adding it here turns that check red.

export type FlowLabel = { label: string; emoji: string; hint: string };

export const FLOW_LABELS: Record<string, FlowLabel> = {
  // ── live conversation ────────────────────────────────────────────────────
  text_reply: { label: "text flow", emoji: "💬", hint: "Her normal live text reply, composed for this turn." },
  voice_reply: { label: "voice flow", emoji: "🎙️", hint: "The router chose a voice note for this turn instead of text." },
  vision_reply: { label: "vision", emoji: "👀", hint: "She replied to a photo the fan sent her." },
  media_photo: { label: "photo flow", emoji: "📷", hint: "The router decided to send a photo on this turn." },
  media_video: { label: "video flow", emoji: "🎥", hint: "The router decided to send a video on this turn." },
  media_bundle: { label: "bundle flow", emoji: "🎁", hint: "The router decided to send a photo bundle on this turn." },

  // ── money ────────────────────────────────────────────────────────────────
  paywall: { label: "out of credits", emoji: "💳", hint: "The out-of-messages wall, with the buy button attached." },
  spoil_menu: { label: "tip menu", emoji: "💝", hint: "She offered the tip amounts, one button per amount." },
  spoil_invoice: { label: "tip invoice", emoji: "💝", hint: "A single tip invoice button for the amount he asked for." },
  vip_invoice: { label: "vip offer", emoji: "👑", hint: "A subscription tier invoice button." },

  // ── automated ────────────────────────────────────────────────────────────
  onboarding: { label: "onboarding", emoji: "🚶", hint: "A configured onboarding step fired for this fan." },
  drip_step: { label: "drip", emoji: "💧", hint: "The automated campaign sent this. Nobody typed it." },
  winback: { label: "win-back", emoji: "🪝", hint: "The warmer lapsed-payer pull that replaces a campaign step." },
  followup: { label: "follow-up", emoji: "⏰", hint: "The one-off nudge after the fan went quiet mid-conversation." },
  bonus_photo: { label: "bonus photo", emoji: "🎀", hint: "The free thank-you photo after a purchase." },

  // ── operator / system ────────────────────────────────────────────────────
  manual: { label: "manual send", emoji: "🧑", hint: "Sent by the operator from this dashboard, not by the bot." },
  refusal: { label: "safety refusal", emoji: "🛑", hint: "A safety gate refused the turn and sent this instead." },
  system: { label: "system note", emoji: "⚙", hint: "A bookkeeping line she wrote to her own memory, e.g. a cancelled subscription." },
};

/** Unknown slug → still readable. See rule 2 above. */
export function flowLabelOf(slug: string | null | undefined): FlowLabel | null {
  if (!slug) return null;
  return FLOW_LABELS[slug] ?? { label: slug.replace(/_/g, " "), emoji: "⚙", hint: `Flow "${slug}", not yet described in the dashboard.` };
}
