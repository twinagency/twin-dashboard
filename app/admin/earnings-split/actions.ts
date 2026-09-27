"use server";

import { getDashboardAccess } from "@/lib/dashboard-access";
import { listCuts, setCut, invalidateCutCache } from "@/lib/platform-cut";
import { revalidatePath } from "next/cache";

export async function saveCut(target: { agencyId?: string; cloneId?: string }, pct: number | null, by: string) {
  const access = await getDashboardAccess();

  // Admin-only action
  if (access !== null) {
    throw new Error("Admin access required");
  }

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
