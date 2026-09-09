import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import TwinWordmark from "@/components/TwinWordmark";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { supabaseAdmin } from "@/lib/supabase";
import { CREATOR_SESSION_COOKIE, verifyCreatorSession } from "@/lib/creator-session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Creator Portal · Twin" };

export default async function CreatorHomePage() {
  const session = await verifyCreatorSession((await cookies()).get(CREATOR_SESSION_COOKIE)?.value);
  if (!session) redirect("/creator/login");

  const [{ data: account }, { data: progress }, { data: application }, { data: files }, { data: assignment }, { data: link }] = await Promise.all([
    supabaseAdmin.from("creator_accounts").select("id,display_name,email,account_status").eq("id", session.accountId).single(),
    supabaseAdmin.from("creator_onboarding_progress").select("questionnaire_completed,content_completed,voice_completed").eq("creator_account_id", session.accountId).maybeSingle(),
    supabaseAdmin.from("creator_applications").select("status").eq("creator_account_id", session.accountId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from("creator_files").select("id,kind,storage_transfer_status").eq("creator_account_id", session.accountId),
    supabaseAdmin.from("creator_agency_assignments").select("agency_id,partner_agencies(name)").eq("creator_account_id", session.accountId).maybeSingle(),
    supabaseAdmin.from("creator_clone_links").select("clone_id,twin_slug,clones(name)").eq("creator_account_id", session.accountId).maybeSingle(),
  ]);

  if (!account) redirect("/creator-auth/logout");
  const verified = (files || []).filter((file) => file.storage_transfer_status === "verified").length;
  const photos = (files || []).filter((file) => file.kind === "content").length;
  const voice = (files || []).filter((file) => file.kind === "voice").length;
  const agencyName = (assignment as any)?.partner_agencies?.name || "Twin Direct";
  const cloneName = (link as any)?.clones?.name || link?.twin_slug || "Not linked yet";
  const steps = [progress?.questionnaire_completed, progress?.content_completed, progress?.voice_completed].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <TwinWordmark />
          <form action="/creator-auth/logout" method="post"><button className="text-sm font-medium text-muted hover:text-ink">Sign out</button></form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-2">Creator Portal</p>
        <h1 className="mt-2 font-heading text-4xl font-semibold tracking-[-0.04em] text-ink">Welcome, {account.display_name || "creator"}</h1>
        <p className="mt-2 text-muted">Your Twin creator account is connected and ready for the new onboarding flow.</p>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <Card><CardHeader className="pb-2 text-sm text-muted">Account</CardHeader><CardContent className="text-xl font-semibold capitalize text-ink">{account.account_status}</CardContent></Card>
          <Card><CardHeader className="pb-2 text-sm text-muted">Onboarding</CardHeader><CardContent className="text-xl font-semibold text-ink">{steps}/3 complete</CardContent></Card>
          <Card><CardHeader className="pb-2 text-sm text-muted">Stored files</CardHeader><CardContent className="text-xl font-semibold text-ink">{verified} verified</CardContent></Card>
          <Card><CardHeader className="pb-2 text-sm text-muted">Application</CardHeader><CardContent className="text-xl font-semibold capitalize text-ink">{application?.status || "not started"}</CardContent></Card>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><h2 className="font-heading text-xl font-semibold text-ink">Your connection</h2></CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="flex justify-between gap-4"><span className="text-muted">Agency</span><span className="font-medium text-ink">{agencyName}</span></div>
              <div className="flex justify-between gap-4"><span className="text-muted">Twin clone</span><span className="font-medium text-ink">{cloneName}</span></div>
              <div className="flex justify-between gap-4"><span className="text-muted">Email</span><span className="font-medium text-ink">{account.email}</span></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><h2 className="font-heading text-xl font-semibold text-ink">Storage</h2></CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="flex justify-between"><span className="text-muted">Content files</span><span className="font-medium text-ink">{photos}</span></div>
              <div className="flex justify-between"><span className="text-muted">Voice files</span><span className="font-medium text-ink">{voice}</span></div>
              <div className="flex justify-between"><span className="text-muted">Verified files</span><span className="font-medium text-ink">{verified}</span></div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
