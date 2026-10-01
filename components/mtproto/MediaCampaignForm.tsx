"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Field, FieldLabel, Info, Section, inputCls, selectCls } from "@/components/clone/fields";
import { createMediaCampaign, uploadCampaignAsset, type CampaignAsset } from "@/app/mtproto-campaign/media/actions";
import { DEFAULT_DAILY_CAP, HARD_MAX_DAILY_CAP, MAX_RUN_CAP, type CreatorLite } from "@/lib/mtproto/types";
import { validateMessage } from "@/lib/mtproto/media-caption";

type Uploaded = CampaignAsset & { filename: string };
type Role = "free" | "paid";
const buttonCls = "rounded-full border border-line px-4 py-2 text-sm font-semibold disabled:opacity-50";

export default function MediaCampaignForm({ creators }: { creators: CreatorLite[] }) {
  const router = useRouter();
  const id = useRef<string | null>(null);
  const [cloneId, setCloneId] = useState("");
  const [files, setFiles] = useState<Record<Role, Uploaded[]>>({ free: [], paid: [] });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(role: Role, selected: FileList | null) {
    if (!selected?.length || !cloneId || busy) return;
    setError(null);
    const pending = [...selected];
    if (files[role].length + pending.length > 10) { setError("Each group can contain up to 10 files."); return; }
    if (pending.some(f => !f.size || f.size > 49 * 1024 * 1024)) { setError("Each file must be smaller than 49 MB."); return; }
    id.current ??= crypto.randomUUID();
    try {
      for (const [index, file] of pending.entries()) {
        setBusy(`Uploading ${role} file ${index + 1} of ${pending.length}`);
        const fd = new FormData(); fd.set("file", file);
        const result = await uploadCampaignAsset(cloneId, id.current, role === "free", fd);
        if (!result.ok) throw new Error(result.error);
        setFiles(prev => {
          if (prev.free.concat(prev.paid).some(a => a.sha256 === result.value.sha256)) return prev;
          return { ...prev, [role]: [...prev[role], { ...result.value, filename: file.name }] };
        });
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed"); }
    finally { setBusy(null); }
  }

  function move(role: Role, index: number, delta: number) {
    setFiles(prev => {
      const list = [...prev[role]];
      [list[index], list[index + delta]] = [list[index + delta], list[index]];
      return { ...prev, [role]: list };
    });
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    const fd = new FormData(event.currentTarget);
    const previewCaption = String(fd.get("previewCaption") ?? "");
    const paidCaption = String(fd.get("paidCaption") ?? "");
    const validation = validateMessage(previewCaption, 1024, { reviewedCampaignCopy: true });
    if (validation) { setError(`Free caption: ${validation.replaceAll("_", " ")}`); return; }
    if (!files.free.length || !files.paid.length || !id.current) { setError("Upload the free videos and paid bundle before creating the dry run."); return; }
    setBusy("Creating dry run");
    try {
      const result = await createMediaCampaign({
        id: id.current, cloneId, name: String(fd.get("name") ?? ""),
        previews: files.free, paid: files.paid, previewCaption, paidCaption,
        starPrice: Number(fd.get("starPrice")), dailyCap: Number(fd.get("dailyCap")),
        runCap: String(fd.get("runCap") ?? "").trim() ? Number(fd.get("runCap")) : null,
        segment: String(fd.get("segment")) as "lapsed_buyers" | "all_silent",
        allowRecontact: fd.get("allowRecontact") === "on",
      });
      if (!result.ok) throw new Error(result.error);
      router.push(`/mtproto-campaign/runs/${result.value.id}`); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Campaign could not be created"); }
    finally { setBusy(null); }
  }

  function filePicker(role: Role) {
    return <div className="space-y-3">
      <FieldLabel label={`${role === "free" ? "Free videos" : "Paid photos and videos"} (${files[role].length}/10)`} hint={role === "free" ? "Upload 1 to 10 MP4 videos. The caption appears once on the free album. Each file must be smaller than 49 MB." : "Upload 1 to 10 photos or MP4 videos. One Stars payment unlocks the complete bundle. Each file must be smaller than 49 MB."} />
      <input aria-label={role === "free" ? "Upload free videos" : "Upload paid media"} className={inputCls} type="file" multiple accept={role === "free" ? "video/mp4,.mp4" : "image/jpeg,image/png,image/webp,video/mp4,.mp4"} disabled={!cloneId || !!busy || files[role].length >= 10} onChange={event => { void upload(role, event.target.files); event.target.value = ""; }} />
      <ol className="space-y-2">
        {files[role].map((file, index) => <li key={file.path} className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-2 text-sm">
          <span className="min-w-0 flex-1 break-all">{index + 1}. {file.filename}{file.durationSeconds ? ` (${Math.round(file.durationSeconds)}s)` : ""}</span>
          <button type="button" className={buttonCls} disabled={!!busy || index === 0} onClick={() => move(role, index, -1)} aria-label={`Move ${file.filename} earlier`}>↑</button>
          <button type="button" className={buttonCls} disabled={!!busy || index === files[role].length - 1} onClick={() => move(role, index, 1)} aria-label={`Move ${file.filename} later`}>↓</button>
          <button type="button" className={buttonCls} disabled={!!busy} onClick={() => setFiles(prev => ({ ...prev, [role]: prev[role].filter((_, i) => i !== index) }))}>Remove</button>
        </li>)}
      </ol>
    </div>;
  }

  return <form onSubmit={create} className="dashboard-page space-y-5">
    <h1 className="text-2xl font-semibold">Free preview and paid bundle</h1>
    <Section title="Audience and limits" accent="blue" cols={2} tip="Creating runs the audience checks without contacting fans. Review the results before confirming LIVE. Existing cooldown, account and opt-out checks remain active.">
      <div><FieldLabel label="Creator" /><select className={selectCls} required value={cloneId} disabled={!!busy || files.free.length > 0 || files.paid.length > 0} onChange={e => setCloneId(e.target.value)}><option value="">Choose creator</option>{creators.filter(c => c.status === "active").map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <Field label="Campaign name" name="name" required />
      <div><FieldLabel label="Audience" hint="Previous buyers are checked against purchase history. Fans must also pass the existing silence, cooldown and contact checks." /><select className={selectCls} name="segment" defaultValue="lapsed_buyers"><option value="lapsed_buyers">Previous buyers</option><option value="all_silent">All existing silent fans</option></select></div>
      <Field label="Daily cap" name="dailyCap" type="number" defaultValue={DEFAULT_DAILY_CAP} min={1} max={HARD_MAX_DAILY_CAP} step={1} required hint="The lower of this cap and the creator's configured cap applies. Hourly pacing still applies." />
      <Field label="Run cap" name="runCap" type="number" min={1} max={MAX_RUN_CAP} step={1} hint="Leave blank to include all eligible fans. This does not bypass the daily cap." />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="allowRecontact" />Include previously contacted fans<Info text="Allows another campaign for fans contacted before, after the normal cooldown. Blocks and opt-outs still apply." /></label>
    </Section>
    <div className="grid gap-5 lg:grid-cols-2">
      <Section title="1. Free preview" accent="green" tip="These videos are sent together. The paid offer is only sent after a qualifying reply.">
        {filePicker("free")}
        <div><FieldLabel label="Free caption" hint="Exact caption, up to 1,024 characters. No text is generated or rewritten." /><textarea className={`${inputCls} min-h-52`} name="previewCaption" required maxLength={1024} /></div>
      </Section>
      <Section title="2. Locked bundle" accent="purple" tip="The full bundle is delivered as a separate locked message after the fan replies. Its caption and total price remain fixed.">
        {filePicker("paid")}
        <Field label="Total unlock price (Stars)" name="starPrice" type="number" min={1} max={4400} step={1} required />
        <div><FieldLabel label="Paid caption" hint="Exact caption, up to 1,024 characters. No discounts or automatic caption rewrites apply." /><textarea className={`${inputCls} min-h-40`} name="paidCaption" required maxLength={1024} /></div>
      </Section>
    </div>
    {error && <div role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm text-destructive">{error}</div>}
    {busy && <div role="status" className="text-sm">{busy}…</div>}
    <button type="submit" className={`${buttonCls} bg-accent text-accent-ink`} disabled={!!busy || !cloneId || !files.free.length || !files.paid.length}>Create dry run for review</button>
  </form>;
}
