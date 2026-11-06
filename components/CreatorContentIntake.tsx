"use client";

import { useFlirtCreatorLocale } from "@/components/FlirtCreatorLocale";
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
export default function CreatorContentIntake({ locked, loginPath, savedPhotos, savedVideos, initialFolders = [] }: {
  locked: boolean; loginPath: string; savedPhotos: number; savedVideos: number; initialFolders?: ContentFolder[];
}) {
  const queue = useContentUploads();
  const { t, locale } = useFlirtCreatorLocale();
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
  if (!queue) return <p role="alert">{t("The uploader could not start. Refresh this page to try again.", "Não foi possível iniciar o envio. Atualize a página para tentar novamente.")}</p>;
  const folder = queue.folder;
  const folders = folder.folders ?? initialFolders;
  const saved = queue.items.filter(item => item.state === "saved").length;
  const selected = queue.items.length > 0 || total > 0 || folders.length > 0;
  const attention = queue.items.some(item => item.state === "failed" || item.state === "reselect");
  const picker = (<label data-upload-content className={`${selected ? styles.addTile : buttonVariants({ size: "lg" })} ${styles.picker} ${locked ? "opacity-50" : "cursor-pointer"}`}>
      {selected ? <Plus size={20} aria-hidden="true" /> : <Upload size={20} aria-hidden="true" />}{selected ? t("Add more", "Adicionar mais") : t("Upload photos & videos", "Enviar fotos e vídeos")}
      <input id="creator-content-files" type="file" accept="image/*,video/*" multiple disabled={locked} aria-label={t("Add photos and videos", "Adicionar fotos e vídeos")} className="absolute inset-0 size-full cursor-pointer opacity-0" onChange={event => { if (locked) return; const files = Array.from(event.target.files || []); setNotice(files.length ? "" : t("No new files were received from your phone. Your saved content is safe.", "Não recebemos novos arquivos do seu celular. Seu conteúdo salvo continua disponível.")); queue.add(files); event.target.value = ""; }} />
    </label>);
  return <div className={styles.root} data-combined-content-intake>
    <header className={styles.heading}>
      <h1 data-setup-heading>{t("Follow these two simple steps to create your AI clone.", "Crie sua IA em duas etapas simples.")}</h1>
      <p>{t(`Upload at least ${CREATOR_CONTENT_TARGET} photos and videos combined.`, `Envie pelo menos ${CREATOR_CONTENT_TARGET} arquivos entre fotos e vídeos.`)}</p>
      <p className={styles.hint}>{t("Include everyday content, plus explicit content if applicable.", "Inclua conteúdo do dia a dia e, se for o caso, conteúdo explícito.")}</p>
    </header>
    <section className={`${styles.contentCard} ${!selected ? styles.emptyCard : ""}`} aria-label={t("Your content", "Seu conteúdo")}>
      {selected && <div className={styles.uploadStatus} role="status">
        <h2>{t("Your content", "Seu conteúdo")}</h2>
        <span>{t(`${total} of ${CREATOR_CONTENT_TARGET} uploaded`, `${total.toLocaleString(locale)} de ${CREATOR_CONTENT_TARGET} enviados`)}</span>
        <progress max={CREATOR_CONTENT_TARGET} value={Math.min(total, CREATOR_CONTENT_TARGET)} aria-label={t("Saved content toward 50 files", "Progresso até a meta de 50 arquivos")} />
        {queue.working && <p className={styles.hint}>{t(`${saved} of ${queue.items.length} files saved in this selection`, `${saved.toLocaleString(locale)} de ${queue.items.length.toLocaleString(locale)} arquivos desta seleção foram salvos`)}</p>}
      </div>}
      {!selected ? <>
        <ImagePlus className={styles.emptyIcon} size={52} strokeWidth={1.5} aria-hidden="true" />
        {picker}
        <p className={styles.pickerHint}>{t("Choose multiple files from your phone.", "Selecione vários arquivos no seu celular.")}</p>
        <p className={styles.fileLimits}>{t("Photos up to 75 MiB · Videos up to 512 MiB", "Fotos de até 75 MiB · Vídeos de até 512 MiB")}</p>
      </> : <CreatorSavedContentPreview revision={`${savedPhotos + savedVideos}:${queue.revision}`} items={queue.items} total={savedPhotos + savedVideos} loginPath={loginPath} onCounts={setLiveCounts} onRemoved={queue.remove}>{picker}</CreatorSavedContentPreview>}
      {folders.length > 0 && <p className={styles.hint}>{t("Folder link received. Awaiting import.", "Link da pasta recebido. Aguardando importação.")}</p>}
    </section>
    {!selected && <div className={`${styles.uploadStatus} ${styles.emptyStatus}`} role="status">
      <div className={styles.statusLine}><strong>{t(`0 of ${CREATOR_CONTENT_TARGET} uploaded`, `0 de ${CREATOR_CONTENT_TARGET} enviados`)}</strong><span>{t("No content added yet", "Nenhum conteúdo adicionado")}</span></div>
      <progress max={CREATOR_CONTENT_TARGET} value={0} aria-label={t("Saved content toward 50 files", "Progresso até a meta de 50 arquivos")} />
    </div>}
    {notice && <p role="status">{t("No new files were received from your phone. Your saved content is safe.", "Não recebemos novos arquivos do seu celular. Seu conteúdo salvo continua disponível.")}</p>}
    <details className={styles.folder}><summary><Link2 size={20} aria-hidden="true" /> {t("Use a folder link", "Usar link de uma pasta")}<ChevronRight className={styles.folderChevron} size={18} aria-hidden="true" /></summary>
      <label className="mt-3 block text-sm font-medium">{t("Google Drive or Dropbox folder", "Pasta do Google Drive ou Dropbox")}<Input type="url" value={folder.draft} disabled={locked} placeholder="https://drive.google.com/drive/folders/…" onChange={event => folder.setDraft(event.target.value)} onBlur={() => { void folder.save(); }} /></label>
      <p className="mt-2 text-xs text-muted">{t("Share a folder your agency can open. Your agency will import the files; a link does not count as saved content yet.", "Compartilhe uma pasta que sua agência consiga abrir. A equipe vai importar os arquivos. O link só passa a contar como conteúdo salvo depois da importação.")}</p>
      {folder.status && <p role={folder.error ? "alert" : "status"} className="mt-3 text-sm">{folder.status}{folder.error && <button type="button" className="ml-2 min-h-11 underline" onClick={() => { void folder.save(); }}>{t("Retry", "Tentar novamente")}</button>}</p>}
      {folders.length > 0 && <ul className="mt-3 space-y-2 text-sm">{folders.map(folder => <li key={folder.url}><a className="break-all underline" href={folder.url} target="_blank" rel="noopener noreferrer">{t(`${folder.provider} folder`, `Pasta do ${folder.provider}`)}</a><span className="ml-2">{t("Awaiting import", "Aguardando importação")}</span></li>)}</ul>}
    </details>
    <div className={styles.handoff} data-content-questionnaire-handoff>
      <p>{t("You can answer the questions while your files upload.", "Você pode responder às perguntas enquanto os arquivos são enviados.")}</p>
      {queue.working && <p className={styles.hint}>{t("Keep this browser open. Your uploads continue while you answer.", "Mantenha o navegador aberto. O envio continua enquanto você responde.")}</p>}
      {attention && <p className={styles.hint}>{t("Some files need attention. Open Upload details below to retry.", "Alguns arquivos precisam de atenção. Abra Detalhes do envio abaixo para tentar novamente.")}</p>}
      <Button type="button" variant={selected ? "default" : "outline"} className={`${styles.primary} ${!selected ? styles.secondary : ""}`} onClick={() => navigateCreatorSetup("/creator/onboarding?step=questionnaire", router?.push)}>{t("Continue to questions →", "Continuar para o questionário →")}</Button>
    </div>
    {queue.items.length > 0 && <details className={styles.queueDetails} open={attention || undefined} aria-label={t("Upload queue", "Fila de envio")}><summary>{t("Upload details", "Detalhes do envio")}{attention ? t(", action needed", ", ação necessária") : ""}</summary>
      <ul className="max-h-96 space-y-3 overflow-y-auto">
        {queue.items.map(item => <li key={item.id} className="flex items-start gap-3 rounded-xl border border-border p-3"><Thumbnail item={item} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" title={item.name}>{item.name}</p>
          <p className={`mt-1 text-sm ${item.state === "failed" || item.state === "reselect" ? "text-rose-700" : "text-muted"}`}>{item.state === "saved" ? t("Saved", "Salvo") : item.error || (item.state === "saving" ? t("Saving…", "Salvando…") : item.state === "uploading" ? t(`Uploading ${item.percent}%`, `Enviando: ${item.percent}%`) : t("Waiting to upload", "Aguardando envio"))}</p>
          {item.state === "uploading" && <progress value={item.percent} max={100} aria-label={t(`Uploading ${item.name}`, `Enviando ${item.name}`)} className="mt-2 h-2 w-full accent-accent" />}
          {item.state === "failed" && item.file && <Button type="button" variant="outline" className="mt-2 min-h-11" onClick={() => queue.retry(item.id)}><RotateCcw size={14} /> {t("Retry", "Tentar novamente")}</Button>}
          {item.state === "reselect" && <p className="mt-1 text-xs">{t("Use Add more to reselect the original. Saved files will be checked and skipped.", "Use Adicionar mais para selecionar o arquivo original. Os arquivos já salvos serão identificados e ignorados.")}</p>}
          {["failed", "reselect", "queued"].includes(item.state) && <button type="button" className="ml-3 min-h-11 text-sm underline" onClick={() => queue.remove(item.id)}>{t("Remove from selection", "Remover da seleção")}</button>}
        </div>{item.state === "saved" && <Check className="size-5 shrink-0 text-emerald-700" aria-label={t("Saved", "Salvo")} />}</li>)}
      </ul>
    </details>}
    <details className={styles.help}><summary className="min-h-11 cursor-pointer py-3"><CircleHelp size={16} aria-hidden="true" /> {t("Need help?", "Precisa de ajuda?")}</summary>
      <ol className={styles.helpSteps}>
        <li>{t("Choose your photos and videos. You can select several at once.", "Escolha suas fotos e vídeos. Você pode selecionar vários arquivos de uma vez.")}</li>
        <li>{t("Continue to the questions while your content uploads.", "Continue para o questionário enquanto seu conteúdo é enviado.")}</li>
        <li>{t("Keep this browser tab open until uploading finishes.", "Mantenha esta aba aberta até o fim do envio.")}</li>
      </ol>
      <p className="mb-3">{t("Added the wrong file? Tap its picture, then Remove file.", "Adicionou o arquivo errado? Toque na miniatura e depois em Remover arquivo.")}</p>
      <p className="mb-2">{t("Can’t find your photos? Try choosing from Files.", "Não encontra suas fotos? Tente selecionar pelo app Arquivos.")}</p>
      <label className={`${buttonVariants({ variant: "outline" })} relative min-h-11 overflow-hidden`}>{t("Choose from Files", "Selecionar pelo app Arquivos")}<input type="file" accept="application/octet-stream" multiple disabled={locked} aria-label={t("Choose photos and videos from Files", "Selecionar fotos e vídeos pelo app Arquivos")} className="absolute inset-0 size-full opacity-0" onChange={event => { if (locked) return; queue.add(Array.from(event.target.files || [])); event.target.value = ""; }} /></label>
      <details className={styles.formatHelp}><summary>{t("File types and sizes", "Tipos e tamanhos de arquivo")}</summary><p>{t("Photos: JPG, PNG, WebP or GIF, up to 75 MiB. Videos: MP4, MOV or WebM, up to 512 MiB, 30 minutes and 4K. If an iPhone photo won’t upload, save a JPG copy and try again.", "Fotos: JPG, PNG, WebP ou GIF, até 75 MiB. Vídeos: MP4, MOV ou WebM, até 512 MiB, 30 minutos e 4K. Se uma foto do iPhone não for enviada, salve uma cópia em JPG e tente novamente.")}</p></details>
    </details>
  </div>;
}
