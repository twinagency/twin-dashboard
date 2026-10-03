import { isMoxy } from "./agency-brand";
import type { CreatorDashboardIdentity } from "./creator-dashboard-identity";

const MOXY_AGENCY_ID = "bc670215-110b-4ea0-8f5c-af3dfe21d253";
/** Moxy intake is optional; completed intake must not lock future content. */
export function creatorUploadsEditable(
  status: string | null | undefined,
  creator: Pick<CreatorDashboardIdentity, "name" | "agencyId" | "readOnly">,
): boolean {
  if (creator.readOnly) return false;
  if (!status || status === "draft") return true;
  return creator.agencyId === MOXY_AGENCY_ID && isMoxy(creator.name)
    && ["submitted", "reviewing", "approved"].includes(status);
}
