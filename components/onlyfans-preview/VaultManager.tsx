"use client";

import { inputCls } from "@/components/clone/fields";

import Link from "next/link";
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

const inputClass = `${inputCls} mt-1 disabled:opacity-50`;
const buttonClass = "rounded-lg border border-line px-3 py-2 text-sm font-semibold text-accent disabled:opacity-50";
const SYNC_STATUS = { pending: "Queued", running: "Syncing", complete: "Complete", failed: "Failed", superseded: "Replaced by a newer request" } as const;
type Pending = { kind: "sync"; body: VaultSyncRequest } | { kind: "create"; body: VaultCreateRequest };

export default function VaultManager({ accountId, readOnly = false }: { accountId: string; readOnly?: boolean }) {
  const router = useRouter();
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

  return <Card className="mb-6 min-w-0 p-4" data-of-vault-manager>
    <h2 className="text-lg font-semibold">Your media library</h2>
    {readOnly ? <p className="mt-2 text-xs text-muted">Read-only team access</p> : null}
    <p className="mt-1 text-xs text-muted">Browse your imported OnlyFans photos and videos. Use descriptions, tags and folders to organize them.</p>
    {notice ? <p role="status" className="mt-3 text-sm" data-of-vault-notice>{notice}</p> : null}
    {!denied ? <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" className={buttonClass} data-of-vault-refresh disabled={busy} onClick={() => void refresh(null, true)}>Refresh vault</button>
      <button type="button" className={buttonClass} data-of-vault-sync disabled={readOnly || busy || !!retry || data?.connectionRevision == null || data?.sync?.status === "pending" || data?.sync?.status === "running"}
        onClick={() => { if (data?.connectionRevision) void execute({ kind: "sync", body: { requestId: crypto.randomUUID(), expectedConnectionRevision: data.connectionRevision } }); }}>Sync vault</button>
      {data?.connectionRevision == null ? <Link className="self-center text-xs font-semibold text-accent" href={`/onlyfans/accounts?account=${encodeURIComponent(accountId)}`}>Configure account connection →</Link> : null}
    </div> : null}
    {data && !denied ? <>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4" data-of-vault-summary>
        {[["All media", data.summary?.total], ["Photos", data.summary?.photos], ["Videos", data.summary?.videos], ["Folders", data.summary?.folders]].map(([label, count]) => <div key={label} className="min-w-0 rounded-xl border border-line p-3"><p className="text-xs text-muted">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{typeof count === "number" ? count.toLocaleString() : "—"}</p></div>)}
      </div>
      <p className="mt-2 text-xs text-muted">{data.summary ? "Totals cover this account’s imported library, across every page." : "Library totals are unavailable. Refresh to try again."}{data.summary?.other ? ` Includes ${data.summary.other} other-format assets.` : ""}</p>
      <div className="mt-4 rounded-lg border border-line p-3 text-xs" data-of-vault-sync-status>
        {data.sync ? <><p><strong>{["pending", "running"].includes(data.sync.status) ? "Importing your OnlyFans vault…" : data.sync.status === "complete" ? "Vault sync complete" : `Vault sync: ${SYNC_STATUS[data.sync.status]}`}</strong></p>
          <p className="mt-1 text-muted">{data.sync.itemsSeen.toLocaleString()} files checked in this sync. {["pending", "running"].includes(data.sync.status) ? "Totals may increase. This page updates automatically." : `Last updated ${new Date(data.sync.updatedAt).toLocaleString()}.`}</p>
          {data.sync.lastError ? <p className="mt-2">Sync stopped ({data.sync.lastError.replaceAll("_", " ")}). Imported files remain below. Check the connection, then try Sync vault again.</p> : null}
        </> : <p>No vault sync has run yet. Choose Sync vault to import this account’s existing media.</p>}

      </div>
      <div ref={libraryTop} className="scroll-mt-48"/>
      <form className="mt-4 space-y-3" onSubmit={event => {
        event.preventDefault(); if (busy || retry) return;
        setBusy(true); setPageTrail([]); clearSelection(); void read(null, { query: search.trim(), kind: mediaKind, folderId }).then(ok => {
          if (active.current) { setBusy(false); if (ok) setNotice(""); }
        });
      }}>
        <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Media type">
          {[{ key: "all", label: "All media" }, { key: "photo", label: "Photos" }, { key: "video", label: "Videos" }].map(tab => <button key={tab.key} type="button" role="tab" aria-selected={mediaKind === tab.key} className={`min-h-11 min-w-0 rounded-lg border px-2 py-2 text-sm font-semibold ${mediaKind === tab.key ? "border-accent bg-accent text-white" : "border-line text-ink"}`} disabled={busy || !!retry} onClick={() => changeType(tab.key)}>{tab.label}</button>)}
        </div>
        <label className="block text-sm">Search descriptions and tags<input type="search" aria-label="Search your media" className={`${inputClass} w-full`} placeholder="Search this library" maxLength={120} value={search} onChange={event => setSearch(event.target.value)} disabled={busy || !!retry}/></label>
        <button type="submit" data-of-vault-search className={buttonClass} disabled={busy || !!retry}>Search vault</button>
      </form>
      {!readOnly && !picker ? <VaultOrganization accountId={accountId} selectedIds={[...selected.keys()]} folderId={folderId}
        onFolderChange={changeFolder} onChanged={organizationChanged} onBusy={setOrganizationBusy}/> : null}
      <fieldset disabled={busy || !!retry || organizationBusy} className="mt-4 min-w-0">
        <legend className="text-sm font-semibold">{data.summary ? `${data.summary.matching.toLocaleString()} matching files` : "Imported media"} · Page {pageTrail.length + 1}</legend>
        <p className="mt-1 text-xs text-muted">Showing {data.items.length} files. Open a preview to view media; use Edit details for descriptions and tags.</p>
        <div className="mt-4 grid min-w-0 gap-4 min-[380px]:grid-cols-2 xl:grid-cols-3" data-of-vault-grid>
          {data.items.map(row => <article key={row.mediaId} className="min-w-0 overflow-hidden rounded-2xl border border-line bg-panel" data-of-vault-item={row.mediaId}>
            <div className="flex flex-wrap items-start justify-between gap-2 px-3 py-3"><label className="flex items-center gap-2 text-xs"><input disabled={readOnly} data-of-vault-select={row.mediaId} type="checkbox" aria-label={`Select asset ${row.mediaId}`} checked={selected.has(row.mediaId)} onChange={() => toggle(row)} /><span className="capitalize">{row.kind}</span></label><span className="text-xs text-muted">{vaultAvailability(row).label}</span></div>
            <VaultAssetPreview key={row.mediaId} accountId={accountId} mediaId={row.mediaId} kind={row.kind} readOnly={readOnly}/>
            <div className="p-3"><p className="line-clamp-2 break-words text-sm">{row.description || "No saved description"}</p><p className="mt-2 text-xs text-muted">{row.durationSeconds === null ? "" : vaultDuration(row.durationSeconds)}{row.width && row.height ? ` ${row.width} × ${row.height}` : ""}</p><button type="button" disabled={readOnly} data-of-vault-edit={row.mediaId} className="mt-2 min-h-11 text-sm font-semibold text-accent" onClick={()=>setAssetId(row.mediaId)}>Edit details</button><details className="mt-2"><summary className="min-h-11 py-2 text-xs">Availability details</summary><p className="mb-2 text-xs text-muted">{vaultAvailability(row).explanation}</p><p className="break-all text-xs text-muted">Asset #{row.mediaId}</p></details></div>
          </article>)}
        </div>
        {!data.items.length ? <p className="mt-3 text-sm text-muted">No files match this view. Try another media type, search or folder.</p> : null}
        <div className="mt-4 flex flex-wrap items-center gap-3" aria-busy={busy}>
          <button type="button" className={buttonClass} disabled={!pageTrail.length} onClick={() => void goPage(pageTrail.at(-1) ?? null, pageTrail.slice(0, -1))}>Previous</button>
          <span className="text-sm">Page {pageTrail.length + 1}{data.summary ? ` of ${Math.max(1, Math.ceil(data.summary.matching / 24))}` : ""}</span>
          <button type="button" data-of-vault-next className={buttonClass} disabled={!data.nextCursor} onClick={() => data.nextCursor && void goPage(data.nextCursor, [...pageTrail, cursor])}>Next page →</button>
          {busy && <span role="status" className="text-sm text-muted">Loading page…</span>}
        </div>
      </fieldset>
      {selected.size>0&&!readySelection?<p className="mt-3 text-xs text-muted" data-of-vault-readiness-hold>Selected assets need verified availability before creating a catalogue item. You can still organize them in folders.</p>:null}
      {!readOnly ? <details className="mt-6 rounded-xl border border-line p-4"><summary className="cursor-pointer text-sm font-semibold">Create an item for sale · {selected.size} selected</summary><p className="mt-2 text-xs text-muted">Bundle selected media with a description and price for a paid offer.</p><form className="mt-4 min-w-0" onSubmit={event => { event.preventDefault(); if (productValid) void execute({ kind: "create", body: { requestId: crypto.randomUUID(), product } }); }}>
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
      {!readOnly ? <div className="mt-4 rounded-xl border border-line p-4"><button type="button" className={`${buttonClass} min-h-11`} disabled={busy || !!retry} onClick={() => setPicker("upload")}>Upload photos and videos</button><p className="mt-2 text-xs text-muted">Add new files to the connected OnlyFans vault. You can also upload while preparing an item above.</p></div> : null}
      {created ? <div className="mt-4 rounded-lg border border-line p-3 text-sm" data-of-vault-created={created}>Catalogue item #{created} was recorded.<ContentEditor key={created} accountId={accountId} itemId={created} /></div> : null}
    </> : null}
    {assetId && !readOnly && !denied ? <VaultMetadataEditor key={`${accountId}:${assetId}`} accountId={accountId} mediaId={assetId} onClose={() => setAssetId(null)} onChanged={organizationChanged}/> : null}
    {picker && !readOnly && !denied ? <VaultMediaPicker key={accountId} accountId={accountId} connectionRevision={data?.connectionRevision ?? null} selected={selected} initialMode={picker} onToggle={toggle} onClose={() => setPicker(null)} onChanged={organizationChanged} onDenied={denyPicker}/> : null}
    {retry && !denied ? <div className="mt-4 flex flex-wrap gap-2"><button type="button" data-of-vault-retry className={buttonClass} disabled={busy} onClick={() => void execute(retry)}>Retry same request</button><button type="button" className={buttonClass} disabled={busy || !data} onClick={() => { setRetry(null); clearSelection(); setNotice("Review the recorded catalogue and sync status before starting another request. The previous command may already have committed."); }}>Use refreshed vault</button></div> : null}
  </Card>;
}

