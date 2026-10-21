import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { agencyIdentity } from "@/lib/agency-identity";
import { AGENCY_COOKIE } from "@/lib/agency-policy";
import { agencyTeamOwner } from "@/lib/agency-team";
import { serviceClient } from "@/lib/supabase-service";
export const dynamic="force-dynamic";
export default async function AgencySetup() {
  const identity=await agencyIdentity((await cookies()).get(AGENCY_COOKIE)?.value);
  if (!identity) redirect("/agency/login");
  const owner=await agencyTeamOwner();
  const assigned=identity.creatorScope!=="selected" ? await serviceClient().from("creator_agency_assignments").select("creator_account_id").eq("agency_id",identity.id) : {data:[],error:null};
  const ids=(assigned.data??[]).map(r=>r.creator_account_id);
  const progress=ids.length ? await serviceClient().from("creator_onboarding_progress").select("creator_account_id,questionnaire_completed,content_completed,voice_completed").in("creator_account_id",ids) : {data:[],error:null};
  const completed=(progress.data??[]).filter(r=>r.questionnaire_completed&&r.content_completed&&r.voice_completed).length;
  return <main className="dashboard-page space-y-6"><header className="twin-media-heading"><div><h1>Welcome to {identity.name}</h1><p>Your agency workspace. Continue from the setup already saved.</p></div><Link className="twin-primary-link" href="/revenue">Open workspace</Link></header>
    <div className="grid gap-4 md:grid-cols-3"><section className="twin-surface p-6"><p className="text-sm text-muted">Your creators</p><p className="my-3 text-3xl font-semibold">{identity.cloneIds.length}</p><Link className="text-accent" href="/clones">View assigned creators →</Link></section>
    <section className="twin-surface p-6"><p className="text-sm text-muted">Creator onboarding</p>{identity.creatorScope==="selected"?<p className="my-3">Managed by your agency owner</p>:assigned.error||progress.error?<p role="status" className="my-3">Progress unavailable. Please retry.</p>:<><p className="my-3 text-3xl font-semibold">{completed} / {ids.length}</p><p className="text-sm text-muted">Questionnaire, content and voice completed. Approval and connection are separate steps.</p><Link href="/agency/creators" className="mt-3 inline-block text-accent">Continue creator setup →</Link></>}</section>
    <section className="twin-surface p-6"><p className="text-sm text-muted">Team access</p><h2 className="my-3 text-xl font-semibold">{owner?"You're an agency owner":"Your access is ready"}</h2>{owner?<Link className="text-accent" href="/agency/team">Invite and manage teammates →</Link>:<p className="text-sm text-muted">Ask your agency owner to change your assigned creators or permissions.</p>}</section></div>
    <section className="twin-surface p-6"><h2 className="text-lg font-semibold">Connect once, continue in your workspace</h2><p className="mt-2 text-sm text-muted">Existing creator profiles and saved content are reused. Check each account's connection and import progress before relying on its live inbox.</p><div className="mt-5 flex flex-wrap gap-3"><Link className="twin-outline-link" href="/business">Connections & import status</Link><Link className="twin-outline-link" href="/media">Shared content library</Link>{identity.creatorScope!=="selected"&&<Link className="twin-outline-link" href="/agency/creator-invites">Invite a creator</Link>}</div></section>
  </main>;
}
