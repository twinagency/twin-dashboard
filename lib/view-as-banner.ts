// Server-component-only helper (next/headers), kept OUT of lib/view-as.ts so
// that module stays edge-safe for middleware.ts. Layout components call this
// to decide whether to render the red "viewing as" banner and to force
// read-only presentation regardless of the target's own canManage/role.
import { cookies } from "next/headers";
import { activeViewAs } from "./view-as";
import { agencyIdentityById } from "./agency-identity";
import { creatorDashboardIdentityById } from "./creator-dashboard-identity";

export type ViewAsBannerInfo = { name: string; kind: "agency" | "creator" };

export async function getViewAsBannerInfo(): Promise<ViewAsBannerInfo | null> {
  const jar = await cookies();
  const viewAs = await activeViewAs(jar);
  if (!viewAs) return null;
  if (viewAs.targetType === "agency") {
    const identity = await agencyIdentityById(viewAs.targetId);
    return identity ? { name: identity.name, kind: "agency" } : null;
  }
  const identity = await creatorDashboardIdentityById(viewAs.targetId);
  return identity ? { name: identity.creatorName, kind: "creator" } : null;
}
