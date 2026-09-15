import CrmTeamDirectory, { type CrmTeamMember } from "@/components/crm/CrmTeamDirectory";
import { agencyCanManage } from "@/lib/agency-management-policy";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { serviceClient } from "@/lib/supabase-service";
import { supabaseAdmin } from "@/lib/supabase";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type MembershipRow = {
  agency_id: string;
  user_id: string;
  email: string | null;
  active: boolean;
};

type AgencyRow = { id: string; name: string; active: boolean };
type CreatorAccessRow = { agency_id: string; clone_id: string };

export default async function CrmTeamPage() {
  const access = await getDashboardAccess();
  if (access && !agencyCanManage(access)) redirect("/revenue");
  // Agency memberships are deliberately excluded from the normal agency data
  // proxy. Management-capable agencies therefore use an explicitly scoped
  // service query; internal administrators retain the existing admin client.
  const db = access ? serviceClient() : supabaseAdmin;

  let membershipsQuery = db
    .from("agency_memberships")
    .select("agency_id,user_id,email,active")
    .order("email", { ascending: true });
  let agenciesQuery = db
    .from("partner_agencies")
    .select("id,name,active")
    .order("name", { ascending: true });
  let creatorAccessQuery = db
    .from("agency_creators")
    .select("agency_id,clone_id");

  if (access) {
    membershipsQuery = membershipsQuery.eq("agency_id", access.id);
    agenciesQuery = agenciesQuery.eq("id", access.id);
    creatorAccessQuery = creatorAccessQuery.eq("agency_id", access.id);
  }

  const [membershipsResult, agenciesResult, creatorAccessResult] = await Promise.all([
    membershipsQuery,
    agenciesQuery,
    creatorAccessQuery,
  ]);

  const membershipRows = (membershipsResult.data ?? []) as MembershipRow[];
  const agencyRows = (agenciesResult.data ?? []) as AgencyRow[];
  const creatorAccessRows = (creatorAccessResult.data ?? []) as CreatorAccessRow[];
  const agencyNames = new Map(agencyRows.map((agency) => [agency.id, agency.name]));
  if (access) agencyNames.set(access.id, access.name);

  const creatorScopes = new Map<string, Set<string>>();
  for (const assignment of creatorAccessRows) {
    const ids = creatorScopes.get(assignment.agency_id) ?? new Set<string>();
    ids.add(assignment.clone_id);
    creatorScopes.set(assignment.agency_id, ids);
  }

  const creatorScopeUnavailable = Boolean(creatorAccessResult.error);
  const members: CrmTeamMember[] = membershipRows
    .map((membership) => ({
      agencyId: membership.agency_id,
      agencyName: agencyNames.get(membership.agency_id) || "Agency unavailable",
      email: membership.email,
      userId: membership.user_id,
      active: membership.active,
      creatorAccessCount: creatorScopeUnavailable ? null : (creatorScopes.get(membership.agency_id)?.size ?? 0),
    }))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.agencyName.localeCompare(b.agencyName) || (a.email || "").localeCompare(b.email || ""));

  const issues = [
    membershipsResult.error ? "Membership records could not be loaded." : null,
    agenciesResult.error ? "Some agency names are unavailable." : null,
    creatorAccessResult.error ? "Creator access counts are unavailable." : null,
  ].filter(Boolean);

  return (
    <CrmTeamDirectory
      members={members}
      scopeLabel={access?.name || "all agencies"}
      loadError={issues.length ? issues.join(" ") : undefined}
      canAdministerAccess={!access}
    />
  );
}
