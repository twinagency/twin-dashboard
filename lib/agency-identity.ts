import { enabled as liveTwinEnabled, identity as liveTwinIdentity, TOP_ONLYFANS_AGENCY_ID } from "../deployment/flirt-live-twin.cjs";
import { serviceClient, serviceClientForAccess } from "./supabase-service";

export type AgencyIdentity = { id: string; name: string; cloneIds: string[]; dataSource?: "twin-live" };
export async function agencyIdentity(token: string | undefined): Promise<AgencyIdentity | null> {
  if (!token) return null;
  const db = serviceClient();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  const member = await db.from("agency_memberships").select("agency_id")
    .eq("user_id", data.user.id).eq("active", true).maybeSingle();
  if (member.error || !member.data) return null;
  const [agency, assigned] = await Promise.all([
    db.from("partner_agencies").select("id,name").eq("id", member.data.agency_id).eq("active", true).maybeSingle(),
    db.from("agency_creators").select("clone_id").eq("agency_id", member.data.agency_id),
  ]);
  if (agency.error || !agency.data || assigned.error) return null;
  if (agency.data.id === TOP_ONLYFANS_AGENCY_ID) {
    if (!liveTwinEnabled()) return null;
    const twin = serviceClientForAccess(liveTwinIdentity());
    const [partner, assignments] = await Promise.all([
      twin.from("partner_agencies").select("id").eq("id", agency.data.id).eq("active", true).maybeSingle(),
      twin.from("agency_creators").select("clone_id").eq("agency_id", agency.data.id).order("clone_id"),
    ]);
    if (partner.error || !partner.data || assignments.error) return null;
    const cloneIds = (assignments.data ?? []).map(row => String(row.clone_id));
    if (cloneIds.some(id => !/^[0-9a-f-]{36}$/i.test(id))) return null;
    return { id: agency.data.id, name: agency.data.name, cloneIds, dataSource: "twin-live" };
  }
  const cloneIds = (assigned.data ?? []).map(row => String(row.clone_id)).sort();
  if (cloneIds.some(id => !/^[0-9a-f-]{36}$/i.test(id))) return null;
  return { id: agency.data.id, name: agency.data.name, cloneIds };
}
