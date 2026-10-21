import { hasInternalAdminAccess } from "@/lib/internal-admin";
import { agencyCanManage } from "@/lib/agency-management-policy";
import { redirect } from "next/navigation";
import { serviceClient } from "@/lib/supabase-service";
import TwinTeamAccess from "@/components/TwinTeamAccess";
export const dynamic = "force-dynamic";
type Member = {user_id:string;email:string;active:boolean;can_manage:boolean;creator_scope:"all"|"selected";creator_ids:string[];creator_access_revision:string};
export default async function AgencyAdmin({ searchParams }: { searchParams: Promise<{ result?: string; agency?: string }> }) {
  if (!await hasInternalAdminAccess()) redirect("/login");
  const { result, agency: selectedAgency } = await searchParams;
  const db = serviceClient();
  const agencies = await db.from("partner_agencies").select("id,name,slug").eq("active",true).order("name");
  if (agencies.error) throw new Error("Agency access is not configured yet");
  const selected = agencies.data.find(a => a.id === selectedAgency || a.slug === selectedAgency) ?? agencies.data[0];
  const members = selected ? await db.from("agency_memberships").select("user_id,email,active,can_manage,creator_scope,creator_ids,creator_access_revision").eq("agency_id",selected.id).order("email").limit(101) : {data:[],error:null};
  const assignments = selected ? await db.from("agency_creators").select("clone_id").eq("agency_id",selected.id).limit(1001) : {data:[],error:null};
  const ids = (assignments.data ?? []).map(row => row.clone_id);
  const creators = ids.length && !assignments.error && ids.length <= 1000 ? await db.from("clones").select("id,name").in("id",ids).order("name") : {data:[],error:null};
  const fixedManagement = selected ? agencyCanManage({id:selected.id,canManage:false}) : false;
  const managementAvailable = selected ? agencyCanManage({id:selected.id,canManage:true}) : false;
  const status = result === "created" ? "Team login created. Share the login URL and chosen password securely."
    : result === "revoked" ? "Access revoked. Existing sessions are denied on their next membership check."
    : result === "updated" ? "Team access updated."
    : result === "conflict" ? "This membership changed or is unavailable. Review its current details before retrying."
    : result ? "Unable to complete that request. Check the account details." : null;
  if (selected) return <TwinTeamAccess key={selected.id} agencies={agencies.data} agency={selected} members={members.error ? [] : (members.data as Member[]).slice(0,100)} creators={creators.data ?? []} creatorsUnavailable={!!assignments.error || !!creators.error || ids.length > 1000} error={!!members.error} status={status} fixedManagement={fixedManagement} managementAvailable={managementAvailable} truncated={(members.data?.length ?? 0)>100} />;
  return <main className="dashboard-page"><h1>Team & access</h1><p>No active agencies are configured.</p></main>;
}
