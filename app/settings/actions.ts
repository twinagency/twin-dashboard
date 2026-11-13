"use server";

import { guardDashboardAction } from "@/lib/agency-management";

import { supabaseAdmin } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import { invalidateCloneCaches } from "@/lib/query-cache";
import type { Clone } from "@/lib/types";
import { MIN_PAID_MEDIA_PRICE_STARS, normalizeSafeCategoryGuide } from "@/lib/pricing";
import {
  CLONE_DEFAULT_GROUPS,
  effectiveCloneDefaults,
  filterCloneDefaultCascade,
  OPERATIONAL_DEFAULT_JSON,
  OPERATIONAL_DEFAULT_MODELS,
  OPERATIONAL_DEFAULT_NUMBERS,
  OPERATIONAL_DEFAULT_SELECTS,
  OPERATIONAL_DEFAULT_TOGGLES,
  sanitizeCloneDefaults,
  validateCloneDefaultsForWrite,
} from "@/lib/clone-default-policy";
import { API_KEY_FIELDS, CLONE_DEFAULTS_KEY } from "./fields";

export async function saveApiKeys(fd: FormData) {
  await guardDashboardAction("app/settings/actions.ts#saveApiKeys", [fd]);
  const now = new Date().toISOString();
  for (const { key } of API_KEY_FIELDS) {
    const v = String(fd.get(key) ?? "").trim();
    if (!v) continue; // blank = keep the existing key (don't wipe it)
    if (v === "__CLEAR__") {
      await supabaseAdmin.from("app_settings").delete().eq("key", key);
      continue;
    }
    await supabaseAdmin.from("app_settings").upsert({ key, value: v, updated_at: now });
  }
  revalidatePath("/settings");
  await invalidateCloneCaches();
}

// Which keys are currently set (for a masked status display — never returns the
// raw secret).
export async function getApiKeyStatus(): Promise<Record<string, string>> {
  await guardDashboardAction("app/settings/actions.ts#getApiKeyStatus", []);
  const { data } = await supabaseAdmin.from("app_settings").select("key,value").in("key", API_KEY_FIELDS.map((f) => f.key));
  const out: Record<string, string> = {};
  for (const r of data ?? []) {
    const v = String(r.value ?? "");
    if (v) out[r.key] = v.length > 4 ? `••••${v.slice(-4)}` : "••••";
  }
  return out;
}

// ── New-clone defaults ────────────────────────────────────────────────────────
// The template a fresh clone inherits (toggles/dials/models). Stored as one JSON
// blob in app_settings; CreateCloneForm seeds from it, falling back to the
// built-in defaults for anything unset. Field names match `clones` columns so
// they map straight through.
type CloneDefaults = Partial<Clone>;

export async function getCloneDefaults(): Promise<CloneDefaults> {
  await guardDashboardAction("app/settings/actions.ts#getCloneDefaults", []);
  const { data, error } = await supabaseAdmin.from("app_settings").select("value").eq("key", CLONE_DEFAULTS_KEY).maybeSingle();
  if (error) throw new Error(`Could not load fleet defaults: ${error.message}`);
  if (!data?.value) return sanitizeCloneDefaults(null);
  try {
    const parsed = JSON.parse(String(data.value));
    return sanitizeCloneDefaults(parsed);
  } catch {
    return sanitizeCloneDefaults(null);
  }
}

