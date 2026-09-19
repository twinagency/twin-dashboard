import { TETHER_PORTAL } from "./partner-portals";

export const TETHER_CREATOR_SIGNUP_ACTION = "/creator-auth/tether/signup";
export const TETHER_CREATOR_SIGNUP_STATUS = "check_email";

// This is a Supabase publishable key, not a secret. Prefer an injected value
// so non-production environments can point at their own Supabase project.
export function creatorPublishableKey(): string {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error("FLIRT SUPABASE_PUBLISHABLE_KEY is required");
  return key;
}

export type TetherCreatorSignup = {
  displayName: string;
  email: string;
  password: string;
};

export function parseTetherCreatorSignup(form: FormData): TetherCreatorSignup | null {
  const displayName = String(form.get("display_name") || "").trim();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  if (!displayName || displayName.length > 120) return null;
  if (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) return null;
  if (password.length < 8 || password.length > 256) return null;
  return { displayName, email, password };
}

export function tetherCreatorAccountRow(input: TetherCreatorSignup, userId: string) {
  return {
    auth_user_id: userId,
    email: input.email,
    display_name: input.displayName,
    account_status: "applicant",
    // Provenance only: authorization never reads this value.
    source: "agency_invite",
  } as const;
}

export function tetherCreatorAssignmentRow(accountId: string, assignedAt: string) {
  return {
    creator_account_id: accountId,
    agency_id: TETHER_PORTAL.id,
    // The stable application URL is intentionally public, not a bearer invite.
    assignment_source: "direct",
    assigned_at: assignedAt,
  } as const;
}

