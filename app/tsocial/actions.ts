"use server";

import { revalidatePath } from "next/cache";
import { guardDashboardAction } from "@/lib/agency-management";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { isAuthed } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase-service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Same admin pattern as app/admin/earnings-split/actions.ts: guard first, then
// require a null (non-agency, non-creator) access AND a real admin session.
async function requireAdmin(action: string, args: unknown[]) {
  await guardDashboardAction(`app/tsocial/actions.ts#${action}`, args);
  if ((await getDashboardAccess()) !== null || !(await isAuthed())) throw new Error("Admin access required");
}

export async function setCreatorEnabled(cloneId: string, enabled: boolean) {
  await requireAdmin("setCreatorEnabled", [cloneId, enabled]);
  if (!UUID.test(cloneId) || typeof enabled !== "boolean") throw new Error("Invalid request");
  const db = serviceClient();
  const { data: clone } = await db.from("clones").select("id").eq("id", cloneId).maybeSingle();
  if (!clone) throw new Error("Unknown creator");
  const { error } = await db.from("tsocial_creators").upsert({ clone_id: cloneId, enabled }, { onConflict: "clone_id" });
  if (error) throw new Error("Could not save");
  revalidatePath("/tsocial");
}

export async function setPostEnabled(postId: string, enabled: boolean) {
  await requireAdmin("setPostEnabled", [postId, enabled]);
  if (!UUID.test(postId) || typeof enabled !== "boolean") throw new Error("Invalid request");
  const { error } = await serviceClient().from("tsocial_posts").update({ enabled }).eq("id", postId);
  if (error) throw new Error("Could not save");
  revalidatePath("/tsocial");
}
