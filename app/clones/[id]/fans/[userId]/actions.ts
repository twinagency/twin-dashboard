"use server";

import { guardDashboardAction } from "@/lib/agency-management";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { setCredits as setCreditsChecked, deleteUser as deleteUserChecked } from "@/app/users/actions";

// All actions operate on a single fan (user row) in the "Allie AI New" project.

// Credits and the full wipe delegate to the canonical /users handlers (G36):
// one validation (refuse, never coerce) and one row-keyed, fail-closed wipe.
export async function setCredits(fd: FormData) {
  await guardDashboardAction("app/clones/[id]/fans/[userId]/actions.ts#setCredits", [fd]);
  const userId = String(fd.get("userId"));
  const cloneId = String(fd.get("cloneId"));
  await setCreditsChecked(fd);
  revalidatePath(`/clones/${cloneId}/fans/${userId}`);
}

// Zero the lifetime usage counters (messages sent + purchased). Does not touch
// the live credit balance — that's `setCredits`.
export async function resetCounters(fd: FormData) {
  await guardDashboardAction("app/clones/[id]/fans/[userId]/actions.ts#resetCounters", [fd]);
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
  await guardDashboardAction("app/clones/[id]/fans/[userId]/actions.ts#toggleActive", [fd]);
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

// Full wipe: see deleteUser in app/users/actions.ts (history keyed by the row).
export async function deleteUser(fd: FormData) {
  await guardDashboardAction("app/clones/[id]/fans/[userId]/actions.ts#deleteUser", [fd]);
  await deleteUserChecked(fd);
  redirect("/users");
}
