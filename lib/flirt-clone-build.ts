// FLIRT approved applicant -> Twin clone: the PURE half (no database, no network).
//
// A FLIRT clone is a row in Twin's `clones` table: the live Twin bot runtime
// (twin-bot main) polls every status=active row, so FLIRT builds no bot of its own.
// This file turns what the applicant gave us (questionnaire answers, consent,
// upload references) into the exact row to insert, and refuses when something that
// must exist does not. It performs no I/O so every rule here is unit testable.
//
// What it will NOT do, on purpose:
//   - invent anything. A value is copied only when she gave it.
//   - create her active. The row is paused with a placeholder token until a human
//     pastes the real BotFather token and presses go live in Twin's dashboard.
//   - clone a voice. That needs its own explicit voice consent.
//   - put her phone number or email into prompts or into the clone row.
import { FLIRT_QUESTIONNAIRE_STEPS, flirtRows } from "./flirt-questionnaire";
import { CREATOR_QUESTIONNAIRE } from "./creator-questionnaire";

export const FLIRT_CLONE_PIPELINE_FLAG = "FLIRT_CLONE_PIPELINE_ENABLED";
export const PLACEHOLDER_TOKEN_PREFIX = "PENDING-BOTFATHER-";

/** Master switch. Defaults OFF: unset, "false" or anything but exactly "true" is off. */
export function flirtClonePipelineEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[FLIRT_CLONE_PIPELINE_FLAG] === "true"
    && env.FLIRT_BACKEND_ENABLED === "true"
    && env.FLIRT_SUPABASE_PROJECT_REF === "lkmfwpqegjluirfusnaw"
    && env.FLIRT_LIVE_TWIN_ENABLED === "true";
}

export type RefusalCode =
  | "not_approved" | "no_consent" | "no_answers" | "no_name" | "dob_missing" | "dob_invalid" | "under_age";

export class CloneBuildRefusal extends Error {
  constructor(readonly code: RefusalCode, message: string) { super(message); this.name = "CloneBuildRefusal"; }
}

export type BuildInput = {
  account: { id: string; display_name: string | null; account_status: string };
  application: { status: string; answers: unknown } | null;
  consent: { legal_name: string | null; consent_version: string | null; signed_at: string | null } | null;
  files: { id: string; kind: string; bucket: string; storage_path: string; original_name: string | null; mime_type: string | null; size_bytes: number | null; storage_transfer_status: string }[];
  now?: Date;
};

export type FileRef = { id: string; kind: string; original_name: string | null; mime_type: string | null; size_bytes: number | null; bucket: string; storage_path: string };

export type ClonePacket = {
  creator_account_id: string;
  name: string;
  /** Typed `clones` columns (facts a fan can ask about). Only present when she answered. */
  facts: Record<string, string>;
  /** Prose slots the Twin compiler reads (`intake.fields`). */
  fields: Record<string, string>;
  /** Her answers as readable text, minus contact details. Stored as `intake.answers`. */
  answers_blob: string;
  consent: { legal_name: string; consent_version: string; signed_at: string };
  /** Verified uploads only. Handed to a human for Twin's /media page (captioning and pricing happen there). */
  files: FileRef[];
  warnings: string[];
};

// Contact details and identity documents never go into a prompt or the clone row.
const NEVER_COPY = new Set(["phone_number", "email_address", "full_name", "date_of_birth", "social_links", "flirt_social_profiles", "explicit_chat_allowed"]);
const LABELS = new Map([
  ...CREATOR_QUESTIONNAIRE.map((q) => [q.id, q.label] as const),
  ...FLIRT_QUESTIONNAIRE_STEPS.flatMap(step => step.fields.map(field => [field.id, field.label[0]] as const)),
]);
const REPLACED_FIELDS: Record<string, string[]> = {
  flirt_pets: ["pets"],
  flirt_languages: ["languages"],
  flirt_marks: ["appearance_profile", "tattoos_piercings", "tattoos", "piercings"],
  flirt_relationship_status: ["relationship_status"],
  flirt_siblings: ["family_profile", "siblings_family"],
  flirt_children: ["family_profile", "kids"],
  from_grew_up: ["home_background"],
  currently_live: ["home_background"],
};
const REPLY_IDS = ["reply_today", "reply_missed", "reply_secret", "reply_favorite", "reply_meet", "reply_goodnight"];
const STYLE_IDS = ["texting_style", "top_emojis", "uses_slang"];
const QUIRK_IDS = ["catch_phrases", "humour_style", "overall_tone", "ai_traits", "pet_peeves", "flirt_response"];
const LIMIT_IDS = ["boundaries", "topics_avoid_ai"];

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(", ");
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
const NO_ANSWER = /^(n\/?a|none|nothing|-|\.)?$/i;
const answered = (value: string) => value !== "Keep private" && !NO_ANSWER.test(value.trim());

