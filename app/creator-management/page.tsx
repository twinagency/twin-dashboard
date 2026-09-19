import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Creator Management · FLIRT" };

type Creator = { id: string; display_name: string | null; email: string | null; account_status: string; created_at: string };
type Application = { id: string; creator_account_id: string; status: string; submitted_at: string | null; created_at: string };
type Progress = { creator_account_id: string; questionnaire_completed: boolean; content_completed: boolean; voice_completed: boolean };
type Assignment = { creator_account_id: string; agency_id: string | null };
type Agency = { id: string; name: string };
type LinkRow = { creator_account_id: string; clone_id: string | null; twin_slug: string | null };
type Clone = { id: string; name: string; slug: string };
type FileRow = { creator_account_id: string; kind: string; storage_transfer_status: string };

function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function statusClass(status: string) {
  if (["approved", "active"].includes(status)) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (["rejected", "archived"].includes(status)) return "bg-red-50 text-red-700 ring-red-200";
  if (["reviewing", "paused"].includes(status)) return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-slate-50 text-slate-700 ring-slate-200";
}

export default async function CreatorManagementPage() {
  const agencyAccess = await getDashboardAccess();
  if (agencyAccess) redirect("/revenue");

  const [creatorRes, applicationRes, progressRes, assignmentRes, agencyRes, linkRes, cloneRes, fileRes] = await Promise.all([
    supabaseAdmin.from("creator_accounts").select("id,display_name,email,account_status,created_at").order("created_at", { ascending: false }),
    supabaseAdmin.from("creator_applications").select("id,creator_account_id,status,submitted_at,created_at").order("created_at", { ascending: false }),
    supabaseAdmin.from("creator_onboarding_progress").select("creator_account_id,questionnaire_completed,content_completed,voice_completed"),
    supabaseAdmin.from("creator_agency_assignments").select("creator_account_id,agency_id"),
    supabaseAdmin.from("partner_agencies").select("id,name").eq("active", true).order("name"),
    supabaseAdmin.from("creator_clone_links").select("creator_account_id,clone_id,twin_slug"),
    supabaseAdmin.from("clones").select("id,name,slug"),
    supabaseAdmin.from("creator_files").select("creator_account_id,kind,storage_transfer_status"),
  ]);

  const creators = (creatorRes.data ?? []) as Creator[];
  const applications = (applicationRes.data ?? []) as Application[];
  const progressRows = (progressRes.data ?? []) as Progress[];
  const assignments = (assignmentRes.data ?? []) as Assignment[];
  const agencies = (agencyRes.data ?? []) as Agency[];
  const links = (linkRes.data ?? []) as LinkRow[];
  const clones = (cloneRes.data ?? []) as Clone[];
  const files = (fileRes.data ?? []) as FileRow[];

  const latestApplication = new Map<string, Application>();
  for (const row of applications) if (!latestApplication.has(row.creator_account_id)) latestApplication.set(row.creator_account_id, row);
  const progressByCreator = new Map(progressRows.map((row) => [row.creator_account_id, row]));
  const assignmentByCreator = new Map(assignments.map((row) => [row.creator_account_id, row]));
  const agencyById = new Map(agencies.map((row) => [row.id, row]));
  const linkByCreator = new Map(links.map((row) => [row.creator_account_id, row]));
  const cloneById = new Map(clones.map((row) => [row.id, row]));
  const fileCounts = new Map<string, { total: number; verified: number; content: number; voice: number }>();
  for (const creator of creators) fileCounts.set(creator.id, { total: 0, verified: 0, content: 0, voice: 0 });
  for (const file of files) {
    const c = fileCounts.get(file.creator_account_id);
    if (!c) continue;
    c.total += 1;
    if (file.storage_transfer_status === "verified") c.verified += 1;
    if (file.kind === "voice") c.voice += 1;
    else c.content += 1;
  }

  const submitted = creators.filter((c) => ["submitted", "reviewing"].includes(latestApplication.get(c.id)?.status ?? "")).length;
  const approved = creators.filter((c) => ["approved", "active"].includes(c.account_status)).length;
  const unmapped = creators.filter((c) => !linkByCreator.get(c.id)?.clone_id).length;

  return (
    <div className="dashboard-page text-ink">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-2">Admin</p>
          <h1 className="mt-1 text-2xl font-semibold">Creator management</h1>
          <p className="mt-1 text-sm text-muted">Review onboarding, approve creators, assign agencies and link live clones.</p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4"><div className="text-xs text-muted">Creators</div><div className="mt-1 text-2xl font-semibold">{creators.length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted">Awaiting review</div><div className="mt-1 text-2xl font-semibold">{submitted}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted">Approved / active</div><div className="mt-1 text-2xl font-semibold">{approved}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted">No clone linked</div><div className="mt-1 text-2xl font-semibold">{unmapped}</div></Card>
      </div>

      <div className="grid gap-3">
        {creators.map((creator) => {
          const application = latestApplication.get(creator.id);
          const progress = progressByCreator.get(creator.id);
          const assignment = assignmentByCreator.get(creator.id);
          const agency = assignment?.agency_id ? agencyById.get(assignment.agency_id) : null;
          const link = linkByCreator.get(creator.id);
          const clone = link?.clone_id ? cloneById.get(link.clone_id) : null;
          const count = fileCounts.get(creator.id)!;
          const completed = [progress?.questionnaire_completed, progress?.content_completed, progress?.voice_completed].filter(Boolean).length;
          const status = application?.status || creator.account_status;
          return (
            <Link key={creator.id} href={`/creator-management/${creator.id}`} className="block">
              <Card className="p-4 transition hover:border-slate-300 hover:shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-base font-semibold">{creator.display_name || creator.email || "Unnamed creator"}</h2>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold capitalize ring-1 ring-inset ${statusClass(status)}`}>{status}</span>
                    </div>
                    <div className="mt-1 truncate text-xs text-muted">{creator.email || "No email"}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4 lg:min-w-[560px]">
                    <div><div className="text-xs text-muted">Agency</div><div className="mt-0.5 font-medium">{agency?.name || "FLIRT Direct"}</div></div>
                    <div><div className="text-xs text-muted">Onboarding</div><div className="mt-0.5 font-medium">{completed}/3</div></div>
                    <div><div className="text-xs text-muted">Media</div><div className="mt-0.5 font-medium">{count.verified}/{count.total} verified</div></div>
                    <div><div className="text-xs text-muted">Clone</div><div className="mt-0.5 truncate font-medium">{clone?.name || link?.twin_slug || "Not linked"}</div></div>
                  </div>
                  <div className="text-xs text-muted lg:w-28 lg:text-right">{application?.submitted_at ? `Submitted ${dateLabel(application.submitted_at)}` : `Joined ${dateLabel(creator.created_at)}`}</div>
                </div>
              </Card>
            </Link>
          );
        })}
        {creators.length === 0 && <Card className="p-10 text-center text-sm text-muted">No creator accounts yet.</Card>}
      </div>
    </div>
  );
}
