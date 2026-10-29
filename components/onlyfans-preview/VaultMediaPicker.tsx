"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { inputCls } from "@/components/clone/fields";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { parseVault, vaultAvailability, vaultDuration, type VaultItem, type VaultRead } from "@/lib/onlyfans/vault";
import VaultAssetPreview from "./VaultAssetPreview";
import VaultOrganization from "./VaultOrganization";
import VaultUploader from "./VaultUploader";

const button = "min-h-11 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-accent disabled:opacity-50";
export default function VaultMediaPicker({ accountId, connectionRevision, selected, initialMode, onToggle, onClose, onChanged, onDenied, purpose = "item", allowUpload = true }: {
  accountId: string; connectionRevision: number | null; selected: Map<string, VaultItem>; initialMode: "vault" | "upload"; purpose?: "item" | "message"; allowUpload?: boolean;
  onToggle: (row: VaultItem) => void; onClose: () => void; onChanged: () => void; onDenied: () => void;
}) {
  const [mode, setMode] = useState(initialMode), [data, setData] = useState<VaultRead | null>(null);
  const [busy, setBusy] = useState(true), [notice, setNotice] = useState("Loading mediaâ€¦");
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
    <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden bg-panel text-ink sm:max-w-3xl" showCloseButton={!locked} data-of-media-picker>
      <DialogHeader><DialogTitle>{purpose === "message" ? "Attach vault media" : "Add media to your item"}</DialogTitle><DialogDescription>{purpose === "message" ? "Choose files for this message. Set its price in your reply." : "Choose existing files or upload new ones. Your item description and price stay in the draft."}</DialogDescription></DialogHeader>
      {allowUpload ? <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Add media source">
        {[["vault", "Choose from vault"], ...(allowUpload ? [["upload", "Upload new files"]] : [])].map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={mode === value} disabled={locked} className={`${button} ${mode === value ? "bg-accent text-white" : ""}`} onClick={() => { setMode(value as "vault" | "upload"); if (value === "vault") { setTrail([]); void read(null); } }}>{label}</button>)}
      </div> : null}
      <div className="min-h-0 overflow-y-auto" data-of-picker-body>
      <div hidden={mode !== "vault"}>
        <form className="mt-3 space-y-3" onSubmit={event => { event.preventDefault(); if (!busy && !locked) filter({ query: query.trim(), kind, folderId }); }}>
          <label className="block text-sm">Search media<input type="search" className={`${inputCls} mt-1 w-full`} maxLength={120} value={query} onChange={event => setQuery(event.target.value)} /></label>
          <div className="flex flex-wrap gap-2"><label className="min-w-0 flex-1 text-sm">Media type<select className={`${inputCls} mt-1 w-full`} value={kind} disabled={busy || locked} onChange={event => { setKind(event.target.value); filter({ query: query.trim(), kind: event.target.value, folderId }); }}><option value="all">Photos and videos</option><option value="photo">Photos</option><option value="video">Videos</option></select></label><button type="submit" className={`${button} self-end`} disabled={busy || locked}>Search media</button></div>
        </form>
        <VaultOrganization compact readOnly={purpose === "message"} accountId={accountId} selectedIds={[...selected.keys()]} folderId={folderId} onFolderChange={changeFolder} onChanged={changed} onBusy={setOrganizationBusy} />
        {notice ? <p role="status" className="mt-3 text-sm">{notice}</p> : null}
        <p className="mt-3 text-xs text-muted">{purpose === "message" ? "Select up to 20 photos or videos to attach." : "Choose up to 20 files. Files without confirmed full access cannot be added to a paid item. Folders help you find files; the item contains the files you select."}</p>
        <button type="button" className={`${button} mt-2`} disabled={busy || locked} onClick={() => void read(cursor)}>Refresh media</button>
        <div className="mt-3 grid min-w-0 gap-3 min-[380px]:grid-cols-2 sm:grid-cols-3" data-of-picker-grid>
          {data?.items.map(row => { const checked = selected.has(row.mediaId), available = row.ready && ["photo", "video"].includes(row.kind); return <article key={row.mediaId} className={"min-w-0 rounded-xl border p-3 " + (checked ? "border-accent bg-accent/5 ring-1 ring-accent" : "border-line")} data-of-picker-item={row.mediaId}>
            <VaultAssetPreview accountId={accountId} mediaId={row.mediaId} kind={row.kind} tile />
            <label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" className="mt-1" aria-label={`Add asset ${row.mediaId}`} checked={checked} disabled={busy || locked || !checked && (!available || selected.size >= 20)} onChange={() => onToggle(row)} /><span className="min-w-0 break-words">{row.description || `${row.kind} #${row.mediaId}`}</span></label>
            <p className="text-xs text-muted">{row.kind} {vaultDuration(row.durationSeconds)}</p><p className="mt-1 text-xs">{purpose === "message" && row.ready ? "Ready to attach" : vaultAvailability(row).label}</p>
            {!available ? <p className="mt-1 text-xs text-muted">{vaultAvailability(row).explanation}</p> : null}
          </article>; })}
        </div>
        {data && !data.items.length ? <p className="mt-3 text-sm">No media matches this view. Try another search, type or folder.</p> : null}
        <div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" className={button} disabled={busy || locked || !trail.length} onClick={() => void go(trail.at(-1) ?? null, trail.slice(0, -1))}>Previous media</button><span className="text-sm">Page {trail.length + 1}</span><button type="button" className={button} disabled={busy || locked || !data?.nextCursor} onClick={() => data?.nextCursor && void go(data.nextCursor, [...trail, cursor])}>Next media</button></div>
      </div>
      {allowUpload ? <div hidden={mode !== "upload"}>
        <p className="mt-3 text-sm">Upload to the connected OnlyFans vault. Once processing and vault sync finish, choose the files in Choose from vault to attach them to this item. Uploading does not publish a feed post.</p>
        <VaultUploader accountId={accountId} connectionRevision={connectionRevision} onChanged={changed} onBusy={setUploadBusy} />
      </div> : null}
      </div>
      <div className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-line bg-panel py-3"><p role="status" className="text-sm">{selected.size} selected{selected.size >= 20 ? " Â· Maximum reached" : ""}</p><button type="button" className={`${button} bg-accent text-white`} disabled={locked} onClick={onClose}>Done selecting media</button></div>
    </DialogContent>
  </Dialog>;
}
