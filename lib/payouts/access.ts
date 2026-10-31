import { cookies } from "next/headers";
import { isAuthed } from "../auth";
import { getDashboardAccess } from "../dashboard-access";
import { getCreatorWorkspace } from "../creator-dashboard";
import { agencyCanManage } from "../agency-management-policy";
import { isPartnerPreview } from "../agency-policy";
import { activeViewAs } from "../view-as";
import { serviceClient } from "../supabase-service";
import { getViewerTermsFor } from "../platform-cut";
import type { AgencyIdentity } from "../agency-identity";
import { PayoutError, payoutBrand, type PayoutSnapshot } from "./model";

export type PayoutViewer = { audience: "admin" | "creator"; cloneIds: string[] | null; canManage: boolean; actor: string; brand: PayoutSnapshot["brand"]; access?: AgencyIdentity | null; dataScope?: string; creatorAccountId?: string };
export async function requirePayoutViewer(): Promise<PayoutViewer> {
  const creator = await getCreatorWorkspace();
  if (creator) return { audience: "creator", cloneIds: creator.cloneIds, creatorAccountId: creator.accountId, canManage: false, actor: `creator:${creator.accountId}`, brand: payoutBrand(creator.name), access: creator, dataScope: "default" };
  const access = await getDashboardAccess();
  const viewAs = await activeViewAs(await cookies());
  if (access) {
    if (isPartnerPreview(access.name)) throw new PayoutError("Payout access is not available to preview accounts.", 403);
    return { audience: "admin", cloneIds: access.cloneIds, canManage: agencyCanManage(access) && !viewAs, actor: `agency:${access.id}:${access.userId || "view"}`, brand: payoutBrand(access.name), access, dataScope: "default" };
  }
  if (!await isAuthed()) throw new PayoutError("Please sign in to view payouts.", 401);
  return { audience: "admin", cloneIds: null, canManage: !viewAs, actor: "internal-admin", brand: payoutBrand(process.env.DASHBOARD_BRAND) };
}

export function payoutClient(_viewer: PayoutViewer) { return serviceClient(); }
export async function payoutTerms(cloneId: string, _viewer: PayoutViewer) {
  return getViewerTermsFor({ id: `payout:${cloneId}`, name: "Creator", cloneIds: [cloneId], kind: "creator" } as Parameters<typeof getViewerTermsFor>[0]);
}
