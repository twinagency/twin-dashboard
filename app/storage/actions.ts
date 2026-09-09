"use server";

import { revalidatePath } from "next/cache";
import { guardDashboardAction } from "@/lib/agency-management";
import { supabaseAdmin } from "@/lib/supabase";

function value(fd: FormData, key: string) {
  const raw = fd.get(key);
  return raw == null ? "" : String(raw).trim();
}

export async function linkCreatorToClone(fd: FormData) {
  await guardDashboardAction("app/storage/actions.ts#linkCreatorToClone", [fd]);

  const creatorAccountId = value(fd, "creator_account_id");
  const cloneId = value(fd, "clone_id");

  if (!creatorAccountId) throw new Error("Creator account is required.");

  if (!cloneId) {
    const { error } = await supabaseAdmin
      .from("creator_clone_links")
      .delete()
      .eq("creator_account_id", creatorAccountId);
    if (error) throw new Error(error.message);
    revalidatePath("/storage");
    return;
  }

  const { data: clone, error: cloneError } = await supabaseAdmin
    .from("clones")
    .select("id,slug")
    .eq("id", cloneId)
    .maybeSingle();
  if (cloneError) throw new Error(cloneError.message);
  if (!clone) throw new Error("Clone not found.");

  // A clone belongs to one creator account. If it was linked elsewhere,
  // detach that stale legacy mapping before assigning it here.
  const { error: detachError } = await supabaseAdmin
    .from("creator_clone_links")
    .delete()
    .eq("clone_id", cloneId)
    .neq("creator_account_id", creatorAccountId);
  if (detachError) throw new Error(detachError.message);

  const { error } = await supabaseAdmin.from("creator_clone_links").upsert(
    {
      creator_account_id: creatorAccountId,
      clone_id: cloneId,
      twin_slug: clone.slug,
      linked_at: new Date().toISOString(),
    },
    { onConflict: "creator_account_id" },
  );
  if (error) throw new Error(error.message);

  revalidatePath("/storage");
}
