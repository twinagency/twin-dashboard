import { INVITE_CODE_PATTERN, hashInviteCode } from "./creator-invite-codes";
import { serviceClient } from "./supabase-service";

export type InviteAgency = { name: string; slug: string; logo: string | null; icon: string | null; dark: boolean };

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
export async function agencyForInviteCode(code: string | undefined): Promise<InviteAgency | null> {
  const candidate = (code ?? "").trim().toUpperCase();
  if (!INVITE_CODE_PATTERN.test(candidate)) return null;
  try {
    const db = serviceClient();
    const row = await db
      .from("creator_agency_codes")
      .select("active,max_uses,uses,expires_at,partner_agencies(name,slug,active)")
      .eq("code_hash", hashInviteCode(candidate))
      .maybeSingle();
    if (row.error || !row.data) return null;
    const agency = row.data.partner_agencies as unknown as { name: string; slug: string; active: boolean } | null;
    const expired = !!row.data.expires_at && Date.parse(row.data.expires_at as string) <= Date.now();
    const exhausted = row.data.max_uses != null && (row.data.uses as number) >= (row.data.max_uses as number);
    if (!row.data.active || expired || exhausted || !agency?.active) return null;
    return { name: agency.name, slug: agency.slug, logo: INVITE_LOGOS[agency.slug] ?? null, icon: INVITE_ICONS[agency.slug] ?? null, dark: INVITE_DARK.has(agency.slug) };
  } catch {
    return null;
  }
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
