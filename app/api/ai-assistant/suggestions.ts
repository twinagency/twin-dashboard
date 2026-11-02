import { supabaseAdmin } from "@/lib/supabase";
import type { CloneToggleField } from "@/app/clones/toggle-fields";

// ── Proactive suggestions ─────────────────────────────────────────────────────
// Deliberately a small, fixed set of explicit checks, not a rules engine: each
// one flags a clone that was CONFIGURED for a feature (has real data set up
// for it) but the toggle that turns it on is off. That's a concrete
// misconfiguration a person would want to know about, not a speculative
// "you should try enabling X" nag. Read-only: this only selects columns
// already on the assistant's read allowlist (tools.ts ALLOWLIST.clones).

export type Suggestion = {
  id: string; // stable key for the UI
  cloneId: string;
  cloneName: string;
  field: CloneToggleField;
  message: string;
  prompt: string; // what clicking the suggestion sends into the chat
};

type CloneRow = {
  id: string;
  name: string;
  status: string;
  voice_enabled: boolean;
  voice_id: string | null;
  discounts_enabled: boolean;
  discount_max_photo: number;
  discount_max_video: number;
  discount_max_bundle: number;
  discount_max_credits: number;
  tips_enabled: boolean;
  spoil_options: unknown;
};

export async function computeSuggestions(): Promise<Suggestion[]> {
  const { data, error } = await supabaseAdmin
    .from("clones")
    .select(
      "id,name,status,voice_enabled,voice_id,discounts_enabled,discount_max_photo,discount_max_video," +
        "discount_max_bundle,discount_max_credits,tips_enabled,spoil_options",
    )
    .eq("status", "active")
    .limit(50);
  if (error) return [];

  const out: Suggestion[] = [];
  for (const c of (data ?? []) as unknown as CloneRow[]) {
    if (!c.voice_enabled && c.voice_id) {
      out.push({
        id: `${c.id}:voice`,
        cloneId: c.id,
        cloneName: c.name,
        field: "voice_enabled",
        message: `${c.name} has a voice configured but Voice notes are off.`,
        prompt: `Turn on voice notes for ${c.name}`,
      });
    }
    const hasDiscountCaps =
      (c.discount_max_photo ?? 0) > 0 ||
      (c.discount_max_video ?? 0) > 0 ||
      (c.discount_max_bundle ?? 0) > 0 ||
      (c.discount_max_credits ?? 0) > 0;
    if (!c.discounts_enabled && hasDiscountCaps) {
      out.push({
        id: `${c.id}:discounts`,
        cloneId: c.id,
        cloneName: c.name,
        field: "discounts_enabled",
        message: `${c.name} has discount caps set but Discounts are off.`,
        prompt: `Turn on discounts for ${c.name}`,
      });
    }
    // The subscriptions suggestion was removed on 2026-07-31. Every other
    // suggestion here names a field setCloneFeature can actually flip; that one
    // could not, because subscriptions_enabled is deliberately absent from
    // CLONE_TOGGLE_FIELDS since the VIP/recurring UI was removed on 2026-07-29.
    // It offered the operator a one-click fix that had nowhere to land.
    const spoilCount = Array.isArray(c.spoil_options) ? c.spoil_options.length : 0;
    if (!c.tips_enabled && spoilCount > 0) {
      out.push({
        id: `${c.id}:tips`,
        cloneId: c.id,
        cloneName: c.name,
        field: "tips_enabled",
        message: `${c.name} has a custom tip menu set up but Tips are off.`,
        prompt: `Turn on tips for ${c.name}`,
      });
    }
  }
  return out.slice(0, 6);
}
