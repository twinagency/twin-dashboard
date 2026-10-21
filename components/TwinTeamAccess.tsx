"use client";

import { useState } from "react";
import Link from "@/components/NavigationLink";
import { PARTNER_PORTALS } from "@/lib/partner-portals";
import type { StaffCreatorScope } from "@/lib/staff-creator-scope";

type Member = { user_id: string; email: string; active: boolean; can_manage: boolean } & Partial<StaffCreatorScope>;
type Agency = { id: string; name: string; slug: string };
export default function TwinTeamAccess({ agencies, agency, members, error, status, fixedManagement, managementAvailable, truncated, creators = [], creatorsUnavailable = false }: {
  agencies: Agency[]; agency: Agency; members: Member[]; error: boolean; status: string | null;
  fixedManagement: boolean; managementAvailable: boolean; truncated: boolean;
  creators?: { id: string; name: string }[]; creatorsUnavailable?: boolean;
}) {
  const [selectedId, setSelectedId] = useState(members[0]?.user_id ?? "");
  const [adding, setAdding] = useState(false);
  const selected = members.find(m => m.user_id === selectedId) ?? members[0];
  const role = (m: Member) => !m.active ? "Revoked" : fixedManagement || managementAvailable && m.can_manage ? "Manager" : "Read-only";
  const options = <><option value="read">{fixedManagement ? "Existing agency permissions" : "Read-only"}</option>{!fixedManagement && managementAvailable && <option value="manage">Manage assigned creators</option>}</>;
  return <main className="dashboard-page space-y-6" data-agency-team-admin>
    <header className="twin-media-heading"><div><h1>Team & access</h1><p>Manage individual logins and access for {agency.name}.</p></div><button className="twin-primary-link" type="button" onClick={() => setAdding(v => !v)}>{adding ? "View member access" : "+ Add team member"}</button></header>
    {status && <p role="status" className="twin-surface p-4">{status}</p>}
    <form method="get" className="twin-toolbar"><label className="text-sm">Agency <select name="agency" defaultValue={agency.id} className="ml-2 rounded-lg border border-line bg-white px-3 py-2">{agencies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><button className="twin-outline-link">View team</button></form>
    <div className="twin-team-layout">
      <section className="twin-surface" aria-label={`${agency.name} team`}>
        {error ? <p role="status" className="twin-empty">The team list could not be loaded. Refresh before making changes.</p> : <div className="twin-table-scroll"><table><thead><tr><th>Team member</th><th>Access</th><th>Status</th></tr></thead><tbody>{members.map(m => <tr key={m.user_id} data-agency-member data-selected={!adding && selected?.user_id === m.user_id || undefined}>
          <td><button type="button" className="twin-roster-identity" onClick={() => { setSelectedId(m.user_id); setAdding(false); }} aria-pressed={!adding && selected?.user_id === m.user_id}><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-elev font-semibold" aria-hidden="true">{m.email.slice(0, 2).toUpperCase()}</span><strong className="break-all">{m.email}</strong></button></td>
          <td>{role(m)}</td><td><span className="twin-status" data-tone={m.active ? "good" : "neutral"}>{m.active ? "Active" : "Revoked"}</span></td>
        </tr>)}</tbody></table>{!members.length && <p className="twin-empty">No team logins yet. Add your first team member.</p>}</div>}
        {truncated && <p role="status" className="p-4 text-sm text-muted">Showing the first 100 members. The team list is incomplete.</p>}
        <div className="border-t border-line p-5"><h2 className="font-semibold">Creator access</h2><p className="twin-help">Choose all agency creators or a selected list for each member. The same creator access applies across Telegram, OnlyFans, content and earnings. Custom permission toggles are not available.</p><Link className="mt-3 inline-block text-sm font-semibold text-accent" href="/creator-management">Review creator assignments →</Link></div>
      </section>
      <aside className="twin-surface twin-team-form">
        {adding || !selected ? <><h2>Add a team member</h2><form action="/agency-admin/provision" method="post">
          <input type="hidden" name="agency" value={agency.id} />
          <label>Team member email<input name="email" type="email" required maxLength={254} autoComplete="off" /></label>
          <label>Initial password<input name="password" type="password" required minLength={16} maxLength={256} autoComplete="new-password" /></label>
          <label>Access<select name="access" defaultValue="read">{options}</select></label>
          <button className="twin-primary-link" name="operation" value="create">Create team login</button>
          <p className="twin-help">Use at least 16 characters. This creates a read-only login without sending an email. New members initially see the agency's creators; select the member after creation to narrow their creator access.</p>
        </form></> : <><h2>Member access</h2><p className="break-all text-sm">{selected.email}</p>
          <form data-agency-member-form key={selected.user_id} action="/agency-admin/provision" method="post">
            <input type="hidden" name="agency" value={agency.id} /><input type="hidden" name="email" value={selected.email} /><input type="hidden" name="user_id" value={selected.user_id} />
            <input type="hidden" name="expected_active" value={String(selected.active)} /><input type="hidden" name="expected_can_manage" value={String(selected.can_manage)} />
            <label>Access<select name="access" defaultValue={selected.can_manage && !fixedManagement && managementAvailable ? "manage" : "read"}>{options}</select></label>
            <p className="twin-help">{fixedManagement ? "This agency retains its existing management policy." : "Read-only members can review assigned creators. Managers retain the existing account and reply ownership checks."}</p>
            <button className="twin-primary-link" name="operation" value={selected.active ? "set-access" : "restore"}>{selected.active ? "Save access" : "Restore access"}</button>
            {selected.active && <button className="twin-outline-link" name="operation" value="revoke">Revoke access</button>}
          </form>
          {selected.creator_access_revision && !creatorsUnavailable ? <StaffCreatorForm key={selected.user_id + selected.creator_access_revision} agencyId={agency.id} member={selected} creators={creators} /> : <p className="twin-help">Creator access settings are unavailable. Refresh before changing assignments.</p>}
        </>}
      </aside>
    </div>
    <footer className="space-y-2 text-sm">{agencies.filter(a => PARTNER_PORTALS.some(p => p.slug === a.slug)).map(a => <p key={a.id}>{a.name} sign-in: <Link className="text-accent underline" href={PARTNER_PORTALS.find(p => p.slug === a.slug)!.loginPath}>{PARTNER_PORTALS.find(p => p.slug === a.slug)!.loginPath}</Link></p>)}<Link href="/agency-admin/jess-kate-password" className="text-accent underline">Change Jess and Kate AI password</Link></footer>
  </main>;
}

function StaffCreatorForm({ agencyId, member, creators }: { agencyId: string; member: Member; creators: {id:string;name:string}[] }) {
  const [mode, setMode] = useState(member.creator_scope ?? "selected");
  return <form action="/agency-admin/creator-access" method="post" className="mt-6 border-t border-line pt-5" data-staff-creator-form>
    <h2>Assigned creators</h2>
    <input type="hidden" name="agency" value={agencyId} /><input type="hidden" name="user_id" value={member.user_id} /><input type="hidden" name="expected_revision" value={member.creator_access_revision} />
    <label>Creator access<select name="creator_scope" value={mode} onChange={event => setMode(event.target.value as "all" | "selected")}><option value="all">All agency creators, including future additions</option><option value="selected">Selected creators only</option></select></label>
    {mode === "selected" && <fieldset className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-line p-3"><legend className="text-sm">Choose creators</legend>{creators.map(creator => <label key={creator.id} className="!flex items-center gap-2"><input className="!m-0 !w-auto" type="checkbox" name="creator_ids" value={creator.id} defaultChecked={member.creator_ids?.includes(creator.id)} />{creator.name}</label>)}{!creators.length && <p className="text-sm text-muted">No creators are currently assigned to this agency.</p>}</fieldset>}
    <p className="twin-help">Selected creators with none checked grants no creator access. Changes take effect on the next request. Removing a creator from the agency removes access for its members too.</p>
    <button className="twin-primary-link" type="submit">Save creator access</button>
  </form>;
}

