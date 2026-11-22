import Link from "next/link";
import { redirect } from "next/navigation";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { FLIRT_TEAM_NAME } from "@/lib/agency-policy";
import { serviceClient } from "@/lib/supabase-service";

export const metadata = { title: "Create · Twin" };
export const dynamic = "force-dynamic";

const inputCls = "mt-1 block w-full rounded-lg border border-line p-3";
type Row = { id: string; full_name: string; status: string; created_at: string };
const STATUS: Record<string, string> = {
  submitted: "Queued", building: "Building", review: "Ready for your review",
  approved: "Approved", rejected: "Rejected", failed: "Needs attention",
};

export default async function AgencyCreate({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const access = await getDashboardAccess();
  if (!access) redirect("/creator-management");
  const { result } = await searchParams;
  const quick = access.name.trim() === FLIRT_TEAM_NAME;
  const rows: Row[] = quick
    ? (((await serviceClient().from("agency_clone_requests").select("id,full_name,status,created_at")
        .eq("agency_id", access.id).order("created_at", { ascending: false }).limit(50)).data ?? []) as Row[])
    : [];
  const banner = result === "queued" ? "Request sent. You can review the clone when it is ready."
    : result === "invalid" ? "Check the name, the Drive or Dropbox link, the social links, and the birthday (she must be 18 or older)."
    : result === "error" ? "Unable to complete that request." : null;

  return (
    <main className="dashboard-page max-w-3xl text-ink">
      <h1 className="mb-2 text-2xl font-semibold">Create</h1>
      {banner && <p role="status" className="mb-4 text-sm">{banner}</p>}

      <section className="mb-6 rounded-2xl border border-line bg-panel p-6">
        <h2 className="text-lg font-semibold">1. Standard onboarding</h2>
        <p className="mb-4 mt-1 text-sm text-muted">Send the creator a signup link. She fills in her own details.</p>
        <Link href="/agency/creator-invites" className="inline-block rounded-lg bg-accent px-4 py-2 text-white">Get signup link</Link>
      </section>

      {quick && (
        <section className="rounded-2xl border border-line bg-panel p-6">
          <h2 className="text-lg font-semibold">2. Quick create</h2>
          <p className="mb-4 mt-1 text-sm text-muted">Paste her content link and her name. We build the clone for you to review.</p>
          <form action="/agency/create/manage" method="post" className="space-y-4">
            <label className="block">Full name
              <input name="full_name" required minLength={2} maxLength={80} autoComplete="off" className={inputCls} />
            </label>
            <label className="block">Drive or Dropbox link to all her content
              <input name="content_url" type="url" required maxLength={500} autoComplete="off" placeholder="https://" className={inputCls} />
            </label>
            <label className="block">Instagram and other social links <span className="text-muted">(one per line)</span>
              <textarea name="socials" rows={4} maxLength={1200} className={inputCls} />
            </label>
            <label className="block">Birthday <span className="text-muted">(optional, helps a lot)</span>
              <input name="birth_date" type="date" className={inputCls} />
            </label>
            <label className="block">City <span className="text-muted">(optional)</span>
              <input name="city" maxLength={80} autoComplete="off" className={inputCls} />
            </label>
            <label className="block">A few of her real texts or captions <span className="text-muted">(optional, so she sounds like her)</span>
              <textarea name="sample_texts" rows={4} maxLength={2000} className={inputCls} />
            </label>
            <button className="rounded-lg bg-accent px-4 py-2 text-white">Create</button>
          </form>

          {rows.length > 0 && (
            <div className="mt-6 divide-y divide-line rounded-2xl border border-line">
              {rows.map(r => (
                <div key={r.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                  <span className="min-w-0 flex-1 font-medium">{r.full_name}</span>
                  <span className="whitespace-nowrap rounded border border-line px-2 py-0.5 text-xs text-muted">{STATUS[r.status] ?? r.status}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