export async function saveCloneDefaults(fd: FormData): Promise<{ appliedFollowers: number }> {
  await guardDashboardAction("app/settings/actions.ts#saveCloneDefaults", [fd]);
  const out: Record<string, unknown> = {};
  for (const k of OPERATIONAL_DEFAULT_SELECTS) {
    const v = fd.get(k);
    if (v != null && String(v).trim() !== "") out[k] = String(v);
  }
  for (const k of OPERATIONAL_DEFAULT_TOGGLES) {
    const v = fd.get(k);
    if (v != null) out[k] = String(v) === "true";
  }
  for (const k of OPERATIONAL_DEFAULT_NUMBERS) {
    const v = fd.get(k);
    if (v == null || String(v).trim() === "") continue;
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`${k} must be a valid number`);
    out[k] = n;
  }
  for (const k of OPERATIONAL_DEFAULT_JSON) {
    const raw = fd.get(k);
    if (raw == null) continue;
    try {
      const parsed = JSON.parse(String(raw));
      // Only persist a usable value: a non-empty object (category_pricing) or a
      // non-empty array (spoil_options / subscription_tiers). Empty → fall back.
      if (Array.isArray(parsed)) {
        if (parsed.length) out[k] = parsed;
      } else if (parsed && typeof parsed === "object" && Object.keys(parsed).length) {
        out[k] = parsed;
      }
    } catch {
      throw new Error(`${k} contains invalid data and was not saved`);
    }
  }
  if (!normalizeSafeCategoryGuide(out.category_pricing)) {
    throw new Error(`Every category price must be a whole number of at least ${MIN_PAID_MEDIA_PRICE_STARS} Stars`);
  }
  for (const [key, minimum] of [["starting_credits", 0], ["credit_pack_size", 1], ["credit_pack_price_stars", 1]] as const) {
    const value = out[key];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
      throw new Error(`${key} must be a whole number of at least ${minimum}`);
    }
  }
  for (const k of OPERATIONAL_DEFAULT_MODELS) {
    const v = fd.get(k);
    if (v != null && String(v).trim() !== "") out[k] = String(v).trim();
  }
  // Validate the complete candidate before the first database write. The strict
  // validator covers enums, model ids, number ranges, JSON item schemas and
  // cross-field ordering; sanitizeCloneDefaults is intentionally read/fallback
  // behavior and must not be used as the save gate.
  const safeDefaults = validateCloneDefaultsForWrite(out) as Record<string, unknown>;
  // W7: cascade only CHANGED fields, so an unrelated edit never reverts a creator's own price, tip rate or toggle. The follower
  // UPDATE runs BEFORE the upsert: on any failure the template is the old one, a retry resends the delta. Concurrent saves can race.
  const update = changedCascadeFields((await getCloneDefaults()) as Record<string, unknown>, safeDefaults);
  let applied = 0;
  if (Object.keys(update).length) {
    const { data: followers, error: followersError } = await supabaseAdmin.from("clones").update(update).eq("uses_default_config", true).select("id");
    if (followersError) throw new Error(`Defaults not saved, followers could not be updated: ${followersError.message}`);
    applied = (followers ?? []).length;
  }
  const { error: saveError } = await supabaseAdmin.from("app_settings").upsert({
    key: CLONE_DEFAULTS_KEY,
    value: JSON.stringify(safeDefaults),
    updated_at: new Date().toISOString(),
  });
  if (saveError) throw new Error(`Followers updated, but fleet defaults could not be saved (save again): ${saveError.message}`);
  revalidatePath("/settings");
  revalidatePath("/clones/new");
  revalidatePath("/clones");
  await invalidateCloneCaches();
  return { appliedFollowers: applied };
}

// A posted field cascades when its effective value differs (sorted keys), with its whole group; compared = written.
const effective = (t: unknown) => effectiveCloneDefaults(t) as Record<string, unknown>;
const canonical = (v: unknown): string => JSON.stringify(v ?? null, (_k, x) =>
  x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([p], [q]) => p.localeCompare(q))) : x);
function changedCascadeFields(previous: Record<string, unknown>, next: Record<string, unknown>): Record<string, unknown> {
  const before = effective(previous), after = effective(next);
  const changed = Object.keys(filterCloneDefaultCascade(next)).filter((k) => canonical(before[k]) !== canonical(after[k]));
  const keys = new Set(changed.flatMap((k) => CLONE_DEFAULT_GROUPS.find((g) => g.includes(k)) ?? [k]));
  return filterCloneDefaultCascade(Object.fromEntries([...keys].map((k) => [k, after[k]])));
}

