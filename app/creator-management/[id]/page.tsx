import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { updateCreatorReviewStatus, linkCreatorClone, assignCreatorAgency } from "../actions";

export const dynamic = "force-dynamic";

type Creator = { id: string; display_name: string | null; email: string | null; account_status: string; source: string; created_at: string };
type Application = { id: string; status: string; answers: Record<string, unknown>; submitted_at: string | null; created_at: string };
type Progress = { questionnaire_completed: boolean; content_completed: boolean; voice_completed: boolean };
type Consent = { id: string; legal_name: string; consent_version: string; signed_at: string };
type FileRow = { id: string; kind: string; bucket: string; storage_path: string; mime_type: string | null; size_bytes: number | null; original_name: string | null; storage_transfer_status: string };
type Clone = { id: string; name: string; slug: string };
type LinkRow = { clone_id: string | null; twin_slug: string | null };
type Agency = { id: string; name: string };
type Assignment = { agency_id: string | null; assignment_source: string };

function prettyKey(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function prettyValue(value: unknown) {
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function prettyBytes(bytes: number | null) {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
  return `${n >= 10 || i === 0 ? n.toFixed(0) : n.toFixed(1)} ${units[i]}`;
}

function accountForApplication(status: string) {
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  return "applicant";
}

export default async function CreatorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const agencyAccess = await getDashboardAccess();
  if (agencyAccess) redirect("/revenue");
  const { id } = await params;

  const [creatorRes, applicationRes, progressRes, consentRes, fileRes, cloneRes, linkRes, agencyRes, assignmentRes] = await Promise.all([
    supabaseAdmin.from("creator_accounts").select("id,display_name,email,account_status,source,created_at").eq("id", id).maybeSingle(),
    supabaseAdmin.from("creator_applications").select("id,status,answers,submitted_at,created_at").eq("creator_account_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from("creator_onboarding_progress").select("questionnaire_completed,content_completed,voice_completed").eq("creator_account_id", id).maybeSingle(),
    supabaseAdmin.from("creator_consents").select("id,legal_name,consent_version,signed_at").eq("creator_account_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from("creator_files").select("id,kind,bucket,storage_path,mime_type,size_bytes,original_name,storage_transfer_status").eq("creator_account_id", id).order("created_at", { ascending: false }),
    supabaseAdmin.from("clones").select("id,name,slug").order("name"),
    supabaseAdmin.from("creator_clone_links").select("clone_id,twin_slug").eq("creator_account_id", id).maybeSingle(),
    supabaseAdmin.from("partner_agencies").select("id,name").eq("active", true).order("name"),
    supabaseAdmin.from("creator_agency_assignments").select("agency_id,assignment_source").eq("creator_account_id", id).maybeSingle(),
  ]);

  const creator = creatorRes.data as Creator | null;
  if (!creator) notFound();
  const application = applicationRes.data as Application | null;
  const progress = progressRes.data as Progress | null;
  const consent = consentRes.data as Consent | null;
  const files = (fileRes.data ?? []) as FileRow[];
  const clones = (cloneRes.data ?? []) as Clone[];
  const link = linkRes.data as LinkRow | null;
  const agencies = (agencyRes.data ?? []) as Agency[];
  const assignment = assignmentRes.data as Assignment | null;

  const verified = files.filter((f) => f.storage_transfer_status === "verified");
  const contentFiles = verified.filter((f) => f.kind !== "voice");
  const voiceFiles = verified.filter((f) => f.kind === "voice");
  const signed = new Map<string, string>();
  const groups = new Map<string, FileRow[]>();
  for (const file of verified.slice(0, 60)) groups.set(file.bucket, [...(groups.get(file.bucket) ?? []), file]);
  await Promise.all([...groups.entries()].map(async ([bucket, rows]) => {
    const { data } = await supabaseAdmin.storage.from(bucket).createSignedUrls(rows.map((r) => r.storage_path), 60 * 60);
    rows.forEach((row, i) => { const url = data?.[i]?.signedUrl; if (url) signed.set(row.id, url); });
  }));

  const answers = application?.answers && typeof application.answers === "object" ? Object.entries(application.answers) : [];
  const onboardingComplete = [progress?.questionnaire_completed, progress?.content_completed, progress?.voice_completed].filter(Boolean).length;

  return (
    <div className="dashboard-page text-ink">
      <div className="mb-6">
        <Link href="/creator-management" className="text-sm font-medium text-muted hover:text-ink">← All creators</Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-2">Creator review</p>
            <h1 className="mt-1 text-3xl font-semibold">{creator.display_name || creator.email || "Unnamed creator"}</h1>
            <p className="mt-1 text-sm text-muted">{creator.email || "No email"} · {creator.source}</p>
          </div>
          <div className="rounded-full border border-border bg-white px-4 py-2 text-sm font-semibold capitalize">{application?.status || creator.account_status}</div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4"><div className="text-xs text-muted">Onboarding</div><div className="mt-1 text-xl font-semibold">{onboardingComplete}/3</div></Card>
        <Card className="p-4"><div className="text-xs text-muted">Verified media</div><div className="mt-1 text-xl font-semibold">{verified.length}/{files.length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted">Consent</div><div className="mt-1 text-xl font-semibold">{consent ? "Signed" : "Missing"}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted">Clone</div><div className="mt-1 truncate text-xl font-semibold">{clones.find((c) => c.id === link?.clone_id)?.name || link?.twin_slug || "Not linked"}</div></Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
        <div className="grid gap-6">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Questionnaire</h2><span className="text-xs text-muted">{answers.length} answers</span></div>
            {answers.length ? <div className="grid gap-4 md:grid-cols-2">{answers.map(([key, value]) => <div key={key} className="rounded-xl border border-border p-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{prettyKey(key)}</div><div className="mt-1 whitespace-pre-wrap text-sm">{prettyValue(value)}</div></div>)}</div> : <div className="text-sm text-muted">No questionnaire has been submitted.</div>}
          </Card>

          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">Media</h2><Link href={`/storage?creator=${creator.id}`} className="text-sm font-medium text-accent hover:underline">Open full storage →</Link></div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {contentFiles.slice(0, 12).map((file) => {
                const url = signed.get(file.id);
                const isVideo = file.mime_type?.startsWith("video/");
                return <div key={file.id} className="overflow-hidden rounded-xl border border-border bg-white"><div className="aspect-square bg-black/5">{url ? (isVideo ? <video src={url} controls preload="metadata" className="h-full w-full object-cover" /> : <img src={url} alt={file.original_name || "Creator media"} className="h-full w-full object-cover" />) : <div className="grid h-full place-items-center text-xs text-muted">Preview unavailable</div>}</div><div className="p-2"><div className="truncate text-xs font-medium">{file.original_name || "Untitled"}</div><div className="mt-1 text-[11px] text-muted">{prettyBytes(file.size_bytes)}</div></div></div>;
              })}
            </div>
            {!contentFiles.length && <div className="text-sm text-muted">No verified content files.</div>}
            {voiceFiles.length > 0 && <div className="mt-5"><h3 className="mb-2 text-sm font-semibold">Voice</h3><div className="grid gap-2">{voiceFiles.slice(0, 5).map((file) => <div key={file.id} className="rounded-xl border border-border p-3"><div className="mb-2 truncate text-xs font-medium">{file.original_name || "Voice sample"}</div>{signed.get(file.id) ? <audio src={signed.get(file.id)} controls preload="metadata" className="w-full" /> : <div className="text-xs text-muted">Preview unavailable</div>}</div>)}</div></div>}
          </Card>
        </div>

        <div className="grid content-start gap-6">
          <Card className="p-5">
            <h2 className="mb-4 text-lg font-semibold">Review decision</h2>
            <div className="grid gap-3">
              {application?.id ? <>
                <form action={updateCreatorReviewStatus}><input type="hidden" name="creator_account_id" value={creator.id} /><input type="hidden" name="application_id" value={application.id} /><input type="hidden" name="account_status" value="applicant" /><input type="hidden" name="application_status" value="reviewing" /><Button type="submit" variant="outline" className="w-full">Mark as reviewing</Button></form>
                <form action={updateCreatorReviewStatus}><input type="hidden" name="creator_account_id" value={creator.id} /><input type="hidden" name="application_id" value={application.id} /><input type="hidden" name="account_status" value="approved" /><input type="hidden" name="application_status" value="approved" /><Button type="submit" className="w-full">Approve creator</Button></form>
                <form action={updateCreatorReviewStatus}><input type="hidden" name="creator_account_id" value={creator.id} /><input type="hidden" name="application_id" value={application.id} /><input type="hidden" name="account_status" value="rejected" /><input type="hidden" name="application_status" value="rejected" /><Button type="submit" variant="destructive" className="w-full">Reject creator</Button></form>
              </> : <div className="text-sm text-muted">No application exists yet.</div>}
              <div className="my-1 border-t border-border" />
              <form action={updateCreatorReviewStatus}><input type="hidden" name="creator_account_id" value={creator.id} /><input type="hidden" name="application_id" value={application?.id || ""} /><input type="hidden" name="account_status" value="paused" /><input type="hidden" name="application_status" value={application?.status || ""} /><Button type="submit" variant="outline" className="w-full">Pause account</Button></form>
              <form action={updateCreatorReviewStatus}><input type="hidden" name="creator_account_id" value={creator.id} /><input type="hidden" name="application_id" value={application?.id || ""} /><input type="hidden" name="account_status" value="archived" /><input type="hidden" name="application_status" value={application?.status || ""} /><Button type="submit" variant="outline" className="w-full">Archive account</Button></form>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-4 text-lg font-semibold">Clone link</h2>
            <form action={linkCreatorClone} className="grid gap-3">
              <input type="hidden" name="creator_account_id" value={creator.id} />
              <select name="clone_id" defaultValue={link?.clone_id || ""} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">
                <option value="">Not linked</option>
                {clones.map((clone) => <option key={clone.id} value={clone.id}>{clone.name} / {clone.slug}</option>)}
              </select>
              <Button type="submit" variant="outline">Save clone link</Button>
            </form>
          </Card>

          <Card className="p-5">
            <h2 className="mb-4 text-lg font-semibold">Agency assignment</h2>
            <form action={assignCreatorAgency} className="grid gap-3">
              <input type="hidden" name="creator_account_id" value={creator.id} />
              <select name="agency_id" defaultValue={assignment?.agency_id || ""} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">
                <option value="">FLIRT Direct</option>
                {agencies.map((agency) => <option key={agency.id} value={agency.id}>{agency.name}</option>)}
              </select>
              <Button type="submit" variant="outline">Save agency</Button>
            </form>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-lg font-semibold">Consent</h2>
            {consent ? <div className="grid gap-2 text-sm"><div><span className="text-muted">Legal name: </span>{consent.legal_name}</div><div><span className="text-muted">Version: </span>{consent.consent_version}</div><div><span className="text-muted">Signed: </span>{new Date(consent.signed_at).toLocaleString("en-AU")}</div></div> : <div className="text-sm text-muted">No consent record.</div>}
          </Card>
        </div>
      </div>
    </div>
  );
}
