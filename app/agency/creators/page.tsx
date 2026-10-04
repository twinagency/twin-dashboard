import Link from "next/link";
import { redirect } from "next/navigation";
// serviceClient, not supabaseAdmin: supabaseAdmin's fetch is intercepted for
// agency sessions and force-scoped by clone_id, which these agency_id-scoped
// tables do not have. Every query here scopes to the signed-in agency explicitly.
import { serviceClient } from "@/lib/supabase-service";
import { getAgencyOnboardingAccess } from "@/lib/agency-onboarding-access";
import { getCreatorBotOptions, resolveCreatorBot } from "@/lib/agency-creator-links";
import { creatorVoiceOnboardingEnabled } from "@/lib/flirt-onboarding";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agency Accounts · FLIRT" };

type Assignment = { creator_account_id: string; agency_id: string | null };
type Creator = { id: string; display_name: string | null; email: string | null; account_status: string; created_at: string };
type Application = { creator_account_id: string; status: string; submitted_at: string | null; created_at: string };
type Progress = { creator_account_id: string; questionnaire_completed: boolean; content_completed: boolean; voice_completed: boolean };
type FileRow = { creator_account_id: string; storage_transfer_status: string };
type LinkRow = { creator_account_id: string; clone_id: string | null; twin_slug: string | null };


