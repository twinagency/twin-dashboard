import { creatorUploadsEditable } from "./creator-upload-policy";
import type { CreatorDashboardIdentity } from "./creator-dashboard-identity";

/** Optional Twin and Moxy intake remains editable after submission, like its uploads.
 * This never resets application status, approval, consent or submission time.
 * Other agencies keep their existing draft-only rules.
 */
export function creatorOnboardingEditable(
  status: string | null | undefined,
  creator: Pick<CreatorDashboardIdentity, "name" | "agencyId" | "readOnly">,
): boolean {
  return creatorUploadsEditable(status, creator);
}
