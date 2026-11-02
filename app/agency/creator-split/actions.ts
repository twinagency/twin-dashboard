"use server";

import { getDashboardAccess } from "@/lib/dashboard-access";
import { guardDashboardAction } from "@/lib/agency-management";
import { agencyIdentity, type AgencyIdentity } from "@/lib/agency-identity";
import { agencyCanManage } from "@/lib/agency-management-policy";
import { setAgencyCreatorCut, invalidateCutCache } from "@/lib/platform-cut";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

export async function saveAgencyCreatorCut(cloneId: string, pct: number | null) {
  await guardDashboardAction("app/agency/creator-split/actions.ts#saveAgencyCreatorCut", [cloneId, pct]);
  const access = await getDashboardAccess();

  // Agency-only action with canManage
  if (!access || !("id" in access) || !("cloneIds" in access)) {
    throw new Error("Agency access required");
  }

  const agency = access as AgencyIdentity;

  // Verify the agency can manage
  if (!agencyCanManage(agency)) {
    throw new Error("Management access required");
  }

  // Verify the clone belongs to this agency
  if (!agency.cloneIds.includes(cloneId)) {
    throw new Error("Creator access denied");
  }

  // Check if we're viewing as another agency (blocked)
  const jar = await cookies();
  if (jar.has("twin_admin_view_as")) {
    throw new Error("Cannot modify while viewing as another agency");
  }

  // Validate percentage: must be null (clear) or between 0 and 80
  if (pct !== null && (typeof pct !== "number" || pct < 0 || pct > 80)) {
    throw new Error("Percentage must be between 0 and 80, or empty to clear");
  }

  try {
    await setAgencyCreatorCut(agency.id, cloneId, pct, "manual");
    invalidateCutCache();
    revalidatePath("/agency/creator-split");
  } catch (error) {
    console.error("Error saving agency creator cut:", error);
    throw error;
  }
}
