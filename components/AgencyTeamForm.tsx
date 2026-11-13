"use client";
import { useState } from "react";
import { Info } from "@/components/clone/fields";
export type TeamMember = {user_id:string;email:string;active:boolean;can_manage:boolean;can_chat?:boolean;creator_scope:string;creator_ids:string[];creator_access_revision:string};
export default function AgencyTeamForm({member,creators,managementAvailable,fixedManagement}:{member?:TeamMember;creators:{id:string;name:string}[];managementAvailable:boolean;fixedManagement:boolean}) {
  const [scope,setScope]=useState(member?.creator_scope??"selected");
  // Owner updates edit active members only (20261113100200); a removed row has nothing an owner can save.
  if (member && !member.active) return <p className="inline-flex items-center gap-1">Access removed<Info text="Twin admin can restore access. Agency owners cannot restore a removed teammate."/></p>;
  return <form action="/agency/team/manage" method="post" className="twin-team-form space-y-4">
    {member ? <><input type="hidden" name="user_id" value={member.user_id}/><input type="hidden" name="revision" value={member.creator_access_revision}/></> : <label>Email<input type="email" name="email" required maxLength={254} autoComplete="off" placeholder="teammate@agency.com"/></label>}
    <label>Access<select name="access" defaultValue={member?.can_manage ? "manage":member?.can_chat ? "chat":"read"}><option value="chat">Chatter (assigned creators)</option><option value="read">{fixedManagement ? "Existing agency permissions":"Read-only"}</option>{managementAvailable && <option value="manage">Manager</option>}</select></label>
    {fixedManagement && <p className="twin-help">This agency retains its existing management permissions. Selecting read-only does not restrict those existing tools.</p>}
    <p className="twin-help">Chatters can take over, reply with prepared content and correct fan notes. Creator settings, connections, campaigns, reconciliation and team administration require management access.</p>
    <label>Creator access<select name="creator_scope" value={scope} onChange={e=>setScope(e.target.value)}><option value="selected">Selected creators</option><option value="all">All creators, including future additions</option></select></label>
    {scope==="selected" && <fieldset className="max-h-48 overflow-auto rounded-xl border border-line p-3"><legend>Assigned creators</legend>{creators.map(c=><label key={c.id} className="!flex items-center gap-2"><input type="checkbox" name="creator_ids" value={c.id} defaultChecked={member?.creator_ids.includes(c.id)} className="!m-0 !w-auto"/>{c.name}</label>)}{!creators.length && <p>No creators assigned yet.</p>}</fieldset>}
    <p className="twin-help">No selected creators means no creator access. Team administration is reserved for delegated agency owners.</p>
    <button name="operation" value={member ? "update":"invite"} className="twin-primary-link">{member ? "Save access" : "Create invitation"}</button>
    {member?.active && <span className="inline-flex items-center gap-1"><button name="operation" value="remove" className="twin-outline-link">Remove access</button><Info text="Removing is permanent for owners. Only Twin admin can restore access."/></span>}
  </form>;
}
