"use client";
import { useContext, useEffect, useState } from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { Upload, ImageIcon, Film, Check, RotateCcw, Plus, Link2, CircleHelp } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CreatorContentGallery from "./CreatorContentGallery";
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
export default function CreatorContentIntake({ locked, loginPath, savedPhotos, savedVideos, initialFolders = [] }: {
  locked: boolean; loginPath: string; savedPhotos: number; savedVideos: number; initialFolders?: ContentFolder[];
}) {
  const queue = useContentUploads();
  const router = useContext(AppRouterContext);
  const [notice, setNotice] = useState("");
  const total = savedPhotos + savedVideos;
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
  return <div className={styles.root} data-combined-content-intake>
    <header className={styles.heading}>
      <h1 data-setup-heading>{queue.working ? "Your content is uploading" : attention ? "Some files need attention" : selected ? "Your content" : "Let’s set up your AI."}</h1>
      {!selected && <><p>Choose at least {CREATOR_CONTENT_TARGET} photos and videos.</p><p className={styles.hint}>Everyday content plus explicit content if applicable.</p></>}
    </header>
    {!selected && <label htmlFor="creator-content-files" className={styles.emptyArt} aria-hidden="true"><div className={styles.artCard}><ImageIcon size={38} strokeWidth={1} /></div><div className={styles.artCard}><Film size={42} strokeWidth={1} /></div><div className={styles.artCard}><ImageIcon size={38} strokeWidth={1} /></div><span className={styles.artPlus}><Plus size={24} /></span></label>}
    {queue.items.length > 0 && <div className={styles.previewGrid} aria-label="Selected content previews">{queue.items.slice(0, 6).map((item, index) => <div key={item.id} className={styles.previewTile}><Thumbnail item={item} /><span className={styles.tileState}>{index === 5 && queue.items.length > 6 ? `+${queue.items.length - 6}` : item.state === "saved" ? <Check size={16} aria-label="Saved" /> : item.state === "failed" || item.state === "reselect" ? "!" : item.state === "uploading" ? `${item.percent}%` : "…"}</span></div>)}</div>}
    {selected && <div className={styles.uploadStatus} role="status"><span>{queue.items.length ? `${saved} of ${queue.items.length} files saved` : total ? `${total} files uploaded` : "Folder link received"}</span>{queue.working && <progress max={queue.items.length} value={saved} aria-label="Files saved from this selection" />}</div>}
    {selected && <div data-content-questionnaire-handoff>
      {queue.working && <p className={styles.hint}>Keep this browser open. Your uploads continue while you answer.</p>}
      {attention && <p className={styles.hint}>Review the files below. You can still continue to your questions.</p>}
      <Button type="button" className={styles.primary} onClick={() => navigateCreatorSetup("/creator/onboarding?step=questionnaire", router?.push)}>Continue to questions →</Button>
    </div>}
    <label data-upload-content className={`${buttonVariants({ size: "lg", variant: selected ? "outline" : "default" })} ${styles.picker} ${locked ? "opacity-50" : "cursor-pointer"}`}>
      {selected ? <Plus size={20} aria-hidden="true" /> : <Upload size={20} aria-hidden="true" />}{selected ? "Add more files" : "Choose photos & videos"}
      <input id="creator-content-files" type="file" accept="image/*,video/*" multiple disabled={locked} aria-label="Add photos and videos" className="absolute inset-0 size-full cursor-pointer opacity-0" onChange={event => { if (locked) return; const files = Array.from(event.target.files || []); setNotice(files.length ? "" : "No new files were received from your phone. Your saved content is safe."); queue.add(files); event.target.value = ""; }} />
    </label>
    {notice && <p role="status">{notice}</p>}
    {queue.items.length > 0 && <details className={styles.queueDetails} open={attention || undefined} aria-label="Upload queue"><summary>Upload details{attention ? " — action needed" : ""}</summary>
      <ul className="max-h-96 space-y-3 overflow-y-auto">
        {queue.items.map(item => <li key={item.id} className="flex items-start gap-3 rounded-xl border border-border p-3"><Thumbnail item={item} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" title={item.name}>{item.name}</p>
          <p className={`mt-1 text-sm ${item.state === "failed" || item.state === "reselect" ? "text-rose-700" : "text-muted"}`}>{item.state === "saved" ? "Saved" : item.error || (item.state === "saving" ? "Saving…" : item.state === "uploading" ? `Uploading ${item.percent}%` : "Waiting to upload")}</p>
          {item.state === "uploading" && <progress value={item.percent} max={100} aria-label={`Uploading ${item.name}`} className="mt-2 h-2 w-full accent-accent" />}
          {item.state === "failed" && item.file && <Button type="button" variant="outline" className="mt-2 min-h-11" onClick={() => queue.retry(item.id)}><RotateCcw size={14} /> Retry</Button>}
          {item.state === "reselect" && <p className="mt-1 text-xs">Use Add more files to reselect the original. Saved files will be checked and skipped.</p>}
          {["failed", "reselect", "queued"].includes(item.state) && <button type="button" className="ml-3 min-h-11 text-sm underline" onClick={() => queue.remove(item.id)}>Remove from selection</button>}
        </div>{item.state === "saved" && <Check className="size-5 shrink-0 text-emerald-700" aria-label="Saved" />}</li>)}
      </ul>
    </details>}
    <details className={styles.folder}><summary><Link2 size={18} aria-hidden="true" /> Use a folder link</summary>
      <label className="mt-3 block text-sm font-medium">Google Drive or Dropbox folder<Input type="url" value={folder.draft} disabled={locked} placeholder="https://drive.google.com/drive/folders/…" onChange={event => folder.setDraft(event.target.value)} onBlur={() => { void folder.save(); }} /></label>
      <p className="mt-2 text-xs text-muted">Share a folder your agency can open. Your agency will import the files; a link does not count as saved content yet.</p>
      {folder.status && <p role={folder.error ? "alert" : "status"} className="mt-3 text-sm">{folder.status}{folder.error && <button type="button" className="ml-2 min-h-11 underline" onClick={() => { void folder.save(); }}>Retry</button>}</p>}
      {folders.length > 0 && <ul className="mt-3 space-y-2 text-sm">{folders.map(folder => <li key={folder.url}><a className="break-all underline" href={folder.url} target="_blank" rel="noopener noreferrer">{folder.provider} folder</a><span className="ml-2">Awaiting import</span></li>)}</ul>}
    </details>
    {!selected && <button type="button" className={styles.later} onClick={() => navigateCreatorSetup("/creator/onboarding?step=questionnaire", router?.push)}>Do this later</button>}
    <details className={styles.help}><summary className="min-h-11 cursor-pointer py-3"><CircleHelp size={16} aria-hidden="true" /> Need help?</summary>
      <p className="mb-3">JPG, PNG, WebP or GIF up to 75 MiB; MP4, MOV or WebM up to 512 MiB, 30 minutes and 4K. Export HEIC as JPG. Account allowance: 100 GiB and 5,000 files.</p>
      <label className={`${buttonVariants({ variant: "outline" })} relative min-h-11 overflow-hidden`}>Choose from Files<input type="file" accept="application/octet-stream" multiple disabled={locked} aria-label="Choose photos and videos from Files" className="absolute inset-0 size-full opacity-0" onChange={event => { if (locked) return; queue.add(Array.from(event.target.files || [])); event.target.value = ""; }} /></label>
    </details>
    {total > 0 && <details className={styles.gallery}><summary>View saved content</summary><CreatorContentGallery kind="all_content" revision={`${total}:${queue.revision}`} loginPath={loginPath} /></details>}
  </div>;
}
