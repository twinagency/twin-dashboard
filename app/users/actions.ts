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
