"use client";
import { useContext, useEffect, useState } from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { Upload, ImageIcon, ImagePlus, Film, Check, RotateCcw, Plus, Link2, CircleHelp, ChevronRight } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CreatorSavedContentPreview, { type ContentCounts } from "./CreatorSavedContentPreview";
import { useContentUploads, type ContentUploadItem } from "./CreatorContentUploadProvider";
import { CREATOR_CONTENT_TARGET, contentMediaKind, type ContentFolder } from "@/lib/creator-content-intake";
import styles from "./CreatorContentIntake.module.css";
import { navigateCreatorSetup } from "@/lib/creator-setup-navigation";

function Thumbnail({ item }: { item: ContentUploadItem }) {
  const [url, setUrl] = useState("");
  useEffect(() => { if (!item.file) return; const src = URL.createObjectURL(item.file); setUrl(src); return () => URL.revokeObjectURL(src); }, [item.file]);
  const video = contentMediaKind(item.file || { name: item.name }) === "video";
  return <div className={styles.thumbnail}>
    {url ? video ? <video src={url} muted playsInline preload="metadata" className="size-full object-cover" aria-label={item.name} /> : <img src={url} alt={item.name} className="size-full object-cover" /> : video ? <Film aria-hidden="true" /> : <ImageIcon aria-hidden="true" />}
  </div>;
}
export default function CreatorContentIntake({ locked, loginPath, savedPhotos, savedVideos, initialFolders = [], moxy = false, submitted = false }: {
  locked: boolean; loginPath: string; savedPhotos: number; savedVideos: number; initialFolders?: ContentFolder[]; moxy?: boolean; submitted?: boolean;
}) {
  const queue = useContentUploads();
  const router = useContext(AppRouterContext);
  const [notice, setNotice] = useState("");
  const [liveCounts, setLiveCounts] = useState<ContentCounts | null>(null);
  const total = liveCounts?.saved ?? (savedPhotos + savedVideos);
  useEffect(() => {
    const navigate = (event: Event) => {
      const href = (event as CustomEvent<{ href: string }>).detail?.href;
      if (!href || !queue?.folderPending) return;
      event.preventDefault();
      // Load the questionnaire only after its shared application revision is saved.
      void queue.folder.save().then(saved => {
        if (!saved) return;
        if (router && href.startsWith("/creator/onboarding")) router.push(href);
        else window.location.assign(href);
      });
    };
    window.addEventListener("creator-setup:navigate", navigate);
    return () => window.removeEventListener("creator-setup:navigate", navigate);
  }, [queue, router]);
  if (!queue) return <p role="alert">The uploader could not start. Refresh this page to try again.</p>;
  const folder = queue.folder;
  const folders = folder.folders ?? initialFolders;
  const saved = queue.items.filter(item => item.state === "saved").length;
  const selected = queue.items.length > 0 || total > 0 || folders.length > 0;
  const attention = queue.items.some(item => item.state === "failed" || item.state === "reselect");
  const picker = (<label data-upload-content className={`${selected ? styles.addTile : buttonVariants({ size: "lg" })} ${styles.picker} ${locked ? "opacity-50" : "cursor-pointer"}`}>
      {selected ? <Plus size={20} aria-hidden="true" /> : <Upload size={20} aria-hidden="true" />}{selected ? "Add more" : "Upload photos & videos"}
      <input id="creator-content-files" type="file" accept="image/*,video/*" multiple disabled={locked} aria-label="Add photos and videos" className="absolute inset-0 size-full cursor-pointer opacity-0" onChange={event => { if (locked) return; const files = Array.from(event.target.files || []); setNotice(files.length ? "" : "No new files were received from your phone. Your saved content is safe."); queue.add(files); event.target.value = ""; }} />
    </label>);
  return <div className={styles.root} data-combined-content-intake>
    <header className={styles.heading}>
      {moxy ? <h2 data-content-title>{submitted ? "Your content library" : "Start with a little you."}</h2> : <h1 data-setup-heading>Follow these two simple steps to create your AI clone.</h1>}
      <p>{moxy && submitted ? "Your saved photos and videos. Add more whenever you’re ready." : <>Upload at least {CREATOR_CONTENT_TARGET} photos and videos combined.</>}</p>
      {!submitted && <p className={styles.hint}>Include everyday content, plus explicit content if applicable.</p>}
    </header>
    <section className={`${styles.contentCard} ${!selected ? styles.emptyCard : ""}`} aria-label="Your content">
      {selected && <div className={styles.uploadStatus} role="status">
        <h2>Your content</h2>
        <span>{total} of {CREATOR_CONTENT_TARGET} uploaded</span>
        <progress max={CREATOR_CONTENT_TARGET} value={Math.min(total, CREATOR_CONTENT_TARGET)} aria-label="Saved content toward 50 files" />
        {queue.working && <p className={styles.hint}>{saved} of {queue.items.length} files saved in this selection</p>}
      </div>}
      {!selected ? <>
        <ImagePlus className={styles.emptyIcon} size={52} strokeWidth={1.5} aria-hidden="true" />
        {picker}
        <p className={styles.pickerHint}>Choose multiple files from your phone.</p>
        <p className={styles.fileLimits}>Photos up to 75 MiB · Videos up to 512 MiB</p>
      </> : <CreatorSavedContentPreview revision={`${savedPhotos + savedVideos}:${queue.revision}`} items={queue.items} total={savedPhotos + savedVideos} loginPath={loginPath} onCounts={setLiveCounts} onRemoved={queue.remove}>{picker}</CreatorSavedContentPreview>}
      {folders.length > 0 && <p className={styles.hint}>Folder link received. Awaiting import.</p>}
    </section>
    {!selected && <div className={`${styles.uploadStatus} ${styles.emptyStatus}`} role="status">
      <div className={styles.statusLine}><strong>0 of {CREATOR_CONTENT_TARGET} uploaded</strong><span>No content added yet</span></div>
      <progress max={CREATOR_CONTENT_TARGET} value={0} aria-label="Saved content toward 50 files" />
    </div>}
    {notice && <p role="status">{notice}</p>}
    <details className={styles.folder}><summary><Link2 size={20} aria-hidden="true" /> Use a folder link<ChevronRight className={styles.folderChevron} size={18} aria-hidden="true" /></summary>
      <label className="mt-3 block text-sm font-medium">Google Drive or Dropbox folder<Input type="url" value={folder.draft} disabled={locked} placeholder="https://drive.google.com/drive/folders/…" onChange={event => folder.setDraft(event.target.value)} onBlur={() => { void folder.save(); }} /></label>
      <p className="mt-2 text-xs text-muted">Share a folder your agency can open. Your agency will import the files; a link does not count as saved content yet.</p>
      {folder.status && <p role={folder.error ? "alert" : "status"} className="mt-3 text-sm">{folder.status}{folder.error && <button type="button" className="ml-2 min-h-11 underline" onClick={() => { void folder.save(); }}>Retry</button>}</p>}
      {folders.length > 0 && <ul className="mt-3 space-y-2 text-sm">{folders.map(folder => <li key={folder.url}><a className="break-all underline" href={folder.url} target="_blank" rel="noopener noreferrer">{folder.provider} folder</a><span className="ml-2">Awaiting import</span></li>)}</ul>}
    </details>
    <div className={styles.handoff} data-content-questionnaire-handoff>
      <p>{moxy && submitted ? "Your profile stays available while your content uploads." : "You can answer the questions while your files upload."}</p>
      {queue.working && <p className={styles.hint}>Keep this browser open. Your uploads continue while you answer.</p>}
      {attention && <p className={styles.hint}>Some files need attention. Open Upload details below to retry.</p>}
      <Button type="button" variant={selected ? "default" : "outline"} className={`${styles.primary} ${!selected ? styles.secondary : ""}`} onClick={() => navigateCreatorSetup("/creator/onboarding?step=questionnaire", router?.push)}>{moxy ? "Go to profile →" : "Continue to questions →"}</Button>
    </div>
    {queue.items.length > 0 && <details className={styles.queueDetails} open={attention || undefined} aria-label="Upload queue"><summary>Upload details{attention ? ", action needed" : ""}</summary>
      <ul className="max-h-96 space-y-3 overflow-y-auto">
        {queue.items.map(item => <li key={item.id} className="flex items-start gap-3 rounded-xl border border-border p-3"><Thumbnail item={item} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" title={item.name}>{item.name}</p>
          <p className={`mt-1 text-sm ${item.state === "failed" || item.state === "reselect" ? "text-rose-700" : "text-muted"}`}>{item.state === "saved" ? "Saved" : item.error || (item.state === "saving" ? "Saving…" : item.state === "uploading" ? `Uploading ${item.percent}%` : "Waiting to upload")}</p>
          {item.state === "uploading" && <progress value={item.percent} max={100} aria-label={`Uploading ${item.name}`} className="mt-2 h-2 w-full accent-accent" />}
          {item.state === "failed" && item.file && <Button type="button" variant="outline" className="mt-2 min-h-11" onClick={() => queue.retry(item.id)}><RotateCcw size={14} /> Retry</Button>}
          {item.state === "reselect" && <p className="mt-1 text-xs">Use Add more to reselect the original. Saved files will be checked and skipped.</p>}
          {["failed", "reselect", "queued"].includes(item.state) && <button type="button" className="ml-3 min-h-11 text-sm underline" onClick={() => queue.remove(item.id)}>Remove from selection</button>}
        </div>{item.state === "saved" && <Check className="size-5 shrink-0 text-emerald-700" aria-label="Saved" />}</li>)}
      </ul>
    </details>}
    <details className={styles.help}><summary className="min-h-11 cursor-pointer py-3"><CircleHelp size={16} aria-hidden="true" /> Need help?</summary>
      <ol className={styles.helpSteps}>
        <li>Choose your photos and videos. You can select several at once.</li>
        <li>Continue to the questions while your content uploads.</li>
        <li>Keep this browser tab open until uploading finishes.</li>
      </ol>
      <p className="mb-3">Added the wrong file? Tap its picture, then Remove file.</p>
      <p className="mb-2">Can’t find your photos? Try choosing from Files.</p>
      <label className={`${buttonVariants({ variant: "outline" })} relative min-h-11 overflow-hidden`}>Choose from Files<input type="file" accept="application/octet-stream" multiple disabled={locked} aria-label="Choose photos and videos from Files" className="absolute inset-0 size-full opacity-0" onChange={event => { if (locked) return; queue.add(Array.from(event.target.files || [])); event.target.value = ""; }} /></label>
      <details className={styles.formatHelp}><summary>File types and sizes</summary><p>Photos: JPG, PNG, WebP or GIF, up to 75 MiB. Videos: MP4, MOV or WebM, up to 512 MiB, 30 minutes and 4K. If an iPhone photo won’t upload, save a JPG copy and try again.</p></details>
    </details>
  </div>;
}
