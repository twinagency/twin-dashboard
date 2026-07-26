// Shared constant + type for the clone feature-toggle allowlist. Kept OUT of
// actions.ts because a "use server" module may only export async functions
// (same reason app/feedback/shared.ts exists separately from feedback/actions.ts).

// CLONE_TOGGLE_FIELDS is the hardcoded allowlist used by setCloneToggle
// (app/clones/actions.ts) and by the /ai assistant's write tools
// (app/api/ai-assistant/write-tools.ts) — the exact same independent,
// non-money boolean columns already cleared for the assistant to READ (see
// ALLOWLIST.clones in app/api/ai-assistant/tools.ts).
export const CLONE_TOGGLE_FIELDS = [
  "photos_enabled",
  "videos_enabled",
  "bundles_enabled",
  "voice_enabled",
  "video_vision_enabled",
  "tips_enabled",
  "charge_messages",
  "live_captions_enabled",
  "reactions_enabled",
  "read_receipts_enabled",
  "message_effects_enabled",
  "ai_disclosure",
  "emojis_enabled",
  "discounts_enabled",
  "subscriptions_enabled",
  "smart_paywall_enabled",
] as const;
export type CloneToggleField = (typeof CLONE_TOGGLE_FIELDS)[number];
