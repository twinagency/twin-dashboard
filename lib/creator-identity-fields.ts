import { INTAKE_FIELD_KEYS, assembleAnswers } from "./intake";

// These are Identity facts only. No prices, model IDs, credentials, bot status,
// routing, safety switches or configuration can enter this patch.
export const CREATOR_IDENTITY_TEXT = ["name","date_of_birth","gender","height","sexuality","hometown","current_city","stage_name","real_name","name_shared_with_fans","creator_type","known_for","career_history","cover_story","hair_length","hair_color","eye_color","body_type","cup_size","measurements","enhancements","voice_accent","voice_pace","voice_texture","relationship_canon","meeting_policy","love_policy","vibe_preset","reaction_to_rudeness","reaction_to_compliments","burst_style","wake_time","sleep_time","hard_limits_extra","saving_goal","living_situation","ethnicity_other","lowercase_level","punctuation_drop_level","typo_level","double_text_level"] as const;
export const CREATOR_IDENTITY_ARRAYS = ["platforms","tattoo_details","piercing_details","fan_nicknames","turn_ons","turn_offs","content_done","content_hard_nos","hard_limits","catchphrases","favorite_things","dislikes","hobbies","pet_details","ethnicity_tags"] as const;
export const CREATOR_IDENTITY_BOOLS = ["admits_platforms","tattoos","piercings","has_pets"] as const;
export const CREATOR_IDENTITY_COLUMNS = ["id","intake","updated_at",...CREATOR_IDENTITY_TEXT,...CREATOR_IDENTITY_ARRAYS,...CREATOR_IDENTITY_BOOLS,"career_start_year","socials","daily_blocks"] as const;

function stringValue(value: FormDataEntryValue | null, limit = 12000): string {
  if (typeof value !== "string" || value.length > limit) throw new Error("An identity field is missing or too long");
  return value.trim();
}
function jsonArray(value: FormDataEntryValue | null): unknown[] {
  const raw = stringValue(value, 30000);
  const data: unknown = JSON.parse(raw || "[]");
  if (!Array.isArray(data) || data.length > 150) throw new Error("Invalid identity list");
  return data;
}
export function creatorIdentityPatch(fd: FormData, current: Record<string, any>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  // Only copy the fixed allowlist. Unknown form keys are never forwarded to SQL.
  for (const key of CREATOR_IDENTITY_TEXT) {
    if (!fd.has(key)) continue;
    const value = stringValue(fd.get(key));
    if (key === "name" && (!value || value.length > 160)) throw new Error("Enter a creator name");
    if (key === "date_of_birth" && value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)))) throw new Error("Enter a valid date of birth");
    if (["wake_time","sleep_time"].includes(key) && value && !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value)) throw new Error("Enter a valid time");
    if (["lowercase_level","punctuation_drop_level","typo_level","double_text_level"].includes(key) && !["never","sometimes","often","always"].includes(value)) throw new Error("Invalid identity style value");
    patch[key] = value || null;
  }
  for (const key of CREATOR_IDENTITY_ARRAYS) if (fd.has(key)) {
    patch[key] = [...new Set(jsonArray(fd.get(key)).map(value => {
      if (typeof value !== "string" || value.length > 2000) throw new Error("Invalid identity list entry");
      return value.trim();
    }).filter(Boolean))];
  }
  for (const key of CREATOR_IDENTITY_BOOLS) if (fd.has(key)) {
    const value = fd.get(key);
    if (!["true","false",""].includes(String(value))) throw new Error("Invalid identity choice");
    patch[key] = value === "" ? null : value === "true";
  }
  if (fd.has("career_start_year")) {
    const value = stringValue(fd.get("career_start_year"));
    const year = value ? Number(value) : null;
    if (year !== null && (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear() + 1)) throw new Error("Enter a valid career start year");
    patch.career_start_year = year;
  }
  for (const key of ["socials","daily_blocks"] as const) if (fd.has(key)) {
    const keys = key === "socials" ? ["platform","handle","followers"] : ["time","activity"];
    patch[key] = jsonArray(fd.get(key)).map(value => {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid identity row");
      return Object.fromEntries(keys.map(field => {
        const text = (value as Record<string, unknown>)[field] ?? "";
        if (typeof text !== "string" || text.length > 2000) throw new Error("Invalid identity row value");
        return [field, text.trim()];
      }));
    });
  }
  const existingIntake = current.intake && typeof current.intake === "object" ? current.intake : {};
  const fields = { ...(existingIntake.fields || {}) };
  let changedIntake = false;
  for (const key of INTAKE_FIELD_KEYS) if (fd.has(`intake_${key}`)) {
    fields[key] = stringValue(fd.get(`intake_${key}`), 30000);
    changedIntake = true;
  }
  if (changedIntake) patch.intake = { ...existingIntake, fields, answers: assembleAnswers(fields, String(patch.name || current.name || "")) };
  return patch;
}
