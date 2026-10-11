import { contentFolders, CONTENT_FOLDER_KEY } from "@/lib/creator-content-intake";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAgencyOnboardingAccess, assignedCreatorAccount } from "@/lib/agency-onboarding-access";
import { serviceClient } from "@/lib/supabase-service";
import { flirtClonePipelineEnabled } from "@/lib/flirt-clone-build";
import { RESULT_MESSAGES } from "@/lib/flirt-clone-outcome";
import type { CreatorUpload } from "@/lib/creator-upload-display";
import UploadedContent from "./UploadedContent";

export const dynamic = "force-dynamic";

async function accountUploads(accountId: string): Promise<CreatorUpload[]> {
  const files: CreatorUpload[] = [];
  const db = serviceClient();
  // Read metadata in pages so larger submissions are not silently truncated by
  // the database's default row limit. Media bytes load only when viewed.
  for (let start = 0; ; start += 500) {
    const { data, error } = await db.from("creator_files")
      .select("id,kind,original_name,mime_type,size_bytes,storage_transfer_status")
      .eq("creator_account_id", accountId)
      .order("created_at", { ascending: false }).order("id", { ascending: false })
      .range(start, start + 499);
    if (error) throw new Error("Creator uploads are unavailable");
    files.push(...(data ?? []));
    if (!data || data.length < 500) return files;
  }
}

