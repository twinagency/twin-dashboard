import { INTAKE_FIELD_KEYS } from "./intake";
export const CREATOR_IDENTITY_FIELDS = [
  ["name", "Creator name"], ["stage_name", "Stage name"], ["real_name", "Real name"],
  ["date_of_birth", "Date of birth"], ["hometown", "Hometown"], ["current_city", "Current city"],
  ["known_for", "Known for"], ["career_history", "Career history"], ["cover_story", "Cover story"],
  ["height", "Height"], ["hair_color", "Hair colour"], ["hair_length", "Hair length"],
  ["eye_color", "Eye colour"], ["voice_accent", "Voice accent"], ["saving_goal", "Saving up for"],
] as const;
export const CREATOR_IDENTITY_SELECT = ["id", "updated_at", "intake", ...CREATOR_IDENTITY_FIELDS.map(([key]) => key)].join(",");
export function creatorIdentityFormAllowed(form: FormData): boolean {
  const allowed = new Set<string>(["revision", ...CREATOR_IDENTITY_FIELDS.map(([key]) => key), ...INTAKE_FIELD_KEYS.map(key => `intake_${key}`)]);
  for (const [key, value] of form.entries()) {
    if (!allowed.has(key) || typeof value !== "string" || value.length > 12000 || form.getAll(key).length !== 1) return false;
  }
  return true;
}
