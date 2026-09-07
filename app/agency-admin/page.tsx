import { isAuthed } from "@/lib/auth";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
export const dynamic = "force-dynamic";
export default async function AgencyAdmin({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  if (!await isAuthed()) redirect("/login");
  const { result } = await searchParams;
  const agencies = await supabaseAdmin.from("partner_agencies").select("id,name").eq("active",true).order("name");
  if (agencies.error) throw new Error("Agency access is not configured yet");
  return <main className="dashboard-page max-w-xl"><h1 className="mb-6 text-2xl font-semibold">Agency access</h1>
    {result && <p role="status" className="mb-4">{result==="created"?"Account created. Share the agency login URL and the password you chose securely.":result==="revoked"?"Access revoked.":"Unable to complete that request. Check the account details."}</p>}
    <form action="/agency-admin/provision" method="post" className="space-y-4 rounded-2xl border border-line bg-panel p-6">
      <label className="block">Agency<select name="agency" required className="mt-1 block w-full rounded-lg border border-line p-3">{agencies.data.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <label className="block">Partner email<input name="email" type="email" required autoComplete="off" className="mt-1 block w-full rounded-lg border border-line p-3" /></label>
      <label className="block">Password<input name="password" type="password" minLength={16} autoComplete="new-password" className="mt-1 block w-full rounded-lg border border-line p-3" /><span className="text-xs text-muted">At least 16 characters when creating an account.</span></label>
      <div className="flex gap-3"><button name="operation" value="create" className="rounded-lg bg-accent px-4 py-2 text-white">Create read-only login</button><button name="operation" value="revoke" className="rounded-lg border border-crit px-4 py-2 text-crit">Revoke access</button></div>
    </form><p className="mt-4 text-sm">Partner login: <a className="text-accent" href="/agency/login">/agency/login</a></p></main>;
}
