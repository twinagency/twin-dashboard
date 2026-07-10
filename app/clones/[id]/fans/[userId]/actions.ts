"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";

// All actions operate on a single fan (user row) in the "Allie AI New" project.

export async function setCredits(fd: FormData) {
  const userId = String(fd.get("userId"));
  const cloneId = String(fd.get("cloneId"));
  const credits = Math.max(0, Math.floor(Number(fd.get("credits")) || 0));
  const { error } = await supabaseAdmin
    .from("users")
    .update({ message_credits: credits })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath(`/clones/${cloneId}/fans/${userId}`);
}

// Zero the lifetime usage counters (messages sent + purchased). Does not touch
// the live credit balance — that's `setCredits`.
export async function resetCounters(fd: FormData) {
  const userId = String(fd.get("userId"));
  const cloneId = String(fd.get("cloneId"));
  const { error } = await supabaseAdmin
    .from("users")
    .update({ total_messages_sent: 0, total_messages_purchased: 0 })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath(`/clones/${cloneId}/fans/${userId}`);
}

export async function toggleActive(fd: FormData) {
  const userId = String(fd.get("userId"));
  const cloneId = String(fd.get("cloneId"));
  const active = fd.get("active") === "true";
  const { error } = await supabaseAdmin
    .from("users")
    .update({ is_active: active })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath(`/clones/${cloneId}/fans/${userId}`);
}

// Full wipe: the user row (cascades message_purchases + user_received_media via
// FK on delete cascade) plus chat_history, which is keyed by (clone_id,
// telegram_id) and has no FK so won't cascade on its own.
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

  revalidatePath(`/clones/${cloneId}/fans`);
  redirect(`/clones/${cloneId}/fans`);
}
