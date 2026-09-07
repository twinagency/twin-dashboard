import { serviceClient } from "./supabase-service";
export type AgencyIdentity = { id: string; name: string; cloneIds: string[] };
export async function agencyIdentity(token: string | undefined): Promise<AgencyIdentity | null> {
  if (!token) return null;
  const db = serviceClient();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  const member = await db.from("agency_memberships").select("agency_id")
    .eq("user_id", data.user.id).eq("active", true).maybeSingle();
  if (member.error || !member.data) return null;
  const agency = await db.from("partner_agencies").select("id,name")
    .eq("id", member.data.agency_id).eq("active", true).maybeSingle();
  if (agency.error || !agency.data) return null;
  const assigned = await db.from("agency_creators").select("clone_id").eq("agency_id", agency.data.id);
  if (assigned.error) return null;
  const cloneIds = (assigned.data ?? []).map(row => String(row.clone_id)).sort();
  if (cloneIds.some(id => !/^[0-9a-f-]{36}$/i.test(id))) return null;
  return { id: agency.data.id, name: agency.data.name, cloneIds };
}
