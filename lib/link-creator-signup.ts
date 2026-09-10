import { LYNQ_PORTAL } from "./partner-portals";

export const LINK_CREATOR_SIGNUP_ACTION = "/creator-auth/link/signup";
export const LINK_CREATOR_SIGNUP_STATUS = "check_email";

// This is a Supabase publishable key, not a secret. Prefer an injected value
// so non-production environments can point at their own Supabase project.
export function linkCreatorPublishableKey(): string {
  return process.env.SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || "sb_publishable_GaunWyo_PKF82PDziCc9mQ_B9_3O16a";
}

export type LinkCreatorSignup = {
  displayName: string;
  email: string;
  password: string;
};

export function parseLinkCreatorSignup(form: FormData): LinkCreatorSignup | null {
  const displayName = String(form.get("display_name") || "").trim();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  if (!displayName || displayName.length > 120) return null;
  if (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) return null;
  if (password.length < 8 || password.length > 256) return null;
  return { displayName, email, password };
}

export function linkCreatorAccountRow(input: LinkCreatorSignup, userId: string) {
  return {
    auth_user_id: userId,
    email: input.email,
    display_name: input.displayName,
    account_status: "applicant",
    // Provenance only. Authorization never reads this value.
    source: "agency_invite",
  } as const;
}

export function linkCreatorAssignmentRow(accountId: string, assignedAt: string) {
  return {
    creator_account_id: accountId,
    // The route, not a browser-controlled field, owns this assignment.
    agency_id: LYNQ_PORTAL.id,
    assignment_source: "direct",
    assigned_at: assignedAt,
  } as const;
}