// category_pricing is excluded from the fields pushed onto EXISTING clones
// (both the save-time cascade above and the manual bulk-push below), even
// though it stays in OPERATIONAL_DEFAULT_JSON for new-clone seeding. Pricing moved to a
// per-clone PPVs workflow with its own Reprice action (2026-09-01) — pushing
// the template's guide onto an existing clone would silently overwrite
// pricing someone tuned by hand for her specific media. New clones still get
// it (see createCloneRow in app/clones/actions.ts, which reads
// getCloneDefaults().category_pricing directly).
// Write a set of config fields (from the same operational allowlist
// saveCloneDefaults produces) onto one or more EXISTING clone rows. Shared by
// the manual "push to selected clones" button (Save writes only changed fields)
// on the Settings page. Never touches identity/persona — `out`/`fields` only
// is filtered again at the write boundary, even if stored JSON is stale.
async function applyConfigToClones(cloneIds: string[], fields: Record<string, unknown>): Promise<void> {
  const update = filterCloneDefaultCascade(fields);
  if (!Object.keys(update).length || !cloneIds.length) return;
  const { error } = await supabaseAdmin.from("clones").update(update).in("id", cloneIds);
  if (error) throw new Error(error.message);
}

// ── Fleet default sync status + manual push ─────────────────────────────────
export type CloneDefaultStatus = { id: string; name: string; slug: string; usesDefault: boolean };

export async function getCloneDefaultStatuses(): Promise<CloneDefaultStatus[]> {
  await guardDashboardAction("app/settings/actions.ts#getCloneDefaultStatuses", []);
  const { data, error } = await supabaseAdmin.from("clones").select("id,name,slug,uses_default_config").order("name");
  if (error) throw new Error(`Could not load clone default status: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: (r.name as string) ?? "unnamed",
    slug: (r.slug as string) ?? "",
    usesDefault: (r as { uses_default_config?: boolean }).uses_default_config ?? true,
  }));
}

// Flip one clone between following the fleet default and her own config. Switching TO default writes the effective
// template (operational fields and prices only) in the same UPDATE as the flag, so later diffs start from it.
export async function setCloneUsesDefault(cloneId: string, usesDefault: boolean): Promise<void> {
  await guardDashboardAction("app/settings/actions.ts#setCloneUsesDefault", [cloneId, usesDefault]);
  const fields = usesDefault ? filterCloneDefaultCascade(effective(await getCloneDefaults())) : {};
  const { error } = await supabaseAdmin.from("clones").update({ ...fields, uses_default_config: usesDefault }).eq("id", cloneId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
  revalidatePath("/clones");
  revalidatePath(`/clones/${cloneId}`);
  await invalidateCloneCaches();
}

// "Push to selected clones now" — apply the CURRENTLY SAVED template onto the
// given clones immediately, independent of Save (e.g. syncing a clone that
// just got switched from custom back to default, without editing the
// template itself). Does not change any clone's uses_default_config.
export async function pushDefaultsToClones(cloneIds: string[]): Promise<void> {
  await guardDashboardAction("app/settings/actions.ts#pushDefaultsToClones", [cloneIds]);
  if (!cloneIds.length) return;
  const defaults = await getCloneDefaults();
  await applyConfigToClones(cloneIds, effective(defaults));
  revalidatePath("/settings");
  revalidatePath("/clones");
  for (const id of cloneIds) revalidatePath(`/clones/${id}`);
  await invalidateCloneCaches();
}

// ── Models in use, for the OpenRouter request-fields panel ────────────────────
// Every live text_model/voice_model on the fleet, so the panel can list "this
// model gets these fields" against what is actually configured right now
// rather than a guessed example. The fields themselves (OPENROUTER_EXTRA_PARAMS)
// are the SAME for every model — this project has no per-clone code paths — the
// per-model list is what changes.
export async function getModelsInUse(): Promise<{ model: string; clones: string[] }[]> {
  await guardDashboardAction("app/settings/actions.ts#getModelsInUse", []);
  const { data } = await supabaseAdmin.from("clones").select("name,text_model,voice_model").order("name");
  const byModel = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    for (const model of [row.text_model, row.voice_model]) {
      if (!model) continue;
      if (!byModel.has(model)) byModel.set(model, new Set());
      byModel.get(model)!.add(row.name ?? "unnamed");
    }
  }
  return [...byModel.entries()]
    .map(([model, clones]) => ({ model, clones: [...clones].sort() }))
    .sort((a, b) => a.model.localeCompare(b.model));
}
