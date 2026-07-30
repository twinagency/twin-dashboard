"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";

// Fan controls for the /users inbox right panel (ported from the old
// /clones/[id]/fans/[userId] page — everything lives in the inbox now).

export async function setCredits(fd: FormData) {
  const userId = String(fd.get("userId"));
  const credits = Math.max(0, Math.floor(Number(fd.get("credits")) || 0));
  const { error } = await supabaseAdmin
    .from("users")
    .update({ message_credits: credits })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/users");
}

// Zero the lifetime usage counters (messages sent + purchased). Does not touch
// the live credit balance — that's `setCredits`.
export async function resetCounters(fd: FormData) {
  const userId = String(fd.get("userId"));
  const { error } = await supabaseAdmin
    .from("users")
    .update({ total_messages_sent: 0, total_messages_purchased: 0 })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/users");
}

export async function toggleActive(fd: FormData) {
  const userId = String(fd.get("userId"));
  const active = fd.get("active") === "true";
  const { error } = await supabaseAdmin
    .from("users")
    .update({ is_active: active })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/users");
}

// Lift (or re-apply) the safety block — users.blocked is the persisted
// "she never replies to him again" switch set by src/safety.ts.
//
// NOTE: this does NOT lift the self-declared-minor gate. That is deliberate,
// see clearMinorFlag below: unblocking is a routine action, and silently
// un-gating a fan who stated he was underage is not.
export async function setBlocked(fd: FormData) {
  const userId = String(fd.get("userId"));
  const blocked = fd.get("blocked") === "true";
  const { error } = await supabaseAdmin
    .from("users")
    .update({ blocked })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/users");
}

// CLEAR THE SELF-DECLARED-MINOR GATE (migration 083).
//
// THE BUG THIS FIXES: safety.ts documents the remedy for a wrongly flagged
// adult as "an operator clears `blocked` from the dashboard exactly as they
// already can". That remedy did not work. The bot's isMinorGated() is
//
//     !!user.minorFlaggedAt || user.blockedReason === "minor"
//
// and setBlocked above updates ONLY `blocked`. So an operator would unblock a
// wrongly flagged adult, watch her start replying again, and reasonably believe
// it was fixed, while he stayed permanently barred from every photo, video,
// bundle, free preview, paid send, onboarding media step, campaign drip, voice
// note and emoji reaction. Silently, with nothing in the UI saying why, and no
// way to ever sell him anything again.
//
// Both fields must be cleared together or the gate survives on whichever one is
// left. blocked/blocked_at go too, because safety.ts sets all four as one act
// and leaving him blocked-but-un-gated is a state nothing else produces.
//
// Kept as its OWN action rather than folded into unblock: this is the one
// safety verdict in the system with a real-world cost if reversed wrongly, so
// it should take a deliberate second click and its own confirmation, not ride
// along on a routine unblock.
export async function clearMinorFlag(fd: FormData) {
  const userId = String(fd.get("userId"));
  const { error } = await supabaseAdmin
    .from("users")
    .update({ minor_flagged_at: null, blocked_reason: null, blocked: false, blocked_at: null })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/users");
}

// Per-fan pause. users.paused, gated in handler.ts/campaign.ts/followup.ts
// so this ONE fan gets no replies and no drip while it's on. Distinct from
// both the whole-clone Active/Paused status (clones.status) and the safety
// block above (users.blocked): this is just "leave him on read for a while",
// not a ban and not a clone-wide pause.
export async function setPaused(fd: FormData) {
  const userId = String(fd.get("userId"));
  const paused = fd.get("paused") === "true";
  const { error } = await supabaseAdmin
    .from("users")
    .update({ paused })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/users");
}

// Full wipe: the user row (cascades purchases + received-media via FK) plus
// chat_history, which is keyed by (clone_id, telegram_id) and won't cascade.
export async function deleteUser(fd: FormData) {
  const userId = String(fd.get("userId"));
  const cloneId = String(fd.get("cloneId"));
  const telegramId = String(fd.get("telegramId"));

  await supabaseAdmin
    .from("chat_history")
    .delete()
    .eq("clone_id", cloneId)
    .eq("telegram_id", telegramId);

  const { error } = await supabaseAdmin.from("users").delete().eq("id", userId);
  if (error) throw new Error(error.message);

  revalidatePath("/users");
}
