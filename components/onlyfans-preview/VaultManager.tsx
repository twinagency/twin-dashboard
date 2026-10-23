"use client";

import { inputCls } from "@/components/clone/fields";

import Link from "next/link";
import { createPortal } from "react-dom";
import { Upload, Plus, Search, Grid2X2, List, RefreshCw, Folder, Image as ImageIcon, Video, MoreHorizontal } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { parseContentPrice } from "@/lib/onlyfans/content";
import { parseVault, parseVaultCreateAck, parseVaultSyncAck, validVaultProduct,
  type VaultRead, type VaultItem, type VaultCreateRequest, type VaultSyncRequest } from "@/lib/onlyfans/vault";
import VaultOrganization from "./VaultOrganization";
import VaultAssetPreview from "./VaultAssetPreview";
import ContentEditor from "./ContentEditor";
import VaultMetadataEditor from "./VaultMetadataEditor";
import { vaultAvailability, vaultDuration } from "@/lib/onlyfans/vault";
import VaultMediaPicker from "./VaultMediaPicker";
import ContentSyncSave from "./ContentSyncSave";

const inputClass = `${inputCls} mt-1 disabled:opacity-50`;
const buttonClass = "rounded-lg border border-line px-3 py-2 text-sm font-semibold text-accent disabled:opacity-50";
const SYNC_STATUS = { pending: "Queued", running: "Syncing", complete: "Complete", failed: "Failed", superseded: "Replaced by a newer request" } as const;
type Pending = { kind: "sync"; body: VaultSyncRequest } | { kind: "create"; body: VaultCreateRequest };

