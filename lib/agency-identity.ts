import { serviceClient } from "./supabase-service";
import { staffCreatorIds } from "./staff-creator-scope";
export type AgencyIdentity = { id: string; name: string; cloneIds: string[]; canManage?: boolean; userId?: string; creatorScope?: "all" | "selected" };
export async function agencyIdentity(token: string | undefined): Promise<AgencyIdentity | null> {
  if (!token) return null;
  const db = serviceClient();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  const member = await db.from("agency_memberships").select("agency_id,can_manage,creator_scope,creator_ids,creator_access_revision")
    .eq("user_id", data.user.id).eq("active", true).maybeSingle();
  if (member.error || !member.data) return null;
  const identity = await agencyIdentityById(member.data.agency_id);
  // This permission is server-owned membership data. Never copy it from Auth
  // metadata, a browser cookie, branding, or a submitted form field.
  const cloneIds = identity ? staffCreatorIds(identity.cloneIds, member.data) : null;
  return identity && cloneIds ? { ...identity, cloneIds, ...(member.data.creator_scope === "selected" ? { creatorScope: "selected" as const } : {}), userId: data.user.id, canManage: member.data.can_manage === true } : null;
}

// Builds the SAME identity shape a real login produces, but keyed directly by
// agency id instead of a Supabase Auth token. There is no session to verify
// here: the ONLY caller is lib/view-as.ts's activeViewAs(), which has already
// re-verified a live master-admin session before it will look up this id, so
// this function must never be reachable from anything that accepts a token,
// header or cookie value from an untrusted caller directly.
export async function agencyIdentityById(agencyId: string): Promise<AgencyIdentity | null> {
  const db = serviceClient();
  const [agency, assigned] = await Promise.all([
    db.from("partner_agencies").select("id,name").eq("id", agencyId).eq("active", true).maybeSingle(),
    db.from("agency_creators").select("clone_id").eq("agency_id", agencyId),
  ]);
  if (agency.error || !agency.data || assigned.error) return null;
  const cloneIds = (assigned.data ?? []).map(row => String(row.clone_id)).sort();
  if (cloneIds.some(id => !/^[0-9a-f-]{36}$/i.test(id))) return null;
  return { id: agency.data.id, name: agency.data.name, cloneIds };
}

