import Link from "next/link";
import { getAgencyOnboardingAccess } from "@/lib/agency-onboarding-access";
import { serviceClient } from "@/lib/supabase-service";

// Applicant accounts exist before a bot is created. Keep them visible on the
// main Creators page without fabricating clone records or copying Twin data.
export default async function AgencyApplicantList() {
  const access = await getAgencyOnboardingAccess();
  if (!access) return null;
  const db = serviceClient();
  const assignments = await db.from("creator_agency_assignments").select("creator_account_id").eq("agency_id", access.id);
  if (assignments.error) throw new Error("Creator accounts are unavailable");
  const ids = (assignments.data ?? []).map(row => row.creator_account_id);
  if (!ids.length) return null;
  const accounts = await db.from("creator_accounts").select("id,display_name,account_status").in("id", ids).order("created_at", {ascending:false});
  if (accounts.error) throw new Error("Creator accounts are unavailable");
  return <section className="mt-8" aria-label="Creator onboarding accounts">
    <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Creator accounts</h2><Link href="/agency/creators" className="text-sm text-accent">Review onboarding →</Link></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(accounts.data ?? []).map(account =>
      <Link key={account.id} href={`/agency/creators/${account.id}`} className="rounded-xl border border-line bg-panel p-4 hover:border-accent">
        <p className="creator-name font-semibold">{account.display_name || "New creator"}</p><p className="mt-1 text-sm capitalize text-muted">{account.account_status}</p>
      </Link>)}</div>
  </section>;
}