export default async function AgencyCreatorsPage({ searchParams }: { searchParams: Promise<{ linkResult?: string }> }) {
  const { linkResult } = await searchParams;
  const access = await getAgencyOnboardingAccess();
  if (!access) redirect("/creator-management");

  const { data: assignmentRows } = await serviceClient()
    .from("creator_agency_assignments")
    .select("creator_account_id,agency_id")
    .eq("agency_id", access.id);
  if (assignmentRows === null) throw new Error("Creator account assignments are unavailable");
  const assignments = (assignmentRows ?? []) as Assignment[];
  const ids = assignments.map((row) => row.creator_account_id);

  if (!ids.length) {
    return <div className="dashboard-page text-ink"><h1 className="text-2xl font-semibold">Accounts</h1><p className="mt-2 text-sm text-muted">No creator accounts are assigned to {access.name} yet.</p><Link href="/agency/creator-invites" className="mt-4 inline-block text-accent">Invite creator →</Link></div>;
  }

  const [creatorRes, applicationRes, progressRes, fileRes, linkRes, botOptions] = await Promise.all([
    serviceClient().from("creator_accounts").select("id,display_name,email,account_status,created_at").in("id", ids).order("created_at", { ascending: false }),
    serviceClient().from("creator_applications").select("creator_account_id,status,submitted_at,created_at").in("creator_account_id", ids).order("created_at", { ascending: false }),
    serviceClient().from("creator_onboarding_progress").select("creator_account_id,questionnaire_completed,content_completed,voice_completed").in("creator_account_id", ids),
    serviceClient().from("creator_files").select("creator_account_id,storage_transfer_status").in("creator_account_id", ids),
    serviceClient().from("creator_clone_links").select("creator_account_id,clone_id,twin_slug").in("creator_account_id", ids),
    getCreatorBotOptions(access),
  ]);

  if ([creatorRes, applicationRes, progressRes, fileRes, linkRes].some(result => result.error)) throw new Error("Creator onboarding is unavailable");
  const creators = (creatorRes.data ?? []) as Creator[];
  const applications = (applicationRes.data ?? []) as Application[];
  const progressRows = (progressRes.data ?? []) as Progress[];
  const files = (fileRes.data ?? []) as FileRow[];
  const links = (linkRes.data ?? []) as LinkRow[];
  const clones = botOptions.clones;

  const latestApplication = new Map<string, Application>();
  for (const row of applications) if (!latestApplication.has(row.creator_account_id)) latestApplication.set(row.creator_account_id, row);
  const progressByCreator = new Map(progressRows.map((row) => [row.creator_account_id, row]));
  const linkByCreator = new Map(links.map((row) => [row.creator_account_id, row]));
  const counts = new Map<string, { total: number; verified: number }>();
  for (const id of ids) counts.set(id, { total: 0, verified: 0 });
  for (const file of files) {
    const count = counts.get(file.creator_account_id);
    if (!count) continue;
    count.total += 1;
    if (file.storage_transfer_status === "verified") count.verified += 1;
  }

  return (
    <div className="dashboard-page text-ink">
      <div className="mb-6"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-2">{access.name}</p><h1 className="mt-1 text-2xl font-semibold">Accounts</h1><p className="mt-1 text-sm text-muted">New creators appear here as soon as they sign up. Review their profile, questionnaire and onboarding progress before bot setup.</p></div>
      {linkResult && <p role="status" className="mb-4 rounded-xl border border-line bg-panel p-3 text-sm">{
        linkResult === "linked" ? "Bot link saved. Application approval is unchanged."
        : linkResult === "unchanged" ? "No bot selected. The existing link has been kept."
        : linkResult === "conflict" ? "That bot is already linked to another account. No changes were made."
        : linkResult === "invalid" ? "Choose a valid bot before saving."
        : "The link could not be saved. Please try again."
      }</p>}
      <p className="mb-4 text-sm text-muted">Link an account to its existing bot below. Review uploads first to confirm the match. Linking does not approve an application or create a bot.</p>
      <div className="grid gap-3">
        {creators.map((creator) => {
          const application = latestApplication.get(creator.id);
          const progress = progressByCreator.get(creator.id);
          const link = linkByCreator.get(creator.id);
          const clone = resolveCreatorBot(link, clones);
          const count = counts.get(creator.id) ?? { total: 0, verified: 0 };
          const steps = [progress?.questionnaire_completed, progress?.content_completed, ...(creatorVoiceOnboardingEnabled() ? [progress?.voice_completed] : [])];
          const complete = steps.filter(Boolean).length;
          return (
            <Card key={creator.id} className="p-4">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="font-semibold">{creator.display_name || creator.email || "Unnamed creator"}</div>
                    <div className="mt-1 truncate text-xs text-muted">{creator.email || "No email"}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
                    <div><div className="text-xs text-muted">Application</div><div className="mt-0.5 font-medium capitalize">{application?.status || "not started"}</div></div>
                    <div><div className="text-xs text-muted">Onboarding</div><div className="mt-0.5 font-medium">{complete}/{steps.length}</div></div>
                    <div><div className="text-xs text-muted">Media</div><div className="mt-0.5 font-medium">{count.verified}/{count.total}</div></div>
                    <div><div className="text-xs text-muted">Linked bot</div><div className="mt-0.5 font-medium">{clone?.name || link?.twin_slug || (link?.clone_id ? "Linked bot unavailable" : "Not linked")}</div></div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4 border-t border-line pt-4">
                  <Link href={`/agency/creators/${creator.id}`} className="text-sm font-medium text-accent hover:underline">Review profile & content →</Link>
                  {clone ? <Link href={`/clones/${clone.id}`} className="text-sm font-medium text-accent hover:underline">Open bot →</Link> : null}
                  <form action="/agency/creators/link" method="post" className="flex flex-wrap items-center gap-2 md:ml-auto">
                    <input type="hidden" name="creator_account_id" value={creator.id} />
                    <label htmlFor={`bot-${creator.id}`} className="text-xs text-muted">Existing bot</label>
                    <select id={`bot-${creator.id}`} name="clone_id" defaultValue={clone?.id ?? ""} disabled={!clones.length} className="max-w-full rounded-lg border border-line bg-panel px-2 py-2 text-sm">
                      <option value="">{link?.clone_id || link?.twin_slug ? "Keep current link" : "Choose a bot"}</option>
                      {clones.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name || candidate.slug}</option>)}
                    </select>
                    <button type="submit" disabled={!clones.length} className="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50">{link?.clone_id || link?.twin_slug ? "Update link" : "Link bot"}</button>
                  </form>
                </div>
                {!clones.length && <p className="text-xs text-muted">No existing bots are available to link yet. You can still review this account and its uploads.</p>}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

