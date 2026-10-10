// Operator-facing copy for clones that run the Twin V2 engine (clones.engine = 'v2'). V2 sells PURE tips: it reads only tips_enabled,
// tip_max_stars, spoil_options, tip_reask_cooldown_seconds, spoil_context_lookback_messages and the push level. A V2 tip grants no message
// credits and no media, so the legacy tip_credits_per_100_stars rate does not apply to it, and an empty spoil_options list means the bot asks
// the fan how many Stars (no preset amounts are invented). Kept in one place so the settings page says exactly what the code does.
export const isV2Engine = (clone?: { engine?: string | null } | null): boolean => clone?.engine === "v2";

export const V2_TIPS_SECTION_HINT =
  "She can ask to be spoiled with Stars. Tips on V2 are pure tips: they give him no message credits and no media. Always recorded as tip revenue. If the amount list below is empty she asks him how many Stars.";

export const V2_TIP_CREDITS_LABEL = "Credits per 100 stars tipped (legacy V1 tips only, V2 tips give no reply credits)";
export const V2_TIP_CREDITS_HINT_PREFIX =
  "This clone runs V2, so this rate is not used: V2 tips give no reply credits. It only applies to legacy V1 tips, and the value stays saved as is. ";

export const V2_SPOIL_LABEL = "Tip amount choices";
export const V2_SPOIL_HINT =
  "An empty list means the bot asks the fan how many Stars. No preset amounts are invented. Add buttons only if you want her to offer fixed amounts. The single-tip ceiling above still applies.";
