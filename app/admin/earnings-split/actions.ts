"use server";

import { getDashboardAccess } from "@/lib/dashboard-access";
import { guardDashboardAction } from "@/lib/agency-management";
import { isAuthed } from "@/lib/auth";
import { listCuts, setCut, invalidateCutCache } from "@/lib/platform-cut";
import { revalidatePath, revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/query-cache";

export async function saveCut(target: { agencyId?: string; cloneId?: string }, pct: number | null, _by?: string, usdPerStar: number | null = null) {
  await guardDashboardAction("app/admin/earnings-split/actions.ts#saveCut", [target, pct, _by, usdPerStar]);
  const access = await getDashboardAccess();

  // Admin-only action: a null access alone also matches a signed-out caller, so require the admin session too.
  if (access !== null || !(await isAuthed())) {
    throw new Error("Admin access required");
  }
  // Never trust a client-supplied author label.
  const by = "master-admin";

  // Validate percentage: must be null (clear) or between 0 and 60
  if (pct !== null && (typeof pct !== "number" || pct < 0 || pct > 60)) {
    throw new Error("Percentage must be between 0 and 60, or empty to clear");
  }

  // null = default 0.013; otherwise 0.001 to 0.090. setCut validates again.
  if (usdPerStar !== null && (typeof usdPerStar !== "number" || !Number.isFinite(usdPerStar) || usdPerStar < 0.001 || usdPerStar > 0.09)) {
    throw new Error("Dollars per star must be between 0.001 and 0.090, or empty for the default");
  }

  try {
    await setCut(target, pct, by, usdPerStar);
    invalidateCutCache();
    // Cached revenue is per-viewer NET; drop it so the change shows instantly.
    revalidateTag(CACHE_TAGS.revenue);
    revalidatePath("/admin/earnings-split");
  } catch (error) {
    console.error("Error saving cut:", error);
    throw error;
  }
}
