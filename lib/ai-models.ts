// AI models (made-up girls sold inside T-Social): pure helpers, no database and no Next imports so offline checks run them.
// Tables: ai_models, ai_model_images (twin-bot migration 20261008140000_ai_models.sql).
// The chat variables reuse the Bot V2 details form names (twin-sexbot src/girls/template.ts GirlVars) so a girl's persona can be
// pasted between the two. Only the ones a simple AI girl needs are kept.

export type PersonaField = { key: string; label: string; hint: string; rows: number; max: number; group: "Basics" | "Voice" | "Chat rules" };

export const PERSONA_FIELDS: PersonaField[] = [
  { key: "VIBE", label: "VIBE", hint: "ONE word shown on her T-Social AI card: Bratty, Playful, Sweet, Shy, Dominant. Not a Bot V2 variable, only the card uses it.", rows: 1, max: 16, group: "Basics" },
  { key: "BIRTH_DATE", label: "BIRTH_DATE", hint: "YYYY-MM-DD. Her age is worked out from this. She must be 18 or older, and must clearly look it.", rows: 1, max: 10, group: "Basics" },
  { key: "LOOKS", label: "LOOKS", hint: "Height, body, hair, eyes, tattoos. Keep it the same as her image prompt so chat and pics agree.", rows: 2, max: 400, group: "Basics" },
  { key: "LIKES", label: "LIKES", hint: "Hobbies, music, food, games, colours.", rows: 2, max: 400, group: "Basics" },
  { key: "CITY", label: "CITY", hint: "Where she is right now, for 'where are you'. Made up is fine.", rows: 1, max: 80, group: "Basics" },
  { key: "TIMEZONE", label: "TIMEZONE", hint: "IANA zone, like America/Los_Angeles. Her local time is worked out from this.", rows: 1, max: 60, group: "Basics" },
  { key: "PERSONALITY", label: "PERSONALITY", hint: "One or two lines: playful, shy, bratty, girl next door...", rows: 2, max: 500, group: "Voice" },
  { key: "TEXT_EXAMPLES", label: "TEXT_EXAMPLES", hint: "A few real-sounding texts she would send, separated by a slash.", rows: 3, max: 1200, group: "Voice" },
  { key: "SIGNATURE_WORDS", label: "SIGNATURE_WORDS", hint: "Her little words, like lol, hahaha, omggg.", rows: 1, max: 200, group: "Voice" },
  { key: "EMOJIS", label: "EMOJIS", hint: "none, or rare, sometimes or often followed by a colon and her emojis. Example: sometimes: 😉😈", rows: 1, max: 120, group: "Voice" },
  { key: "PET_NAMES", label: "PET_NAMES", hint: "What she calls him: babe, baby, good boy.", rows: 1, max: 200, group: "Voice" },
  { key: "SEX_ROLE", label: "SEX_ROLE", hint: "How she is in bed: submissive, dominant or switch, and what that looks like.", rows: 2, max: 500, group: "Chat rules" },
  { key: "SEX_PACE", label: "SEX_PACE", hint: "How fast she takes a chat sexual.", rows: 2, max: 400, group: "Chat rules" },
  { key: "LOVE_REPLY", label: "LOVE_REPLY", hint: "What she does when he catches feelings.", rows: 2, max: 300, group: "Chat rules" },
  { key: "MEET_REPLY", label: "MEET_REPLY", hint: "What she says when he asks to meet. She never agrees to meet.", rows: 2, max: 300, group: "Chat rules" },
  { key: "OFF_LIMITS", label: "OFF_LIMITS", hint: "Topics she never goes into. Minors, incest and non-consent are always off, whatever is written here.", rows: 2, max: 400, group: "Chat rules" },
];

export const PERSONA_KEYS = PERSONA_FIELDS.map((f) => f.key);
export const IMAGE_PRICE_MIN = 1, IMAGE_PRICE_MAX = 10_000;

export function slugify(name: string): string {
  return name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
}

