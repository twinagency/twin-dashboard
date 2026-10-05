import { creatorIntakeOptional } from "./creator-intake-policy";
import type { CreatorDashboardIdentity } from "./creator-dashboard-identity";

/** Twin and Moxy intake remains editable after submission. */
export function creatorUploadsEditable(
  status: string | null | undefined,
  creator: Pick<CreatorDashboardIdentity, "name" | "agencyId" | "readOnly">,
): boolean {
  if (creator.readOnly) return false;
  if (!status || status === "draft") return true;
  return creatorIntakeOptional(creator) && ["submitted", "reviewing", "approved"].includes(status);
}
