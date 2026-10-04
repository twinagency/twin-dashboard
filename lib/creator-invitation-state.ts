export type CreatorInvitationStatus = "required" | "valid" | "invalid" | "expired" | "exhausted" | "disabled" | "unavailable";
export const invitationMessages: Record<CreatorInvitationStatus, string> = {
  required: "A valid invitation is required. Enter the code from your invitation link.",
  valid: "Your invitation is ready.",
  invalid: "This invitation code was not recognized. Check the code or use a new invitation link.",
  expired: "This invitation has expired. Ask your agency for a new invitation.",
  exhausted: "This invitation has no places left. Ask your agency for a new invitation.",
  disabled: "This invitation is no longer active. Ask your agency for a new invitation.",
  unavailable: "We couldn't check this invitation right now. Please try again shortly. Your invitation has not been claimed.",
};
export function invitationStatus(row: { active: boolean; expires_at: string | null; max_uses: number | null; uses: number } | null, agencyActive: boolean, lookupFailed = false, now = Date.now()): CreatorInvitationStatus {
  if (lookupFailed) return "unavailable";
  if (!row) return "invalid";
  if (!row.active || !agencyActive) return "disabled";
  if (row.expires_at && Date.parse(row.expires_at) <= now) return "expired";
  if (row.max_uses != null && row.uses >= row.max_uses) return "exhausted";
  return "valid";
}
