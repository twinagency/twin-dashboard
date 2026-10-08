import Link from "next/link";
import { redirect } from "next/navigation";
// serviceClient, not supabaseAdmin: supabaseAdmin's fetch is intercepted for
// agency sessions and force-scoped by clone_id, which these agency_id-scoped
// tables do not have. Every query here scopes to the signed-in agency explicitly.
import { serviceClient } from "@/lib/supabase-service";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { Card } from "@/components/ui/card";
import { isMoxy } from "@/lib/agency-brand";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agency Accounts · Twin" };

// Moxy requested a two-creator display on this onboarding screen. This only
// narrows existing assignments for presentation; accounts and access stay intact.
const MOXY_VISIBLE_ACCOUNT_IDS = new Set([
  "c3f3b398-44f7-4031-af41-2c5925d48bc4", // Riley Mae
  "268bdb4d-299b-43e1-9836-38414f24dc12", // Kyla Yesenosky
]);
const MOXY_VISIBLE_CLONE_IDS = new Set([
  "20ef9407-83f2-4351-8d3c-48cc0ed54e0b", // Riley Mae Lewis
  "d2678dce-6a4e-4f1c-b54a-86057bba427c", // Kyla Yesenosky
]);

type Assignment = { creator_account_id: string; agency_id: string | null };
type Creator = { id: string; display_name: string | null; email: string | null; account_status: string; created_at: string };
type Application = { creator_account_id: string; status: string; submitted_at: string | null; created_at: string };
type Progress = { creator_account_id: string; questionnaire_completed: boolean; content_completed: boolean; voice_completed: boolean };
type FileRow = { creator_account_id: string; storage_transfer_status: string };
type LinkRow = { creator_account_id: string; clone_id: string | null; twin_slug: string | null };
type Clone = { id: string; name: string };

export default async function AgencyCreatorsPage() {
  const access = await getDashboardAccess();
  if (!access) redirect("/creator-management");

  const { data: assignmentRows } = await serviceClient()
    .from("creator_agency_assignments")
    .select("creator_account_id,agency_id")
    .eq("agency_id", access.id);
  const moxy = isMoxy(access.name);
  const assignments = ((assignmentRows ?? []) as Assignment[]).filter(
    (row) => !moxy || MOXY_VISIBLE_ACCOUNT_IDS.has(row.creator_account_id),
  );
  const ids = assignments.map((row) => row.creator_account_id);
  const visibleCloneIds = access.cloneIds.filter((id) => !moxy || MOXY_VISIBLE_CLONE_IDS.has(id));

  if (!ids.length) {
    return <div className="dashboard-page text-ink"><h1 className="text-2xl font-semibold">Accounts</h1><p className="mt-2 text-sm text-muted">No creator accounts are assigned to {access.name} yet.</p></div>;
  }

  const [creatorRes, applicationRes, progressRes, fileRes, linkRes, cloneRes] = await Promise.all([
    serviceClient().from("creator_accounts").select("id,display_name,email,account_status,created_at").in("id", ids).order("created_at", { ascending: false }),
    serviceClient().from("creator_applications").select("creator_account_id,status,submitted_at,created_at").in("creator_account_id", ids).order("created_at", { ascending: false }),
    serviceClient().from("creator_onboarding_progress").select("creator_account_id,questionnaire_completed,content_completed,voice_completed").in("creator_account_id", ids),
    serviceClient().from("creator_files").select("creator_account_id,storage_transfer_status").in("creator_account_id", ids),
    serviceClient().from("creator_clone_links").select("creator_account_id,clone_id,twin_slug").in("creator_account_id", ids),
    serviceClient().from("clones").select("id,name").in("id", visibleCloneIds.length ? visibleCloneIds : ["00000000-0000-0000-0000-000000000000"]),
  ]);

  const creators = (creatorRes.data ?? []) as Creator[];
  const applications = (applicationRes.data ?? []) as Application[];
  const progressRows = (progressRes.data ?? []) as Progress[];
  const files = (fileRes.data ?? []) as FileRow[];
  const links = (linkRes.data ?? []) as LinkRow[];
  const clones = (cloneRes.data ?? []) as Clone[];

  const latestApplication = new Map<string, Application>();
  for (const row of applications) if (!latestApplication.has(row.creator_account_id)) latestApplication.set(row.creator_account_id, row);
  const progressByCreator = new Map(progressRows.map((row) => [row.creator_account_id, row]));
  const linkByCreator = new Map(links.map((row) => [row.creator_account_id, row]));
  const cloneById = new Map(clones.map((row) => [row.id, row]));
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
      <div className="mb-6"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-2">{access.name}</p><h1 className="mt-1 text-2xl font-semibold">Accounts</h1><p className="mt-1 text-sm text-muted">Creator onboarding assigned to your agency. You can link a creator to any clone Twin has already assigned you; Twin admin still handles application approval and Twin setup.</p></div>
      <div className="grid gap-3">
        {creators.map((creator) => {
          const application = latestApplication.get(creator.id);
          const progress = progressByCreator.get(creator.id);
          const link = linkByCreator.get(creator.id);
          const clone = link?.clone_id ? cloneById.get(link.clone_id) : null;
          const count = counts.get(creator.id) ?? { total: 0, verified: 0 };
          const complete = [progress?.questionnaire_completed, progress?.content_completed, progress?.voice_completed].filter(Boolean).length;
          return <Card key={creator.id} className="p-4"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div className="min-w-0"><div className="font-semibold">{creator.display_name || creator.email || "Unnamed creator"}</div><div className="mt-1 truncate text-xs text-muted">{creator.email || "No email"}</div></div><div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4"><div><div className="text-xs text-muted">Application</div><div className="mt-0.5 font-medium capitalize">{application?.status || "not started"}</div></div><div><div className="text-xs text-muted">Onboarding</div><div className="mt-0.5 font-medium">{complete}/3</div></div><div><div className="text-xs text-muted">Media</div><div className="mt-0.5 font-medium">{count.verified}/{count.total}</div></div><div><div className="text-xs text-muted">Clone</div><div className="mt-0.5 font-medium">{clone?.name || link?.twin_slug || "Not linked"}</div></div></div><div className="flex items-center gap-3">{link?.clone_id && access.cloneIds.includes(link.clone_id) ? <Link href={`/clones/${link.clone_id}`} className="text-sm font-medium text-accent hover:underline">Open creator →</Link> : null}<form action="/agency/creators/link" method="post" className="flex items-center gap-2"><input type="hidden" name="creator_account_id" value={creator.id} /><select name="clone_id" defaultValue={link?.clone_id ?? ""} className="rounded-lg border border-line bg-panel px-2 py-1.5 text-sm"><option value="">Not linked</option>{clones.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button className="rounded-lg border border-line px-3 py-1.5 text-sm">Save</button></form></div></div></Card>;
        })}
      </div>
    </div>
  );
}