export default function VaultManager({ accountId, readOnly = false, actionsTarget, onShowVault }: { accountId: string; readOnly?: boolean; actionsTarget?: HTMLDivElement | null; onShowVault?: () => void }) {
  const router = useRouter();
  const [offerOpen, setOfferOpen] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const offerForm = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!offerOpen) return;
    const frame = requestAnimationFrame(() => {
      offerForm.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
      offerForm.current?.querySelector<HTMLInputElement>("[data-of-vault-product-label]")?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [offerOpen]);
  const [data, setData] = useState<VaultRead | null>(null), [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true), [denied, setDenied] = useState(false), [notice, setNotice] = useState("Loading recorded vault…");
  const [selected, setSelected] = useState<Map<string, VaultItem>>(new Map()), [previews, setPreviews] = useState<Set<string>>(new Set());
  const [label, setLabel] = useState(""), [description, setDescription] = useState(""), [price, setPrice] = useState(""), [enabled, setEnabled] = useState(false);
  const [pageTrail, setPageTrail] = useState<(string | null)[]>([]);
  const [picker, setPicker] = useState<"vault" | "upload" | null>(null);
  const libraryTop = useRef<HTMLDivElement>(null);
  const [retry, setRetry] = useState<Pending | null>(null), [created, setCreated] = useState<string | null>(null);
  const active = useRef(false), submitting = useRef(false), sessionDenied = useRef(false);
  const [search, setSearch] = useState(""), [mediaKind, setMediaKind] = useState("all");
  const appliedFilters = useRef({ query: "", kind: "all", folderId: "" });
  const readGeneration = useRef(0);
  const [folderId,setFolderId]=useState(""),[assetId,setAssetId]=useState<string|null>(null),[organizationBusy,setOrganizationBusy]=useState(false);
  const base = `/api/onlyfans-content/accounts/${encodeURIComponent(accountId)}`;
  const clearSelection = useCallback(() => { setSelected(new Map()); setPreviews(new Set()); }, []);
  const read = useCallback(async (after: string | null, filters = appliedFilters.current, background = false) => {
    const generation = ++readGeneration.current;
    try {
      const parameters = new URLSearchParams();
      if (after) parameters.set("afterMediaId", after);
      if (filters.query) parameters.set("q", filters.query);
      if (filters.kind !== "all") parameters.set("kind", filters.kind);
      if (filters.folderId) parameters.set("folderId", filters.folderId);
      const response = await fetch(base + "/vault" + (parameters.size ? "?" + parameters : ""), { credentials: "same-origin", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
      if (!active.current || generation !== readGeneration.current) return false;
      if ([401, 403].includes(response.status)) {
        sessionDenied.current = true; setData(null); clearSelection(); setCreated(null); setLabel(""); setDescription(""); setPrice(""); setRetry(null); setDenied(true);
        setNotice("Your session cannot manage this vault. Sign in again."); router.refresh(); return false;
      }
      const next = response.ok ? parseVault(await response.json(), accountId) : null;
      if (!active.current || generation !== readGeneration.current) return false;
      if (!next) { if (!background) setData(null); setNotice("The recorded vault could not be refreshed. Try again."); return false; }
      appliedFilters.current = filters; setData(next); setCursor(after);
      setSelected(previous=>new Map([...previous].map(([id,row])=>[id,next.items.find(item=>item.mediaId===id)??row])));
      return true;
    } catch { if (active.current && generation === readGeneration.current) { if (!background) setData(null); setNotice("The recorded vault could not be refreshed. Try again."); } return false; }
  }, [accountId, base, clearSelection, router]);
  useEffect(() => { active.current = true; void read(null).then(ok => { if (active.current) { setBusy(false); if (ok) setNotice(""); } }); return () => { active.current = false; readGeneration.current++; }; }, [read]);
  async function refresh(after: string | null, reset = false) {
    setBusy(true); if (reset) { clearSelection(); setPageTrail([]); } const ok = await read(after);
    if (active.current) { setBusy(false); if (ok) setNotice(""); }
  }
  const changeFolder = useCallback((id:string)=>{
    setFolderId(id);setBusy(true);clearSelection();setPageTrail([]);
    void read(null,{...appliedFilters.current,folderId:id}).then(ok=>{if(active.current){setBusy(false);if(ok)setNotice("");}});
  },[read,clearSelection]);
  const organizationChanged = useCallback(()=>{void read(cursor);router.refresh();},[read,router,cursor]);
  useEffect(() => {
    if (busy || denied || organizationBusy || assetId || picker || retry || !["pending", "running"].includes(data?.sync?.status ?? "")) return;
    let reading = false;
    const timer = setInterval(() => {
      if (reading || document.visibilityState !== "visible" || submitting.current) return;
      reading = true; void read(cursor, appliedFilters.current, true).finally(() => { reading = false; });
    }, 8000);
    return () => clearInterval(timer);
  }, [busy, denied, organizationBusy, assetId, picker, retry, data?.sync?.status, cursor, read]);
  function changeType(kind: string) {
    if (busy || retry) return;
    setMediaKind(kind); setBusy(true); setPageTrail([]); clearSelection();
    void read(null, { query: search.trim(), kind, folderId }).then(ok => { if (active.current) { setBusy(false); if (ok) setNotice(""); } });
  }
  async function goPage(after: string | null, trail: (string | null)[]) {
    if (busy) return;
    setBusy(true);
    const ok = await read(after);
    if (active.current) { setBusy(false); if (ok) { setPageTrail(trail); setNotice(""); libraryTop.current?.scrollIntoView({ block: "start" }); } }
  }
  async function execute(command: Pending) {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setNotice(command.kind === "sync" ? "Requesting vault sync…" : "Creating catalogue item…");
    let message = "Outcome not confirmed. Review recorded status or retry the same request.";
    let nextRetry: Pending | null = command, sessionLost = false;
    try {
      const response = await fetch(base + (command.kind === "sync" ? "/vault/sync" : "/items"), { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(command.body) });
      if (!active.current) return;
      if ([401, 403].includes(response.status)) {
        sessionLost = true; sessionDenied.current = true; setData(null); clearSelection(); setCreated(null); setLabel(""); setDescription(""); setPrice(""); setRetry(null); setDenied(true);
        setNotice("Your session cannot manage this vault. Sign in again."); router.refresh(); return;
      }
      const value: unknown = response.ok ? await response.json() : null;
      if (command.kind === "sync" && response.ok && parseVaultSyncAck(value, { accountId })) {
        nextRetry = null; message = "Vault sync started. Progress updates automatically while this page is open.";
      } else if (command.kind === "create" && response.ok) {
        const item = parseVaultCreateAck(value, { accountId, product: command.body.product });
        if (item) { nextRetry = null; setCreated(item.itemId); clearSelection(); setLabel(""); setDescription(""); setPrice(""); setEnabled(false); message = `Catalogue item #${item.itemId} recorded. The catalogue has been refreshed.`; }
      } else if ([400, 404, 409, 413, 503].includes(response.status)) {
        nextRetry = null; if (response.status === 409 && command.kind === "create") clearSelection();
        message = "The request was refused. Review the current connection, selected assets and product terms.";
      }
    } catch { /* A missing reply cannot prove that the command did not commit. */ }
    finally {
      if (active.current && !sessionLost) {
        const refreshed = await read(command.kind === "sync" ? null : cursor);
        if (active.current) { if (!sessionDenied.current) setRetry(nextRetry); if (refreshed) setNotice(message); setBusy(false); router.refresh(); }
      }
      if (active.current && sessionLost) setBusy(false);
      submitting.current = false;
    }
  }
  function toggle(row: VaultItem) {
    if (!selected.has(row.mediaId) && selected.size >= 20) { setNotice("Choose up to 20 assets for one catalogue item."); return; }
    const next = new Map(selected);
    if (next.has(row.mediaId)) { next.delete(row.mediaId); const remaining = new Set(previews); remaining.delete(row.mediaId); setPreviews(remaining); }
    else next.set(row.mediaId, row);
    setSelected(next);
  }
  const cents = parseContentPrice(price);
  const product = { label: label.trim(), description: description.trim(), priceCents: cents ?? -1, enabled,
    mediaIds: [...selected.keys()], previewMediaIds: [...selected.keys()].filter(id => previews.has(id)) };
  // Bundles may sell several photos and/or videos for one total; at least one asset stays paid and only photos can be free previews.
  const mediaValid = [...selected.values()].some(row => !previews.has(row.mediaId)) && [...previews].every(id => selected.get(id)?.kind === "photo");
  const readySelection = [...selected.values()].every(row=>row.ready&&["photo","video"].includes(row.kind));
  const productIssues = [
    ...(!selected.size ? ["Add at least one photo or video."] : []),
    ...(!readySelection ? ["Remove files with unconfirmed full access before creating a paid item."] : []),
    ...(!mediaValid ? ["Leave at least one paid file. Only photos can be free previews."] : []),
    ...(selected.size > 0 && previews.size >= selected.size ? ["Keep at least one file behind the paid unlock."] : []),
    ...(!product.label ? ["Enter an item label."] : new TextEncoder().encode(product.label).length > 160 ? ["Shorten the item label to 160 bytes."] : []),
    ...(!product.description ? ["Describe what the fan receives."] : new TextEncoder().encode(product.description).length > 2000 ? ["Shorten the description to 2,000 bytes."] : []),
    ...(cents === null || cents < 300 || cents > 20000 ? ["Set a price between USD 3.00 and 200.00."] : []),
    ...(data?.connectionRevision == null ? ["Connect this OnlyFans account before creating an item."] : []),
  ];
  const productValid = !productIssues.length && validVaultProduct(product);
  function denyPicker() {
    sessionDenied.current = true; setPicker(null); setData(null); clearSelection(); setCreated(null); setLabel(""); setDescription(""); setPrice(""); setRetry(null); setDenied(true);
    setNotice("Your session cannot manage this vault. Sign in again."); router.refresh();
  }

  const headerActions = !readOnly && !denied ? <>
    <button type="button" className="of-secondary" disabled={busy || !!retry} onClick={() => setPicker("upload")}><Upload size={19} aria-hidden="true" />Upload content</button>
    <button type="button" className="of-primary" disabled={busy || !!retry || !data} onClick={() => { onShowVault?.(); setOfferOpen(true); }}><Plus size={20} aria-hidden="true" />Create offer</button>
  </> : null;
  return <Card className="mb-6 min-w-0 p-4 of-vault" data-of-vault-manager>
    {actionsTarget ? createPortal(headerActions, actionsTarget) : <div className="of-vault-local-actions">{headerActions}</div>}
    <h2 className="sr-only">Your media library</h2>
    {readOnly ? <p className="of-notice">Read-only team access</p> : null}
    {notice ? <p role="status" className="of-notice" data-of-vault-notice>{notice}</p> : null}
    {!data && !denied ? <button type="button" className={buttonClass} data-of-vault-refresh disabled={busy} onClick={() => void refresh(null, true)}>Refresh vault</button> : null}
    {data && !denied ? <>
      <div ref={libraryTop} className="scroll-mt-24" />
      <form className="of-vault-toolbar" onSubmit={event => {
        event.preventDefault(); if (busy || retry) return;
        setBusy(true); setPageTrail([]); clearSelection(); void read(null, { query: search.trim(), kind: mediaKind, folderId }).then(ok => {
          if (active.current) { setBusy(false); if (ok) setNotice(""); }
        });
      }}>
        <div className="of-media-filters" role="tablist" aria-label="Media type">
          {[{ key: "all", label: "All media" }, { key: "photo", label: "Photos" }, { key: "video", label: "Videos" }].map(tab => <button key={tab.key} type="button" role="tab" aria-selected={mediaKind === tab.key} disabled={busy || !!retry} onClick={() => changeType(tab.key)}>{tab.label}</button>)}
        </div>
        <div className="of-media-search"><Search size={17} aria-hidden="true" /><input type="search" aria-label="Search your media" placeholder="Search descriptions and tags" maxLength={120} value={search} onChange={event => setSearch(event.target.value)} disabled={busy || !!retry}/><button type="submit" data-of-vault-search aria-label="Search vault" disabled={busy || !!retry}><Search size={17} aria-hidden="true" /></button></div>
        <div className="of-view-toggle" role="group" aria-label="Media layout"><button type="button" aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")}><Grid2X2 size={19} /></button><button type="button" aria-label="List view" aria-pressed={view === "list"} onClick={() => setView("list")}><List size={19} /></button></div>
      </form>
      <div className="of-library-controls">
        <span>{data.summary ? `${data.summary.matching.toLocaleString()} matching files` : "Imported media"}{selected.size ? ` · ${selected.size} selected` : ""}</span>
        {!readOnly && !picker ? <details className="of-folder-tools"><summary><Folder size={16} aria-hidden="true" />{folderId ? "Selected folder" : "Folders"}</summary><VaultOrganization compact accountId={accountId} selectedIds={[...selected.keys()]} folderId={folderId} onFolderChange={changeFolder} onChanged={organizationChanged} onBusy={setOrganizationBusy}/></details> : null}
        <button type="button" data-of-vault-refresh disabled={busy} onClick={() => void refresh(null, true)}><RefreshCw size={15} aria-hidden="true" />Refresh vault</button>
        <details className="of-sync-tools" open={data.sync?.status === "failed" || data.sync?.status === "pending" || data.sync?.status === "running"}><summary>{data.sync?.status === "complete" ? "Vault synced" : data.sync ? `Sync: ${SYNC_STATUS[data.sync.status]}` : "Sync details"}</summary>
      <div className="of-vault-sync-copy text-xs" data-of-vault-sync-status>
        {data.sync ? <><p><strong>{["pending", "running"].includes(data.sync.status) ? "Importing your OnlyFans vault…" : data.sync.status === "complete" ? "Vault sync complete" : `Vault sync: ${SYNC_STATUS[data.sync.status]}`}</strong></p>
          <p className="mt-1 text-muted">{data.sync.itemsSeen.toLocaleString()} files checked in this sync. {["pending", "running"].includes(data.sync.status) ? "Totals may increase. This page updates automatically." : `Last updated ${new Date(data.sync.updatedAt).toLocaleString()}.`}</p>
          {data.sync.lastError ? <p className="mt-2">Sync stopped ({data.sync.lastError.replaceAll("_", " ")}). Imported files remain below. Check the connection, then try Sync vault again.</p> : null}
        </> : <p>No vault sync has run yet. Choose Sync vault to import this account’s existing media.</p>}

      </div>
          <div data-of-vault-summary className="of-library-totals">{[["All media", data.summary?.total], ["Photos", data.summary?.photos], ["Videos", data.summary?.videos], ["Folders", data.summary?.folders]].map(([label, count]) => <span key={label}>{label} <strong>{typeof count === "number" ? count.toLocaleString() : "Unavailable"}</strong></span>)}</div>
          <p className="of-panel-footnote">{data.summary ? "Totals cover this account’s imported library, across every page." : "Library totals are unavailable. Refresh to try again."}{data.summary?.other ? ` Includes ${data.summary.other} other-format assets.` : ""}</p>
          <button type="button" className={buttonClass} data-of-vault-sync disabled={readOnly || busy || !!retry || data.connectionRevision == null || data.sync?.status === "pending" || data.sync?.status === "running"} onClick={() => { if (data.connectionRevision) void execute({ kind: "sync", body: { requestId: crypto.randomUUID(), expectedConnectionRevision: data.connectionRevision } }); }}>Sync vault</button>
        </details>
        {data.connectionRevision == null ? <Link className="of-text-link" href={`/onlyfans/accounts?account=${encodeURIComponent(accountId)}`}>Configure account connection →</Link> : null}
      </div>
      {!readOnly ? <details ref={offerForm} open={offerOpen} onToggle={event => setOfferOpen(event.currentTarget.open)} className="of-offer-composer rounded-xl border border-line p-4"><summary className="cursor-pointer text-sm font-semibold">Create an item for sale · {selected.size} selected</summary><p className="mt-2 text-xs text-muted">Bundle selected media with a description and price for a paid offer.</p><form className="mt-4 min-w-0" onSubmit={event => { event.preventDefault(); if (productValid) void execute({ kind: "create", body: { requestId: crypto.randomUUID(), product } }); }}>
        <fieldset disabled={busy || !!retry} className="min-w-0 space-y-3">
          <legend className="mb-2 text-sm font-semibold">Create catalogue item · {selected.size} selected</legend>
          <div className="flex flex-wrap gap-2"><button type="button" className={`${buttonClass} min-h-11 bg-accent text-white`} data-of-add-media onClick={() => setPicker("vault")}>Add media</button><button type="button" className={`${buttonClass} min-h-11`} data-of-upload-new onClick={() => setPicker("upload")}>Upload new files</button></div>
          {selected.size ? <ul className="space-y-2">{[...selected.values()].map(row => <li key={row.mediaId} className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-2 text-xs">
            <span className="min-w-0 break-words">{row.description || `Asset #${row.mediaId}`} · {row.kind}<span className="mt-1 block text-muted">{vaultAvailability(row).label}</span></span>{row.kind === "photo" ? <label className="flex items-center gap-2"><input data-of-vault-preview={row.mediaId} type="checkbox" checked={previews.has(row.mediaId)} onChange={event => { const next = new Set(previews); if (event.target.checked) next.add(row.mediaId); else next.delete(row.mediaId); setPreviews(next); }} />Free preview</label> : null}
            <button type="button" className="ml-auto text-accent" onClick={() => toggle(row)}>Remove</button>
          </li>)}</ul> : <p className="text-sm text-muted">No media attached yet. Use Add media to choose files from your vault, or Upload new files to add files from your device.</p>}
          {!mediaValid ? <p role="status" className="text-xs text-muted">Leave at least one paid file. Only photos can be free previews.</p> : null}
          {selected.size > 0 && previews.size >= selected.size ? <p role="status" className="text-xs text-muted">Keep at least one selected asset behind the paid unlock.</p> : null}
          <div className="grid min-w-0 gap-3 md:grid-cols-2"><label className="min-w-0 text-sm">Item label<input data-of-vault-product-label className={inputClass} maxLength={160} value={label} onChange={event => setLabel(event.target.value)} required /></label><label className="min-w-0 text-sm">Price (USD)<input data-of-vault-product-price className={inputClass} inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} required /><span className="mt-1 block text-xs text-muted">USD 3.00–200.00</span></label></div>
          <label className="block text-sm">What the fan receives<textarea data-of-vault-product-description className={`${inputClass} min-h-24`} maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} required /></label>
          <label className="flex items-start gap-2 text-sm"><input data-of-vault-product-enabled type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} /><span>Enable this item for eligible offers</span></label>
          <p className="text-xs text-muted">{enabled ? "Once saved, this item is available for eligible offers. Saving does not send it to fans or publish a post." : "This item will be saved with offers disabled. You can enable it later."} Media is required either way.</p>
          {productIssues.length ? <ul id="vault-product-issues" className="list-inside list-disc space-y-1 text-sm" aria-live="polite" data-of-product-issues>{productIssues.map(issue => <li key={issue}>{issue}</li>)}</ul> : null}
          <button type="submit" data-of-vault-create className={`${buttonClass} min-h-11`} aria-describedby={productIssues.length ? "vault-product-issues" : undefined} disabled={!productValid}>{enabled ? "Create catalogue item" : "Save item with offers disabled"}</button>
        </fieldset>
      </form></details> : null}
      <fieldset disabled={busy || !!retry || organizationBusy} className="of-vault-files">
        <legend className="sr-only">{data.summary ? `${data.summary.matching.toLocaleString()} matching files` : "Imported media"} · Page {pageTrail.length + 1}</legend>
        <div className="of-media-grid" data-of-vault-grid data-view={view}>
          {data.items.map(row => <article key={row.mediaId} className="of-media-card" data-of-vault-item={row.mediaId} data-selected={selected.has(row.mediaId) || undefined}>
            <div className="of-media-cover">
              <VaultAssetPreview key={row.mediaId} accountId={accountId} mediaId={row.mediaId} kind={row.kind} readOnly={readOnly}/>
              {!["photo", "video"].includes(row.kind) ? <div className="of-media-placeholder"><ImageIcon size={32} /><span>{row.kind}</span></div> : null}
              <span className="of-media-kind">{row.kind === "video" ? <Video size={14} /> : <ImageIcon size={14} />}{row.kind}</span>
              <label className="of-media-select"><input disabled={readOnly} data-of-vault-select={row.mediaId} type="checkbox" aria-label={`Select asset ${row.mediaId}`} checked={selected.has(row.mediaId)} onChange={() => toggle(row)} /></label>
              {row.durationSeconds !== null ? <span className="of-media-duration">{vaultDuration(row.durationSeconds)}</span> : null}
            </div>
            <div className="of-media-caption"><p className="of-media-title">{row.description || `${row.kind === "video" ? "Video" : row.kind === "photo" ? "Photo" : "Asset"} #${row.mediaId}`}</p><span className="of-media-availability" data-ready={row.ready}>{vaultAvailability(row).label}</span>
              <div className="of-media-details"><button type="button" disabled={readOnly} data-of-vault-edit={row.mediaId} onClick={() => setAssetId(row.mediaId)}>Edit details</button><details><summary aria-label={`Availability details for asset ${row.mediaId}`}><MoreHorizontal size={18} /></summary><div><p>{vaultAvailability(row).explanation}</p><p>Asset #{row.mediaId}{row.width && row.height ? ` · ${row.width} × ${row.height}` : ""}</p></div></details></div>
            </div>
          </article>)}
        </div>
        {!data.items.length ? <p className="of-empty-copy">No files match this view. Try another media type, search or folder.</p> : null}
        <div className="of-vault-pagination" aria-busy={busy}><span>Showing {data.items.length} files · Page {pageTrail.length + 1}{data.summary ? ` of ${Math.max(1, Math.ceil(data.summary.matching / 24))}` : ""}</span><div>
          <button type="button" className={buttonClass} disabled={!pageTrail.length} onClick={() => void goPage(pageTrail.at(-1) ?? null, pageTrail.slice(0, -1))}>Previous</button>
          <button type="button" data-of-vault-next className={buttonClass} disabled={!data.nextCursor} onClick={() => data.nextCursor && void goPage(data.nextCursor, [...pageTrail, cursor])}>Next page →</button>
          {busy && <span role="status" className="text-sm text-muted">Loading page…</span>}
        </div></div>
      </fieldset>
      {selected.size > 0 && !readySelection ? <p className="of-notice" data-of-vault-readiness-hold>Selected assets need verified availability before creating a catalogue item. You can still organize them in folders.</p> : null}
      <ContentSyncSave key={accountId} accountId={accountId} readOnly={readOnly} />
      {created ? <div className="mt-4 rounded-lg border border-line p-3 text-sm" data-of-vault-created={created}>Catalogue item #{created} was recorded.<ContentEditor key={created} accountId={accountId} itemId={created} /></div> : null}
    </> : null}
    {assetId && !readOnly && !denied ? <VaultMetadataEditor key={`${accountId}:${assetId}`} accountId={accountId} mediaId={assetId} onClose={() => setAssetId(null)} onChanged={organizationChanged}/> : null}
    {picker && !readOnly && !denied ? <VaultMediaPicker key={accountId} accountId={accountId} connectionRevision={data?.connectionRevision ?? null} selected={selected} initialMode={picker} onToggle={toggle} onClose={() => setPicker(null)} onChanged={organizationChanged} onDenied={denyPicker}/> : null}
    {retry && !denied ? <div className="mt-4 flex flex-wrap gap-2"><button type="button" data-of-vault-retry className={buttonClass} disabled={busy} onClick={() => void execute(retry)}>Retry same request</button><button type="button" className={buttonClass} disabled={busy || !data} onClick={() => { setRetry(null); clearSelection(); setNotice("Review the recorded catalogue and sync status before starting another request. The previous command may already have committed."); }}>Use refreshed vault</button></div> : null}
  </Card>;
}
