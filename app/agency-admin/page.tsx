import Link from "next/link";
import { PARTNER_PORTALS } from "@/lib/partner-portals";
import { hasInternalAdminAccess } from "@/lib/internal-admin";
import { agencyCanManage } from "@/lib/agency-management-policy";
import { redirect } from "next/navigation";
import { serviceClient } from "@/lib/supabase-service";
export const dynamic = "force-dynamic";
type Member = {user_id:string;email:string;active:boolean;can_manage:boolean};
const input = "mt-1 block w-full rounded-lg border border-line bg-card p-3";
const button = "rounded-lg border border-line px-3 py-2 text-sm font-semibold";
export default async function AgencyAdmin({ searchParams }: { searchParams: Promise<{ result?: string; agency?: string }> }) {
  if (!await hasInternalAdminAccess()) redirect("/login");
  const { result, agency: selectedAgency } = await searchParams;
  const db = serviceClient();
  const agencies = await db.from("partner_agencies").select("id,name,slug").eq("active",true).order("name");
  if (agencies.error) throw new Error("Agency access is not configured yet");
  const selected = agencies.data.find(a => a.id === selectedAgency || a.slug === selectedAgency) ?? agencies.data[0];
  const members = selected ? await db.from("agency_memberships").select("user_id,email,active,can_manage").eq("agency_id",selected.id).order("email").limit(101) : {data:[],error:null};
  const fixedManagement = selected ? agencyCanManage({id:selected.id,canManage:false}) : false;
  const managementAvailable = selected ? agencyCanManage({id:selected.id,canManage:true}) : false;
  const status = result === "created" ? "Team login created. Share the login URL and chosen password securely."
    : result === "revoked" ? "Access revoked. Existing sessions are denied on their next membership check."
    : result === "updated" ? "Team access updated."
    : result === "conflict" ? "This membership changed or is unavailable. Review its current details before retrying."
    : result ? "Unable to complete that request. Check the account details." : null;
  return <main className="dashboard-page max-w-3xl space-y-6" data-agency-team-admin>
    <header><h1 className="text-2xl font-semibold">Agency access</h1><p className="mt-2 text-sm text-muted">Manage individual team logins under your existing agency permissions.</p></header>
    {status ? <p role="status" className="rounded-xl border border-line bg-panel p-4">{status}</p> : null}
    <form method="get" className="flex flex-wrap items-end gap-3">
      <label className="min-w-0 flex-1 text-sm">Agency<select name="agency" defaultValue={selected?.id} className={input}>{agencies.data.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <button className={button}>View team</button>
    </form>
    {selected ? <>
      <section className="space-y-3 rounded-2xl border border-line bg-panel p-5">
        <h2 className="font-semibold">Add a team member</h2>
        <form action="/agency-admin/provision" method="post" className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="agency" value={selected.id}/>
          <label className="text-sm">Team member email<input name="email" type="email" required maxLength={254} autoComplete="off" className={input}/></label>
          <label className="text-sm">Initial password<input name="password" type="password" required minLength={16} maxLength={256} autoComplete="new-password" className={input}/></label>
          <label className="text-sm">Access<select name="access" className={input} defaultValue="read"><option value="read">{fixedManagement ? "Existing agency permissions" : "Read-only"}</option>{!fixedManagement && managementAvailable ? <option value="manage">Manage assigned creators</option> : null}</select></label>
          <div className="flex items-end"><button name="operation" value="create" className={button+" bg-accent text-white"}>Create team login</button></div>
        </form>
        <p className="text-xs text-muted">At least 16 characters. This creates a login without sending an email or changing creator assignments.</p>
      </section>
      <section className="space-y-3" aria-labelledby="agency-members-heading">
        <h2 id="agency-members-heading" className="font-semibold">{selected.name} team</h2>
        <p className="text-sm text-muted">Each active member can access this agency’s assigned creators. Creator access is shared across the agency. {fixedManagement ? "This agency retains its existing management policy." : "Read-only members cannot manage the CRM. Managers retain the existing account and takeover checks."}</p>
        {members.error ? <p role="status">The team list could not be loaded. Refresh before making changes.</p> : null}
        {!members.error && !members.data?.length ? <p className="text-sm text-muted">No team logins yet.</p> : null}
        {!members.error ? (members.data as Member[]).slice(0,100).map(member => <article key={member.user_id} className="min-w-0 space-y-3 rounded-xl border border-line bg-panel p-4" data-agency-member>
          <div className="flex flex-wrap justify-between gap-2"><strong className="break-all text-sm">{member.email}</strong><span className="text-sm text-muted">{member.active ? agencyCanManage({id:selected.id,canManage:member.can_manage}) ? "Manager" : "Read-only" : "Revoked"}</span></div>
          <form action="/agency-admin/provision" method="post" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="agency" value={selected.id}/><input type="hidden" name="email" value={member.email}/><input type="hidden" name="user_id" value={member.user_id}/>
            <input type="hidden" name="expected_active" value={String(member.active)}/><input type="hidden" name="expected_can_manage" value={String(member.can_manage)}/>
            <label className="min-w-0 text-xs">Access<select name="access" className={input} defaultValue={member.can_manage && !fixedManagement && managementAvailable ? "manage" : "read"}><option value="read">{fixedManagement ? "Existing agency permissions" : "Read-only"}</option>{!fixedManagement && managementAvailable ? <option value="manage">Manage assigned creators</option> : null}</select></label>
            <button name="operation" value={member.active ? "set-access" : "restore"} className={button}>{member.active ? "Save access" : "Restore access"}</button>
            {member.active ? <button name="operation" value="revoke" formAction="/agency-admin/provision" className={button+" text-crit"}>Revoke access</button> : null}
          </form>
        </article>) : null}
        {(members.data?.length ?? 0)>100 ? <p role="status" className="text-sm text-muted">Showing the first 100 members. The team list is incomplete.</p> : null}
      </section>
      <section className="space-y-2 rounded-xl border border-line bg-panel p-4"><h2 className="font-semibold">Creator assignments</h2><p className="text-sm text-muted">Use the existing creator management screen to review onboarding assignments and platform links. Granting team access does not assign another agency’s creators.</p><Link className="text-sm text-accent underline" href="/creator-management">Open creator management</Link></section>
    </> : <p>No active agencies are configured.</p>}
    <div className="space-y-2 text-sm">{agencies.data.filter(a => PARTNER_PORTALS.some(p => p.slug === a.slug)).map(a => <p key={a.id}>{a.name} sign-in: <Link className="text-accent underline" href={PARTNER_PORTALS.find(p => p.slug === a.slug)!.loginPath}>{PARTNER_PORTALS.find(p => p.slug === a.slug)!.loginPath}</Link></p>)}</div>
    <p className="text-sm"><Link href="/agency-admin/jess-kate-password" className="text-accent underline">Change Jess and Kate AI password</Link></p>
  </main>;
}
