import { INVITE_CODE_PATTERN, hashInviteCode } from "./creator-invite-codes";
import { serviceClient } from "./supabase-service";

export type InviteAgency = { name: string; slug: string; logo: string | null };

// Slugs with a brand asset in public/. An agency without one is presented by
// name rather than a broken image, so a new agency needs no code change.
const INVITE_LOGOS: Record<string, string> = { moxy: "/moxy/logo.png" };

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
    return { name: agency.name, slug: agency.slug, logo: INVITE_LOGOS[agency.slug] ?? null };
  } catch {
    return null;
  }
}
