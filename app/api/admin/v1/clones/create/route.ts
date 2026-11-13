import { withAdmin, ok, jsonError, logAdminWrite } from "@/lib/api-route";
import { createCloneRow } from "@/app/clones/actions";
import { getCloneDefaults } from "@/app/settings/actions";
import { resolveClone } from "@/lib/api-read";

export const dynamic = "force-dynamic";

// The only keys a caller may send (G16, W4 F4 + Codex final): an allowlist, so
// a money, tip, paywall or brake column added to rowFromForm later is refused by
// default instead of forwarded by default. Derived from what create needs (name,
// bot_token, status) plus what its one caller sends (twin-bot clonify convert.ts:
// voice_id, intake, and extract.ts FACT_KEYS, the typed persona facts). Every
// other setting starts at the fleet defaults and is changed in Configure (the
// switches also via ../write/route.ts). Anything else is a 400 naming the key.
const CREATE_KEYS = new Set<string>([
  "name", "bot_token", "status", "voice_id", "intake",
  "stage_name", "real_name", "name_shared_with_fans", "date_of_birth", "gender", "height",
  "ethnicity", "sexuality", "hometown", "current_city", "occupation", "creator_type", "known_for",
  "career_start_year", "career_history", "cover_story", "admits_platforms", "platforms", "hair_color",
  "hair_length", "eye_color", "body_type", "cup_size", "measurements", "tattoos", "tattoo_details",
  "piercings", "piercing_details", "enhancements", "voice_accent", "voice_pace", "voice_texture",
  "fan_nicknames", "turn_ons", "turn_offs", "hard_limits", "hard_limits_extra", "meeting_policy",
  "love_policy", "relationship_canon", "acknowledges_other_fans", "wake_time", "sleep_time",
]);

// Create a new clone.
//
// Goes through createCloneRow(), the SAME server action the "New clone" form
// calls, so a clone made over the API is identical to one made in the UI: same
// slug generation, same duplicate-name check, same bot-token uniqueness check,
// same default drip steps, same missing-column retry path for migrations that
// have not landed yet. Inserting into `clones` directly would skip all of that
// and produce a row the dashboard cannot safely edit afterwards.
//
// createCloneRow takes FormData because it is a form action; rowFromForm()
// reads a large set of fields off it and applies the documented defaults for
// anything absent. That default-filling is CORRECT here (a brand new clone
// SHOULD get the defaults) and is only dangerous on UPDATE, which is why the
// update path in ../write/route.ts uses named setters instead.
export const POST = withAdmin(async (req) => {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError("body must be JSON", 400);
  }

  const name = String(body.name ?? "").trim();
  const botToken = String(body.bot_token ?? "").trim();
  if (!name) return jsonError("name is required", 400);
  const refused = Object.keys(body).filter((k) => !CREATE_KEYS.has(k));
  if (refused.length) {
    return jsonError(
      `${refused.join(", ")} cannot be set through this API: create takes name, bot_token, status, voice_id, intake and the typed persona facts only. Every other setting starts at the fleet defaults and is changed in Configure`,
      400,
    );
  }
  if (!botToken) {
    return jsonError(
      "bot_token is required: a clone with no Telegram token cannot be launched, and the slug/token uniqueness checks run against it",
      400,
    );
  }

  // Seed the fleet's new-clone defaults FIRST, same as app/clones/new/page.tsx
  // does for the dashboard's own create form (getCloneDefaults() -> passed into
  // CreateCloneForm -> useCloneConfig's initial state -> every field is present
  // in that form's FormData). Without this, any field the caller omits falls
  // through to rowFromForm()'s bare per-field fallback (0 / false / "") instead
  // of the real default, because that fallback only ever runs against a form
  // that JS controls and always submits. Found 2026-08-31: 5 clones created via
  // this endpoint (Cat, Tamara, Dakota Lyn, Autumn Renae had older instances of
  // it; Allison Parker, Riley Mae Lewis, Kyla Yesenosky, Zoey Foxx were the
  // 2026-08-30 batch) had response_wait_min/max stuck at 0/0, discount caps at
  // 0, and read_receipts_enabled false, none of it visible until an operator
  // opened Configure and looked.
  const defaults = await getCloneDefaults();
  const fd = new FormData();
  for (const [k, v] of Object.entries(defaults)) {
    if (v === null || v === undefined) continue;
    fd.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  // The allowlisted keys (anything else was refused above) are forwarded
  // verbatim to the same rowFromForm() the UI uses, so the API cannot drift from
  // the form's own field handling. Set AFTER the
  // defaults above so an explicit caller value always wins.
  for (const [k, v] of Object.entries(body)) {
    if (v === null || v === undefined) continue;
    if (k === "intake" && typeof v === "object") {
      // intakeFromForm() (app/clones/actions.ts) reads per-field `intake_<key>`
      // entries and a legacy `intake_answers` fallback — never a single nested
      // "intake" key. Sending {intake: {fields, answers}} as one JSON-stringified
      // blob under "intake" (what the generic branch below would do) is read by
      // nothing: intakeFromForm finds no intake_* keys, so `fields` comes back
      // empty and the compiler gets facts only, no actual voice/personality
      // prose. Found 2026-08-30: every clone created through this endpoint had
      // an empty intake_fields and a persona with only NAME filled in.
      const intake = v as { fields?: Record<string, unknown>; answers?: unknown };
      for (const [fk, fv] of Object.entries(intake.fields ?? {})) {
        if (fv !== null && fv !== undefined && fv !== "") fd.set(`intake_${fk}`, String(fv));
      }
      if (intake.answers != null) fd.set("intake_answers", String(intake.answers));
      continue;
    }
    if (typeof v === "object") {
      fd.set(k, JSON.stringify(v));
    } else {
      fd.set(k, String(v));
    }
  }
  // rowFromForm() only writes date_of_birth/hometown/hard_limits/etc. (the
  // PersonaFactsFields block) when this marker is present — it is how the UI
  // avoids nulling those columns on an unrelated Configure save. An API create
  // has no such save-in-progress to protect and every caller here intends to
  // set facts, so without this every typed fact in the body was silently
  // dropped on create with no error (found 2026-08-30: clonify's own verify
  // step read a clone back and found 19 of 21 extracted facts missing).
  fd.set("persona_facts", "1");

  try {
    const id = await createCloneRow(fd);
    // The row exists: a failed read-back falls back to `{ id }`, not a 500
    // (a retry would then hit "already exists").
    const created = await resolveClone(id).catch(() => null);

    logAdminWrite(`clone created "${name}"`, id, {
      name,
      slug: created?.slug ?? null,
      // The bot token is NEVER logged, here or anywhere.
    });

    return ok({
      created: created ?? { id },
      note:
        `Created with status "${String(fd.get("status") ?? "").trim() || "paused"}" (from your payload, default paused). A clone is a database row: index.ts picks up an active clone within ~30s, no deploy. It will have NO photos, NO onboarding steps and an uncompiled persona until you configure it.`,
      next: [
        "POST /api/admin/v1/clones/write {action:\"compile\"} once intake prose is set, or the persona stays empty and the prompt is thin",
        "GET  /api/admin/v1/config?clone=<slug> to read back everything that was stored",
      ],
    });
  } catch (e) {
    // createCloneRow throws readable sentences for the cases an operator can
    // actually fix (duplicate name, token already in use, unusable name), so
    // pass them straight through as 400 rather than flattening to a 500.
    const msg = e instanceof Error ? e.message : "create failed";
    const isUserError =
      /already exists|at least one letter|required|already in use|token/i.test(msg);
    return jsonError(msg, isUserError ? 400 : 500);
  }
});
