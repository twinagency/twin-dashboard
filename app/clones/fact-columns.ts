// The typed persona-fact column lists, shared by actions.ts (its missing-column
// retry list) and the admin create route (its allowlist). Kept OUT of
// actions.ts because a "use server" module may only export async functions
// (same reason ./toggle-fields.ts exists).

// Migration 033. Pre-migration (columns absent) a write including them fails
// with PostgREST's missing-column error; writeStrippingMissing retries without
// them so a save never crashes.
export const PERSONA_FACT_COLUMNS = [
  "date_of_birth", "gender", "height", "ethnicity", "sexuality", "hometown",
  "current_city", "occupation", "socials", "fan_nicknames", "vibe_preset",
  "turn_ons", "turn_offs", "hard_limits", "hard_limits_extra",
] as const;
// Migration 039, identity canon. See bot/db/migrations/039_identity_canon.sql.
export const IDENTITY_CANON_COLUMNS = [
  "stage_name", "real_name", "name_shared_with_fans",
  "creator_type", "known_for", "career_start_year", "career_history", "cover_story",
  "admits_platforms", "platforms",
  "hair_color", "hair_length", "eye_color", "body_type", "cup_size", "measurements",
  "tattoos", "tattoo_details", "piercings", "piercing_details", "enhancements",
  "ethnicity_tags", "ethnicity_other", "voice_accent", "voice_pace", "voice_texture",
  "meeting_policy", "love_policy", "relationship_canon", "acknowledges_other_fans",
  "wake_time", "sleep_time", "daily_blocks",
  "content_hard_nos", "content_done",
  "reaction_to_rudeness", "reaction_to_compliments", "burst_style",
  "uses_lowercase", "drops_punctuation", "makes_typos", "double_texts",
] as const;
// Retired migration 033 columns: read-only legacy sources (PersonaFactsFields
// carries them forward into ethnicity_other and cover_story).
// rowFromForm never writes them, so a save leaves the stored value untouched.
// Still listed above so the retry path can strip them if anything sends one.
export const RETIRED_FACT_COLUMNS: readonly string[] = ["ethnicity", "occupation"];
// The facts rowFromForm writes under the persona_facts marker from 033 + 039.
// None is a money value. The admin create route writes exactly these; the
// retired two are accepted there only to be reported in `notStored`.
export const WRITABLE_FACT_COLUMNS: readonly string[] = [...PERSONA_FACT_COLUMNS, ...IDENTITY_CANON_COLUMNS]
  .filter((c) => !RETIRED_FACT_COLUMNS.includes(c));
