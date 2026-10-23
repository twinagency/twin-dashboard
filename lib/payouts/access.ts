import { isAuthed } from "../auth";
import { getDashboardAccess } from "../dashboard-access";
import { getCreatorWorkspace } from "../creator-dashboard";
import { agencyCanManage } from "../agency-management-policy";
import { serviceClientForAccess } from "../supabase-service";
import type { AgencyIdentity } from "../agency-identity";
import { STAR_USD } from "../money";
import { PayoutError, payoutBrand, type PayoutSnapshot } from "./model";
export type PayoutViewer = { audience: "admin" | "creator"; cloneIds: string[] | null; canManage: boolean; actor: string; brand: PayoutSnapshot["brand"]; access?: AgencyIdentity | null; dataScope?: string };
export async function requirePayoutViewer(): Promise<PayoutViewer> {
  const creator = await getCreatorWorkspace();
  if (creator) return { audience: "creator", cloneIds: creator.cloneIds, canManage: false, actor: `creator:${creator.accountId}`, brand: payoutBrand(creator.name), access: creator, dataScope: creator.dataSource || "local" };
  const access = await getDashboardAccess();
  if (access) {
    return { audience: "admin", cloneIds: access.cloneIds, canManage: agencyCanManage(access), actor: `agency:${access.id}`, brand: "flirt", access, dataScope: access.dataSource || "local" };
  }
  if (!await isAuthed()) throw new PayoutError("Please sign in to view payouts.", 401);
  return { audience: "admin", cloneIds: null, canManage: true, actor: "internal-admin", brand: "flirt", access: null, dataScope: "local" };
}
export function payoutClient(viewer: PayoutViewer) {
  // Retain Flirt's existing verified local / live creator routing. No new
  // cross-database connection or creator access is granted by this feature.
  return serviceClientForAccess(viewer.access || null);
}
export async function payoutTerms(_cloneId: string, _viewer: PayoutViewer) {
  // Flirt's current earnings dashboard uses this canonical Star rate.
  return { starMult: 1, usdPerStar: STAR_USD };
}
