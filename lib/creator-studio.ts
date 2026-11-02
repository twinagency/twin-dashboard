import { cache } from "react";
import { supabaseAdmin } from "./supabase";
import { requireCloneAccess } from "./dashboard-access";
import { creatorStudioStatus } from "./creator-studio-model";

/** Called inside the existing verified creator access context. No credentials or intake are selected. */
export const getCreatorStudioStatus = cache(async (cloneId: string | null, applicationLabel: string) => {
  if (!cloneId) return creatorStudioStatus(false, applicationLabel);
  await requireCloneAccess(cloneId);
  try {
    const { data, error } = await supabaseAdmin.from("clones").select("id,status").eq("id", cloneId).maybeSingle();
    return creatorStudioStatus(true, applicationLabel, error ? null : data?.status);
  } catch {
    // A status-read outage must neither crash Home nor claim the AI is active.
    return creatorStudioStatus(true, applicationLabel, null);
  }
});
