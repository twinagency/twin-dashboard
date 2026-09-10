import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCreatorDashboard } from "@/lib/creator-dashboard-access";
import { serviceClient } from "@/lib/supabase-service";
import { CREATOR_IDENTITY_FIELDS, CREATOR_IDENTITY_SELECT } from "@/lib/creator-identity-fields";
import { INTAKE_FIELD_KEYS, proseValue } from "@/lib/intake";
import IntakeFields from "@/components/IntakeFields";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export const dynamic = "force-dynamic";
export default async function CreatorEditPage({ searchParams }: { searchParams: Promise<{ tab?: string; sub?: string; saved?: string; error?: string }> }) {
  const params = await searchParams;
  if ((params.tab && params.tab !== "identity") || (params.sub && params.sub !== "identity")) notFound();
  const identity = await requireCreatorDashboard();
  if (!identity.cloneId) return <div className="rounded-xl border border-line bg-panel p-6"><h1 className="text-2xl font-semibold">Identity</h1><p className="mt-3 text-sm text-muted">Your saved onboarding identity is available below. Live identity editing becomes available when your account is connected to its clone.</p><Link href="/creator/onboarding" className="mt-4 inline-block font-medium text-accent">View onboarding</Link></div>;
  const result = await serviceClient().from("clones").select(CREATOR_IDENTITY_SELECT).eq("id", identity.cloneId).single();
  if (result.error || !result.data) throw new Error("Unable to load your identity.");
  const row = result.data as unknown as Record<string, unknown>;
  const intake = (row.intake || {}) as { fields?: Record<string, string>; answers?: string };
  // Only public identity fields cross into client components, never the clone configuration.
  const fields = Object.fromEntries(INTAKE_FIELD_KEYS.map(key => [key, proseValue(key, intake.fields)]));
  return <div className="dashboard-page text-ink"><h1 className="mb-5 text-2xl font-semibold">Edit identity</h1><div className="mb-5 flex flex-wrap gap-2"><span className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white">Identity</span>{["Configuration", "Monetization", "Advanced", "View"].map(label => <button key={label} type="button" disabled title="Managed by your agency" className="cursor-not-allowed rounded-full border border-line bg-elev px-4 py-2 text-sm text-muted opacity-55">{label}</button>)}</div>
    {params.saved && <p role="status" className="mb-4 rounded-lg border border-good/30 bg-good/5 p-3 text-sm text-good">Identity saved.</p>}
    {params.error && <p role="alert" className="mb-4 rounded-lg border border-crit/30 bg-crit/5 p-3 text-sm text-crit">{params.error === "conflict" ? "Your identity was updated in another session. Refresh before saving again." : "Your changes could not be saved. Check the fields and try again."}</p>}
    <form action="/creator-auth/identity" method="post" className="grid gap-5"><input type="hidden" name="revision" value={String(row.updated_at || "")} /><Card><CardHeader><CardTitle>Who you are</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">{CREATOR_IDENTITY_FIELDS.map(([key, label]) => <label key={key} className="block"><span className="mb-1 block text-sm font-medium">{label}</span><Input name={key} defaultValue={String(row[key] || "")} type={key === "date_of_birth" ? "date" : "text"} required={key === "name"} maxLength={4000} /></label>)}</CardContent></Card><IntakeFields fields={fields} /><div className="sticky bottom-4 z-10 rounded-xl border border-line bg-panel/95 p-4 shadow-lg backdrop-blur"><Button type="submit">Save identity</Button></div></form>
  </div>;
}
