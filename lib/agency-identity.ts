import { enabled as liveTwinEnabled, JOHNNY_COCO_CLONE_ID, TOP_ONLYFANS_AGENCY_ID } from "../deployment/flirt-live-twin.cjs";
import { serviceClient, serviceClientForAccess } from "./supabase-service";

const TOP_ONLYFANS_FLIRT_LOGIN = "tanner@toponlyfansagency.com";
const TOP_ONLYFANS_TWIN_LOGIN = "toponlyfanstwin@dashboard.tgaiclone.xyz";

export type AgencyIdentity = { id: string; name: string; cloneIds: string[]; dataSource?: "twin-live"; canManage?: boolean };
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
    const access: AgencyIdentity = {
      id: agency.data.id, name: agency.data.name,
      cloneIds: [JOHNNY_COCO_CLONE_ID], dataSource: "twin-live",
    };
    const twin = serviceClientForAccess(access);
    const managerLogin = data.user.email?.toLowerCase() === TOP_ONLYFANS_FLIRT_LOGIN;
    const [assignment, manager] = await Promise.all([
      twin.from("agency_creators").select("clone_id,partner_agencies!inner(active)")
        .eq("agency_id", access.id).eq("clone_id", JOHNNY_COCO_CLONE_ID)
        .eq("partner_agencies.active", true).maybeSingle(),
      managerLogin
        ? twin.from("agency_memberships").select("can_manage").eq("agency_id", access.id)
          .eq("email", TOP_ONLYFANS_TWIN_LOGIN).eq("active", true).maybeSingle()
        : Promise.resolve(null),
    ]);
    if (assignment.error || !assignment.data || manager?.error) return null;
    return { ...access, canManage: manager?.data?.can_manage === true };
  }
  const cloneIds = (assigned.data ?? []).map(row => String(row.clone_id)).sort();
  if (cloneIds.some(id => !/^[0-9a-f-]{36}$/i.test(id))) return null;
  return { id: agency.data.id, name: agency.data.name, cloneIds };
}
