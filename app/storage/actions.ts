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

  const {error}=await supabaseAdmin.rpc("link_creator_platform_profile",{p_account_id:creatorAccountId,p_clone_id:cloneId||null});
  if(error)throw new Error(error.message);

  revalidatePath("/storage");
}
