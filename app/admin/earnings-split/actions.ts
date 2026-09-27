"use server";

import { getDashboardAccess } from "@/lib/dashboard-access";
import { guardDashboardAction } from "@/lib/agency-management";
import { isAuthed } from "@/lib/auth";
import { listCuts, setCut, invalidateCutCache } from "@/lib/platform-cut";
import { revalidatePath } from "next/cache";

export async function saveCut(target: { agencyId?: string; cloneId?: string }, pct: number | null, _by?: string) {
  await guardDashboardAction("app/admin/earnings-split/actions.ts#saveCut", [target, pct, _by]);
  const access = await getDashboardAccess();

  // Admin-only action: a null access alone also matches a signed-out caller, so require the admin session too.
  if (access !== null || !(await isAuthed())) {
    throw new Error("Admin access required");
  }
  // Never trust a client-supplied author label.
  const by = "master-admin";

  // Validate percentage: must be null (clear) or between 2 and 60
  if (pct !== null && (typeof pct !== "number" || pct < 2 || pct > 60)) {
    throw new Error("Percentage must be between 2 and 60, or empty to clear");
  }

  try {
    await setCut(target, pct, by);
    invalidateCutCache();
    revalidatePath("/admin/earnings-split");
  } catch (error) {
    console.error("Error saving cut:", error);
    throw error;
  }
}
