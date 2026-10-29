"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { parseVault, vaultAvailability, vaultDuration, type VaultItem, type VaultRead } from "@/lib/onlyfans/vault";
import VaultAssetPreview from "./VaultAssetPreview";
import VaultOrganization from "./VaultOrganization";
import VaultUploader from "./VaultUploader";
import styles from "./VaultMediaPicker.module.css";

const button = styles.button;
export default function VaultMediaPicker({ accountId, connectionRevision, selected, initialMode, onToggle, onClose, onChanged, onDenied, purpose = "item", allowUpload = true }: {
  accountId: string; connectionRevision: number | null; selected: Map<string, VaultItem>; initialMode: "vault" | "upload"; purpose?: "item" | "message"; allowUpload?: boolean;
  onToggle: (row: VaultItem) => void; onClose: () => void; onChanged: () => void; onDenied: () => void;
}) {
  const [mode, setMode] = useState(initialMode), [data, setData] = useState<VaultRead | null>(null);
  const [busy, setBusy] = useState(true), [notice, setNotice] = useState("Loading media…");
  const [query, setQuery] = useState(""), [kind, setKind] = useState("all"), [folderId, setFolderId] = useState("");
  const [cursor, setCursor] = useState<string | null>(null), [trail, setTrail] = useState<(string | null)[]>([]);
  const [organizationBusy, setOrganizationBusy] = useState(false), [uploadBusy, setUploadBusy] = useState(false);
  const active = useRef(false), generation = useRef(0), filters = useRef({ query: "", kind: "all", folderId: "" });
  const callbacks = useRef({ onDenied, onChanged }); callbacks.current = { onDenied, onChanged };
  const read = useCallback(async (after: string | null, nextFilters = filters.current) => {
    const stamp = ++generation.current; setBusy(true);
    try {
      const params = new URLSearchParams();
      if (after) params.set("afterMediaId", after);
      if (nextFilters.query) params.set("q", nextFilters.query);
      if (nextFilters.kind !== "all") params.set("kind", nextFilters.kind);
      if (nextFilters.folderId) params.set("folderId", nextFilters.folderId);
      const response = await fetch(`/api/onlyfans-content/accounts/${encodeURIComponent(accountId)}/vault?${params}`, {
        credentials: "same-origin", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
      });
      if (!active.current || stamp !== generation.current) return false;
      if ([401, 403].includes(response.status)) { callbacks.current.onDenied(); return false; }
      const next = response.ok ? parseVault(await response.json(), accountId) : null;
      if (!active.current || stamp !== generation.current) return false;
      if (!next) throw Error("Unavailable");
      filters.current = nextFilters; setData(next); setCursor(after); setNotice(""); return true;
    } catch { if (active.current && stamp === generation.current) { setData(null); setNotice("Media could not be loaded. Retry to choose files."); } return false; }
    finally { if (active.current && stamp === generation.current) setBusy(false); }
  }, [accountId]);
  useEffect(() => { active.current = true; void read(null); return () => { active.current = false; generation.current++; }; }, [read]);
  function filter(next: { query: string; kind: string; folderId: string }) { setTrail([]); void read(null, next); }
  const changeFolder = useCallback((id: string) => { setFolderId(id); setTrail([]); void read(null, { ...filters.current, folderId: id }); }, [read]);
  const changed = useCallback(() => { callbacks.current.onChanged(); void read(null); setTrail([]); }, [read]);
  async function go(after: string | null, nextTrail: (string | null)[]) { if (await read(after)) setTrail(nextTrail); }
  const locked = organizationBusy || uploadBusy;
  return <Dialog open onOpenChange={open => { if (!open && !locked) onClose(); }}>
    <DialogContent className={styles.dialog} showCloseButton={!locked} data-of-media-picker>
      <DialogHeader className={styles.header}>
        <DialogTitle>{purpose === "message" ? "Attach media" : "Add media to your item"}</DialogTitle>
        <DialogDescription>{purpose === "message" ? "Choose photos and videos from any folder. Add your caption and price in the reply." : "Choose existing files or upload new ones. Your item description and price stay in the draft."}</DialogDescription>
      </DialogHeader>
      {allowUpload ? <div className={styles.tabs} role="tablist" aria-label="Add media source">
        {[["vault", "Choose from vault"], ["upload", "Upload new files"]].map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={mode === value} disabled={locked} className={button} onClick={() => { setMode(value as "vault" | "upload"); if (value === "vault") { setTrail([]); void read(null); } }}>{label}</button>)}
      </div> : null}
      <div className={styles.body} data-of-picker-body>
        <div hidden={mode !== "vault"} className={styles.layout}>
          <aside className={styles.folders}>
            <VaultOrganization compact readOnly={purpose === "message"} accountId={accountId} selectedIds={[...selected.keys()]} folderId={folderId} onFolderChange={changeFolder} onChanged={changed} onBusy={setOrganizationBusy} />
          </aside>
          <div className={styles.content}>
            <form className={styles.filters} onSubmit={event => { event.preventDefault(); if (!busy && !locked) filter({ query: query.trim(), kind, folderId }); }}>
              <label className={styles.search}>Search media<input type="search" placeholder="Search your media…" maxLength={120} value={query} onChange={event => setQuery(event.target.value)} /></label>
              <label>Media type<select value={kind} disabled={busy || locked} onChange={event => { setKind(event.target.value); filter({ query: query.trim(), kind: event.target.value, folderId }); }}><option value="all">Photos and videos</option><option value="photo">Photos</option><option value="video">Videos</option></select></label>
              <button type="submit" className={button} aria-label="Search media" disabled={busy || locked}>Search</button>
            </form>
            <div className={styles.toolbar}><span>{selected.size} of 20 selected · Choose across folders</span><button type="button" className={styles.textButton} aria-label="Refresh media" disabled={busy || locked} onClick={() => void read(cursor)}>Refresh</button></div>
            {purpose === "message" ? <p className={styles.captionNote}>Descriptions are internal and are never sent as captions. Only your reply text is sent.</p> : null}
            {notice ? <p role="status" className={styles.notice}>{notice}</p> : null}
            <div className={styles.grid} data-of-picker-grid aria-busy={busy}>
              {data?.items.map(row => {
                const checked = selected.has(row.mediaId), available = row.ready && ["photo", "video"].includes(row.kind);
                return <article key={row.mediaId} className={styles.card} data-selected={checked} data-of-picker-item={row.mediaId}>
                  <div className={styles.preview}>
                    <VaultAssetPreview accountId={accountId} mediaId={row.mediaId} kind={row.kind} tile />
                    <span className={styles.kind}>{row.kind === "video" ? "Video" : "Photo"}{row.durationSeconds ? ` · ${vaultDuration(row.durationSeconds)}` : ""}</span>
                  </div>
                  <label className={styles.selectAsset}><input type="checkbox" aria-label={`Add asset ${row.mediaId}`} checked={checked} disabled={busy || locked || !checked && (!available || selected.size >= 20)} onChange={() => onToggle(row)} /><span>{checked ? "Selected" : "Select " + (row.kind === "video" ? "video" : "photo")}</span><small>#{row.mediaId}</small></label>
                  {row.description ? <details className={styles.description}><summary>Internal description</summary><p>{row.description}</p></details> : null}
                  {!available ? <p className={styles.unavailable}><strong>{vaultAvailability(row).label}</strong><br />{vaultAvailability(row).explanation}</p> : null}
                </article>;
              })}
            </div>
            {data && !data.items.length ? <p className={styles.notice}>No media matches this view. Try another search, type or folder.</p> : null}
            <div className={styles.pagination}><button type="button" className={button} disabled={busy || locked || !trail.length} onClick={() => void go(trail.at(-1) ?? null, trail.slice(0, -1))}>Previous media</button><span>Page {trail.length + 1}</span><button type="button" className={button} disabled={busy || locked || !data?.nextCursor} onClick={() => data?.nextCursor && void go(data.nextCursor, [...trail, cursor])}>Next media</button></div>
          </div>
        </div>
        {allowUpload ? <div hidden={mode !== "upload"} className={styles.upload}>
          <p>Upload to the connected OnlyFans vault, then choose the processed files to add them to your item. Uploading does not publish a feed post.</p>
          <VaultUploader accountId={accountId} connectionRevision={connectionRevision} onChanged={changed} onBusy={setUploadBusy} />
        </div> : null}
      </div>
      <div className={styles.footer}><p role="status"><strong>{selected.size}</strong> {selected.size === 1 ? "file" : "files"} selected{selected.size >= 20 ? " · Maximum reached" : ""}</p><button type="button" className={styles.done} disabled={locked} onClick={onClose}>{purpose === "message" ? (selected.size ? `Use ${selected.size} selected` : "Done") : "Done selecting media"}</button></div>
    </DialogContent>
  </Dialog>;
}
