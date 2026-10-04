import { INVITE_CODE_PATTERN, hashInviteCode } from "./creator-invite-codes";
import { invitationStatus, type CreatorInvitationStatus } from "./creator-invitation-state";
import { serviceClient } from "./supabase-service";

export type InviteAgency = { name: string; slug: string; logo: string | null; icon: string | null; dark: boolean };

// Trusted public Moxy host/path fallback. This object never assigns an agency
// or authorizes an account; current server-owned records still decide access.
export const MOXY_CREATOR_PRESENTATION: InviteAgency = {
  name: "Moxy", slug: "moxy", logo: "/moxy/logo.png", icon: "/moxy/icon.svg", dark: true,
};

// Slugs with a brand asset in public/. An agency without one is presented by
// name rather than a broken image, so a new agency needs no code change.
const INVITE_LOGOS: Record<string, string> = { moxy: "/moxy/logo.png" };
// The browser tab / chat-app link preview icon. Separate from the page logo:
// this is what generateMetadata puts in the page's own <link rel="icon">, so
// an agency invite carries its own favicon instead of Twin's.
const INVITE_ICONS: Record<string, string> = { moxy: "/moxy/icon.svg" };
// Agencies whose own brand is dark/monochrome (see docs/moxy-portal.md), so the
// invite page matches their actual sign-in screen instead of Twin's light blue
// layout with only the logo swapped in. Anything not listed stays light.
const INVITE_DARK = new Set(["moxy"]);

/**
 * The agency behind an invite code, for presentation only. Resolving this never
 * grants anything: /creator-auth/signup re-validates and claims the code, and
 * the assignment is written there from the code's own row.
 */
export type CreatorInvitation = { status: CreatorInvitationStatus; agency: InviteAgency | null };
function presentation(agency: { name: string; slug: string }): InviteAgency {
  return { name: agency.name, slug: agency.slug, logo: INVITE_LOGOS[agency.slug] ?? null, icon: INVITE_ICONS[agency.slug] ?? null, dark: INVITE_DARK.has(agency.slug) };
}
export async function lookupCreatorInvitation(code: string | undefined): Promise<CreatorInvitation> {
  const candidate = (code ?? "").trim().toUpperCase();
  if (!candidate) return { status: "required", agency: null };
  if (!INVITE_CODE_PATTERN.test(candidate)) return { status: "invalid", agency: null };
  try {
    const row = await serviceClient().from("creator_agency_codes")
      .select("active,max_uses,uses,expires_at,partner_agencies(name,slug,active)")
      .eq("code_hash", hashInviteCode(candidate)).maybeSingle();
    const agency = row.data?.partner_agencies as unknown as { name: string; slug: string; active: boolean } | null;
    return { status: invitationStatus(row.data, !!agency?.active, !!row.error), agency: agency ? presentation(agency) : null };
  } catch { return { status: "unavailable", agency: null }; }
}
// Existing callers that need only a usable invitation retain their original contract.
export async function agencyForInviteCode(code: string | undefined): Promise<InviteAgency | null> {
  const invitation = await lookupCreatorInvitation(code);
  return invitation.status === "valid" ? invitation.agency : null;
}

/**
 * The same presentation lookup as {@link agencyForInviteCode}, keyed by the
 * agency's own slug instead of a one-time invite code. For a dedicated,
 * always-on branded entry point (e.g. a login page at that agency's own
 * path), not a link that expires or gets claimed.
 */
export async function agencyForSlug(slug: string): Promise<InviteAgency | null> {
  try {
    const db = serviceClient();
    const row = await db.from("partner_agencies").select("name,slug,active").eq("slug", slug).eq("active", true).maybeSingle();
    if (row.error || !row.data) return null;
    return { name: row.data.name, slug: row.data.slug, logo: INVITE_LOGOS[row.data.slug] ?? null, icon: INVITE_ICONS[row.data.slug] ?? null, dark: INVITE_DARK.has(row.data.slug) };
  } catch {
    return null;
  }
}