function profileAnswer(id: string, value: string): string {
  if (id === "boundaries") return value === "No" ? "" : value.replace(/^Yes:\s*/, "");
  const rows = flirtRows(value);
  if (!rows.length) return value;
  return rows.map(row => row.filter(Boolean).join(", ")).join("\n");
}

function label(id: string): string {
  return LABELS.get(id) ?? id.replace(/_/g, " ");
}

/** Accepts MM/DD/YYYY (the form's placeholder), MM-DD-YYYY and YYYY-MM-DD. Returns ISO date or null. */
export function parseDateOfBirth(raw: string): string | null {
  const value = raw.trim().replace(/\s+/g, "");
  let year: number, month: number, day: number;
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(value);
  if (match) { year = +match[1]; month = +match[2]; day = +match[3]; }
  else if ((match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(value))) { month = +match[1]; day = +match[2]; year = +match[3]; }
  else return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function ageOn(isoDate: string, now: Date): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) age -= 1;
  return age;
}

export function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function buildClonePacket(input: BuildInput): ClonePacket {
  const now = input.now ?? new Date();
  // 1. Consent. The whole onboarding is optional by design, so this is the one gate.
  const c = input.consent;
  if (!c || !c.signed_at || !c.legal_name?.trim() || !c.consent_version?.trim()) {
    throw new CloneBuildRefusal("no_consent", "No signed consent on record. A clone is never built without it.");
  }
  // 2. Approval, both on the account and on her latest application.
  if (input.account.account_status !== "approved" || input.application?.status !== "approved") {
    throw new CloneBuildRefusal("not_approved", "The application and the account must both be approved first.");
  }
  const raw = input.application.answers && typeof input.application.answers === "object" && !Array.isArray(input.application.answers)
    ? input.application.answers as Record<string, unknown> : {};
  const replaced = new Set(Object.entries(REPLACED_FIELDS).flatMap(([id, old]) => id in raw ? old : []));
  const answers = new Map(Object.entries(raw)
    .filter(([id]) => !replaced.has(id))
    .map(([id, value]) => [id, profileAnswer(id, text(value))] as const)
    .filter(([, value]) => value && value !== "Keep private"));
  if (!answers.size) throw new CloneBuildRefusal("no_answers", "The questionnaire is empty, there is nothing to build a persona from.");

  // 3. Age gate. A missing or unreadable birthday blocks the build, never defaults.
  const dobText = answers.get("date_of_birth");
  if (!dobText) throw new CloneBuildRefusal("dob_missing", "Date of birth is missing. It is required to confirm she is 18 or older.");
  const dob = parseDateOfBirth(dobText);
  if (!dob) throw new CloneBuildRefusal("dob_invalid", "Date of birth could not be read. Ask her to correct it (MM/DD/YYYY).");
  if (ageOn(dob, now) < 18) throw new CloneBuildRefusal("under_age", "Under 18. No clone may be built.");

  const warnings: string[] = [];
  const firstName = (answers.get("full_name") ?? "").split(/\s+/)[0] ?? "";
  const name = answers.get("stage_name") || answers.get("preferred_name") || input.account.display_name?.trim() || firstName;
  if (!name) throw new CloneBuildRefusal("no_name", "No name to build with. Add a display name or stage name.");

  // 4. Typed facts: only what she gave, only columns that take free text.
  const facts: Record<string, string> = { date_of_birth: dob };
  const put = (column: string, id: string) => { const v = answers.get(id); if (v && answered(v)) facts[column] = v; };
  put("stage_name", "stage_name"); put("real_name", "full_name"); put("height", "height");
  put("ethnicity", "ethnicity"); put("current_city", "currently_live");
  const limits = LIMIT_IDS.map((id) => answers.get(id)).filter((v): v is string => !!v && answered(v));
  if (raw.explicit_chat_allowed === "No") limits.unshift("Keep chat free of explicit sexual language or descriptions.");
  if (limits.length) facts.hard_limits_extra = limits.join("\n");
  else warnings.push("She gave no boundaries or topics to avoid. Ask her before going live.");

  // 5. Prose slots. Replies and style are the highest-value voice material.
  const lines = (ids: string[]) => ids.filter((id) => answers.has(id) && answered(answers.get(id)!))
    .map((id) => `${label(id)}\n${answers.get(id)}`).join("\n\n");
  const fields: Record<string, string> = {};
  const exampleTexts = [lines(REPLY_IDS), lines(STYLE_IDS)].filter(Boolean).join("\n\n");
  if (exampleTexts) fields.example_texts = exampleTexts; else warnings.push("No example replies. Her texting style will be generic.");
  const quirks = lines(QUIRK_IDS);
  if (quirks) fields.quirks = quirks;
  const used = new Set([...REPLY_IDS, ...STYLE_IDS, ...QUIRK_IDS, ...LIMIT_IDS, ...NEVER_COPY, "stage_name", "preferred_name", "height", "ethnicity", "currently_live"]);
  const rest = [...answers.keys()].filter((id) => !used.has(id));
  const lifeIds = rest.filter((id) => /^(flirt_(hobbies|favourites|pets|siblings|children|languages|marks)|fav_|games|reading|sports|party|drink|travel|countries|hidden|random|pets|from_|siblings|kids|introvert|star_sign|languages|events)/.test(id));
  const life = lines(lifeIds);
  if (life) fields.life_tastes = life;
  const notes = lines(rest.filter((id) => !lifeIds.includes(id)));
  if (notes) fields.notes = notes;

  // 6. The readable blob, kept on the row so a later re-extraction has the source.
  const blob = [...answers.entries()].filter(([id]) => !NEVER_COPY.has(id))
    .map(([id, v]) => `${label(id)}\n${v}`).join("\n\n");

  const files = input.files.filter((f) => f.storage_transfer_status === "verified").map((f) => ({
    id: f.id, kind: f.kind, original_name: f.original_name, mime_type: f.mime_type, size_bytes: f.size_bytes, bucket: f.bucket, storage_path: f.storage_path,
  }));
  if (!files.length) warnings.push("No verified uploads. Her library will be empty and she will have nothing to sell.");
  if (files.some((f) => f.kind.includes("voice"))) warnings.push("A voice sample exists. Voice cloning is NOT automatic: it needs her explicit voice consent.");

  return {
    creator_account_id: input.account.id, name, facts, fields, answers_blob: blob,
    consent: { legal_name: c.legal_name.trim(), consent_version: c.consent_version.trim(), signed_at: c.signed_at },
    files, warnings,
  };
}

// Mirrors createCloneRow() in the Twin dashboard (app/clones/actions.ts).
const DEFAULT_DRIP_STEPS = [
  { type: "text", after_hours: 2 }, { type: "text", after_hours: 6 },
  { type: "text", after_hours: 12 }, { type: "text", after_hours: 20 },
] as const;

/** The exact row inserted into Twin's `clones` table. Always paused, always a placeholder token. */
export function buildTwinCloneRow(packet: ClonePacket, slug: string): Record<string, unknown> {
  return {
    ...packet.facts,
    name: packet.name,
    slug,
    bot_token: PLACEHOLDER_TOKEN_PREFIX + packet.creator_account_id,
    status: "paused",
    drip_steps: DEFAULT_DRIP_STEPS,
    intake: { answers: packet.answers_blob, fields: packet.fields, flirt_creator_account_id: packet.creator_account_id },
  };
}
