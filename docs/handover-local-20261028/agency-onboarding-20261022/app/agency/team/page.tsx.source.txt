import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { agencyTeamOwner, TEAM_TOKEN } from "@/lib/agency-team";
import { serviceClient } from "@/lib/supabase-service";
import { dashboardOrigin } from "@/lib/form-origin";
import { agencyCanManage } from "@/lib/agency-management-policy";
import AgencyTeamForm, {type TeamMember} from "@/components/AgencyTeamForm";
import CopyField from "../creator-invites/CopyField";
export const dynamic="force-dynamic";
export default async function AgencyTeam({searchParams}:{searchParams:Promise<{result?:string;created?:string}>}) {
  const owner=await agencyTeamOwner(); if (!owner) redirect("/agency/setup");
  const db=serviceClient();
  const [members,owners,invites,creators]=await Promise.all([
    db.from("agency_memberships").select("user_id,email,active,can_manage,creator_scope,creator_ids,creator_access_revision").eq("agency_id",owner.id).order("email").limit(101),
    db.from("agency_team_owners").select("user_id").eq("agency_id",owner.id),
    db.from("agency_team_invites").select("id,email,expires_at,accepted_at,revoked_at").eq("agency_id",owner.id).order("created_at",{ascending:false}).limit(101),
    owner.cloneIds.length ? db.from("clones").select("id,name").in("id",owner.cloneIds).order("name") : Promise.resolve({data:[],error:null}),
  ]);
  if (members.error||owners.error||invites.error||creators.error) throw Error("Team access is temporarily unavailable");
  const {result,created}=await searchParams;
  const origin=dashboardOrigin({url:"https://dashboard.tgaiclone.xyz",headers:await headers()});
  const managementAvailable=agencyCanManage({...owner,canManage:true}), fixedManagement=agencyCanManage({...owner,canManage:false});
  const ownerIds=new Set((owners.data??[]).map(o=>o.user_id));
  return <main data-agency-team-page className="dashboard-page space-y-6"><header className="twin-media-heading"><div><h1>Team & access</h1><p>{owner.name} · Give each teammate their own access.</p></div><Link className="twin-outline-link" href="/agency/setup">Agency setup</Link></header>
    {result && <p role="status" className="twin-surface p-4">{result==="created" ? "Invitation created. Copy the link and share it with the invited teammate. No email has been sent." : result==="updated" ? "Team access updated." : "This change could not be saved. Refresh and check the current access before retrying."}</p>}
    {created && TEAM_TOKEN.test(created) && <section className="twin-surface p-5"><h2 className="font-semibold">Share this invitation</h2><CopyField label="Invitation link" value={`${origin}/agency/join?code=${created}`} mono="link"/><p className="twin-help">Expires in 7 days. Only the invited email can accept. Copy it now; the link cannot be recovered.</p></section>}
    <div className="twin-team-layout"><section className="space-y-3"><h2 className="font-semibold">Your team</h2>{(members.data as TeamMember[]).slice(0,100).map(m=><details key={m.user_id} className="twin-surface p-5"><summary className="cursor-pointer"><strong>{m.email}</strong><span className="ml-3 text-sm text-muted">{ownerIds.has(m.user_id)?"Agency owner":!m.active?"Removed":fixedManagement||m.can_manage&&managementAvailable?"Manager":"Read-only"} · {m.creator_scope==="all"?"All creators":`${m.creator_ids.length} selected`}</span></summary><div className="mt-4">{ownerIds.has(m.user_id)?<p className="twin-help">Twin admin manages owner delegation. Agency owners cannot remove themselves or change another owner's access.</p>:<AgencyTeamForm member={m} creators={creators.data??[]} managementAvailable={managementAvailable} fixedManagement={fixedManagement}/>}</div></details>)}{(members.data?.length??0)>100&&<p>Showing the first 100 members.</p>}</section><section className="twin-surface p-5"><h2 className="mb-4 font-semibold">Invite a teammate</h2><AgencyTeamForm creators={creators.data??[]} managementAvailable={managementAvailable} fixedManagement={fixedManagement}/></section></div>
    <section className="twin-surface p-5"><h2 className="mb-4 font-semibold">Invitations</h2>{!invites.data?.length&&<p className="text-muted">No invitations yet.</p>}{invites.data?.slice(0,100).map(i=><div key={i.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-3"><div><strong>{i.email}</strong><p className="text-sm text-muted">{i.accepted_at?"Accepted":i.revoked_at?"Revoked":Date.parse(i.expires_at)<=Date.now()?"Expired":`Pending · expires ${i.expires_at.slice(0,10)}`}</p></div>{!i.accepted_at&&!i.revoked_at&&<form action="/agency/team/manage" method="post"><input type="hidden" name="id" value={i.id}/><button name="operation" value="revoke-invite" className="twin-outline-link">Revoke invitation</button></form>}</div>)}{(invites.data?.length??0)>100&&<p>Showing the latest 100 invitations.</p>}</section>
  </main>;
}