export default async function CreatorAccount({params, searchParams}: {
  params: Promise<{id:string}>;
  searchParams: Promise<{result?:string}>;
}) {
  const access = await getAgencyOnboardingAccess();
  if (!access) redirect("/login");
  const {id} = await params;
  if (!await assignedCreatorAccount(access, id)) notFound();
  const db = serviceClient();
  const [account, application, files, consent, link] = await Promise.all([
    db.from("creator_accounts").select("id,display_name,email,account_status,updated_at").eq("id",id).maybeSingle(),
    db.from("creator_applications").select("status,answers,submitted_at").eq("creator_account_id",id).order("created_at",{ascending:false}).limit(1).maybeSingle(),
    accountUploads(id),
    db.from("creator_consents").select("signed_at,consent_version").eq("creator_account_id",id).order("created_at",{ascending:false}).limit(1).maybeSingle(),
    db.from("creator_clone_links").select("twin_slug").eq("creator_account_id",id).maybeSingle(),
  ]);
  if ([account,application,consent,link].some(result=>result.error)) throw new Error("Creator onboarding details are unavailable");
  if (!account.data) notFound();
  const creator = account.data;
  const {result} = await searchParams;
  const answers = application.data?.answers && typeof application.data.answers === "object" ? application.data.answers as Record<string,unknown> : {};
  const pipelineOn = flirtClonePipelineEnabled();
  const slug = link.data?.twin_slug || null;
  const ready = application.data?.status === "approved" && creator.account_status === "approved" && !!consent.data;
  return <main className="dashboard-page max-w-4xl space-y-6 text-ink">
    <Link href="/agency/creators" className="text-sm text-accent">← Creator accounts</Link>
    <div><h1 className="creator-name text-2xl font-semibold">{creator.display_name || "New creator"}</h1><p className="mt-1 text-sm text-muted">{creator.email}</p></div>
    {result && <p role="status">{RESULT_MESSAGES[result] ?? "Unable to save this profile."}</p>}
    <UploadedContent accountId={id} files={files} />
    <form action="/agency/creators/manage" method="post" className="space-y-3 rounded-xl border border-line bg-panel p-5">
      <input type="hidden" name="creator_account_id" value={id}/><input type="hidden" name="revision" value={creator.updated_at}/>
      <label className="block text-sm font-medium">Display name<input name="display_name" required maxLength={120} defaultValue={creator.display_name || ""} className="mt-2 block w-full rounded-lg border border-line p-3"/></label>
      <button className="rounded-lg bg-accent px-4 py-2 text-white">Save profile</button>
      <p className="text-xs text-muted">Saves the display name only. You do not need to save or approve this account to view its uploads.</p>
    </form>
    <form action="/agency/creators/review" method="post" className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel p-5">
      <input type="hidden" name="creator_account_id" value={id}/>
      <span className="mr-2 text-sm font-medium">Application decision</span>
      <button name="decision" value="reviewing" className="rounded-lg border border-line px-4 py-2">Mark reviewing</button>
      <button name="decision" value="approve" className="rounded-lg bg-accent px-4 py-2 text-white">Approve</button>
      <button name="decision" value="reject" className="rounded-lg border border-line px-4 py-2">Reject</button>
      <p className="basis-full text-xs text-muted">Approving records the decision{pipelineOn ? " and builds a paused clone in Twin when consent is on file" : " only. It does not create a bot or activate the creator"}. Rejecting blocks their sign-in.</p>
    </form>
    {pipelineOn && <section className="rounded-xl border border-line bg-panel p-5">
      <h2 className="mb-3 font-semibold">Clone build</h2>
      <p className="text-sm">{slug ? <>Clone <strong>{slug}</strong> exists in Twin. It stays paused until you finish the checklist.</> : ready ? "Ready to build." : "Not ready: needs an approved application and a signed consent."}</p>
      {!slug && <form action="/agency/creators/build-clone" method="post" className="mt-3"><input type="hidden" name="creator_account_id" value={id}/><button disabled={!ready} className="rounded-lg bg-accent px-4 py-2 text-white disabled:opacity-50">Build clone</button></form>}
      {slug && <>
        <p className="mt-3 text-sm"><a className="text-accent" href={`/agency/creators/build-packet?id=${id}`}>Open hand-off packet (answers and upload download links)</a></p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
          <li>Open the Twin dashboard and find the clone {slug}.</li>
          <li>Create her bot in BotFather, paste the token into Bot token, save.</li>
          <li>Upload her photos and videos on the clone Media page. Captions and prices are set there.</li>
          <li>Press Compile persona, then read what it produced.</li>
          <li>Push the fleet defaults to this clone from Settings.</li>
          <li>Send yourself a test message in the bot. When it is right, set status to Active.</li>
        </ol></>}
    </section>}
    <section className="rounded-xl border border-line bg-panel p-5"><h2 className="mb-3 font-semibold">Onboarding status</h2><dl className="grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-muted">Account</dt><dd className="capitalize">{creator.account_status}</dd></div><div><dt className="text-muted">Application</dt><dd className="capitalize">{application.data?.status || "Not started"}</dd></div><div><dt className="text-muted">Consent</dt><dd>{consent.data ? "Recorded" : "Not provided"}</dd></div></dl><p className="mt-4 text-sm text-muted">Submitting onboarding creates an application. Bot setup and activation are separate.</p></section>
    {contentFolders(answers).length > 0 && <div className="mb-5 rounded-xl border border-border p-4"><h3 className="font-semibold">Folders awaiting import</h3><p className="mt-1 text-sm text-muted">Review and import these into this creator’s private content. Folder links are not verified uploads.</p><ul className="mt-3 space-y-2">{contentFolders(answers).map(folder => <li key={folder.url}><a href={folder.url} target="_blank" rel="noopener noreferrer" className="break-all text-sm text-accent underline">{folder.provider}: {folder.url}</a></li>)}</ul></div>}
    <section className="rounded-xl border border-line bg-panel p-5"><h2 className="mb-3 font-semibold">Questionnaire</h2>{Object.keys(answers).length ? <dl className="space-y-4">{Object.entries(answers).filter(([key]) => key !== CONTENT_FOLDER_KEY).map(([key,value])=><div key={key}><dt className="text-sm font-medium capitalize">{key.replace(/_/g," ")}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm text-muted">{typeof value === "string" ? value : JSON.stringify(value)}</dd></div>)}</dl> : <p className="text-sm text-muted">No answers provided yet.</p>}</section>
  </main>;
}

