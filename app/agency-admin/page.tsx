import { PARTNER_PORTALS } from "@/lib/partner-portals";
import { isAuthed } from "@/lib/auth";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
export const dynamic = "force-dynamic";
export default async function AgencyAdmin({ searchParams }: { searchParams: Promise<{ result?: string; agency?: string }> }) {
  if (!await isAuthed()) redirect("/login");
  const { result, agency: selectedAgency } = await searchParams;
  const agencies = await supabaseAdmin.from("partner_agencies").select("id,name,slug").eq("active",true).order("name");
  if (agencies.error) throw new Error("Agency access is not configured yet");
  return <main className="dashboard-page max-w-xl"><h1 className="mb-6 text-2xl font-semibold">Agency access</h1>
    {result && <p role="status" className="mb-4">{result==="created"?"Account created. Share the agency login URL and the password you chose securely.":result==="revoked"?"Access revoked.":"Unable to complete that request. Check the account details."}</p>}
    <form action="/agency-admin/provision" method="post" className="space-y-4 rounded-2xl border border-line bg-panel p-6">
      <label className="block">Agency<select name="agency" defaultValue={agencies.data.find(a=>a.slug===selectedAgency)?.id} required className="mt-1 block w-full rounded-lg border border-line p-3">{agencies.data.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <label className="block">Partner email<input name="email" type="email" required autoComplete="off" className="mt-1 block w-full rounded-lg border border-line p-3" /></label>
      <label className="block">Password<input name="password" type="password" minLength={16} autoComplete="new-password" className="mt-1 block w-full rounded-lg border border-line p-3" /><span className="text-xs text-muted">At least 16 characters when creating an account.</span></label>
      <div className="flex gap-3"><button name="operation" value="create" className="rounded-lg bg-accent px-4 py-2 text-white">Create partner login</button><button name="operation" value="revoke" className="rounded-lg border border-crit px-4 py-2 text-crit">Revoke access</button></div>
    </form><div className="mt-4 space-y-2 text-sm">{agencies.data.filter(a=>PARTNER_PORTALS.some(p=>p.slug===a.slug)).map(a=><p key={a.id}>{a.name} sign-in: <a className="text-accent underline" href={PARTNER_PORTALS.find(p=>p.slug===a.slug)!.loginPath}>{PARTNER_PORTALS.find(p=>p.slug===a.slug)!.loginPath}</a></p>)}</div><p className="mt-4 text-sm"><a href="/agency-admin/jess-kate-password" className="text-accent underline">Change Jess and Kate AI password</a></p></main>;
}