/** No dashes of the em or en kind anywhere a fan could read it (replaced by a comma), control characters dropped, trimmed. */
export function cleanText(v: unknown, max: number): string {
  return String(v ?? "").normalize("NFKC").replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, " ").replace(/\s*[\u2014\u2013]\s*/g, ", ").trim().slice(0, max).trim();
}

/** Whole years between a YYYY-MM-DD birth date and `now`, or null when it is not a real date. */
export function ageFrom(birth: string, now: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < mo || (now.getUTCMonth() + 1 === mo && now.getUTCDate() < d)) age--;
  return age;
}

export function validEmojis(v: string): boolean {
  const t = v.trim();
  return /^none$/i.test(t) || (/^(rare|sometimes|often)\s*:\s*\S+/i.test(t) && /\p{Extended_Pictographic}/u.test(t));
}

export type PersonaResult = { ok: true; name: string; tagline: string | null; about: string | null; consent: string; vars: Record<string, string> } | { ok: false; error: string };

/** Validate and clean the persona form. Birth date is optional while she is a draft, but when given it must be a real date and 18 or older. */
export function validatePersona(input: Record<string, unknown>, now: Date = new Date()): PersonaResult {
  const name = cleanText(input.name, 40);
  if (!name) return { ok: false, error: "Name is required" };
  const tagline = cleanText(input.tagline, 60), about = cleanText(input.about, 300);
  const consent = cleanText(input.consent_note, 200) || "fictional";
  const vars: Record<string, string> = {};
  for (const f of PERSONA_FIELDS) {
    const v = cleanText(input[f.key], f.max);
    if (v) vars[f.key] = f.rows === 1 ? v.replace(/\s+/g, " ") : v;
  }
  if (vars.BIRTH_DATE) {
    const age = ageFrom(vars.BIRTH_DATE, now);
    if (age == null) return { ok: false, error: "BIRTH_DATE must be a real date like 2002-04-18" };
    if (age < 18) return { ok: false, error: "She must be 18 or older" };
  }
  if (vars.EMOJIS && !validEmojis(vars.EMOJIS)) return { ok: false, error: "EMOJIS must be none, or rare, sometimes or often then a colon and emojis" };
  vars.NAME = name;
  return { ok: true, name, tagline: tagline || null, about: about || null, consent, vars };
}

export function validPrice(v: unknown): number | null {
  const n = typeof v === "number" ? v : /^\d+$/.test(String(v ?? "").trim()) ? Number(String(v).trim()) : NaN;
  return Number.isInteger(n) && n >= IMAGE_PRICE_MIN && n <= IMAGE_PRICE_MAX ? n : null;
}

export const IMAGE_MAX_MB = 25, VIDEO_MAX_MB = 45;
export type UploadKind = { kind: "photo" | "video"; ext: string; contentType: string };
/** What an upload is, from its declared type and name. Only jpeg/png/webp/heic photos and mp4/mov/webm videos. */
export function uploadKind(type: string, name: string): UploadKind | null {
  const t = type.toLowerCase();
  if (/^image\/(jpeg|jpg|png|webp|heic|heif)$/.test(t)) return { kind: "photo", ext: "jpg", contentType: "image/jpeg" };
  if (t === "video/mp4" || (t === "" && /\.mp4$/i.test(name))) return { kind: "video", ext: "mp4", contentType: "video/mp4" };
  if (t === "video/quicktime" || /\.mov$/i.test(name)) return { kind: "video", ext: "mp4", contentType: "video/mp4" };
  if (t === "video/webm") return { kind: "video", ext: "webm", contentType: "video/webm" };
  return null;
}

/** Can she be shown in T-Social? Needs an adult birth date and at least one approved free pic or video with a public copy. */
export function showBlocker(vars: Record<string, string> | null, images: { status: string; access: string; public_path: string | null }[], now: Date = new Date()): string | null {
  const age = ageFrom(String(vars?.BIRTH_DATE ?? ""), now);
  if (age == null || age < 18) return "Set BIRTH_DATE first, she must be 18 or older";
  if (!images.some((i) => i.status === "approved" && i.access === "free" && i.public_path)) return "Approve at least one Free pic first, so she has something to show";
  return null;
}
