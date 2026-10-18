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
import ContentEditor from "./ContentEditor";
import { MediaLibraryFilters } from "@/components/CreatorMediaLibrary";

const inputClass = `${inputCls} mt-1 disabled:opacity-50`;
const buttonClass = "rounded-lg border border-line px-3 py-2 text-sm font-semibold text-accent disabled:opacity-50";
const SYNC_STATUS = { pending: "Queued", running: "Syncing", complete: "Complete", failed: "Failed", superseded: "Replaced by a newer request" } as const;
type Pending = { kind: "sync"; body: VaultSyncRequest } | { kind: "create"; body: VaultCreateRequest };

export default function VaultManager({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [data, setData] = useState<VaultRead | null>(null), [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true), [denied, setDenied] = useState(false), [notice, setNotice] = useState("Loading recorded vault…");
  const [selected, setSelected] = useState<Map<string, VaultItem>>(new Map()), [previews, setPreviews] = useState<Set<string>>(new Set());
  const [label, setLabel] = useState(""), [description, setDescription] = useState(""), [price, setPrice] = useState(""), [enabled, setEnabled] = useState(false);
  const [retry, setRetry] = useState<Pending | null>(null), [created, setCreated] = useState<string | null>(null);
  const active = useRef(false), submitting = useRef(false), sessionDenied = useRef(false);
  const [search, setSearch] = useState(""), [mediaKind, setMediaKind] = useState("all");
  const appliedFilters = useRef({ query: "", kind: "all", folderId: "" });
  const readGeneration = useRef(0);
  const [folderId,setFolderId]=useState(""),[assetId,setAssetId]=useState<string|null>(null),[organizationBusy,setOrganizationBusy]=useState(false);
  const base = `/api/onlyfans-content/accounts/${encodeURIComponent(accountId)}`;
  const clearSelection = useCallback(() => { setSelected(new Map()); setPreviews(new Set()); }, []);
  const read = useCallback(async (after: string | null, filters = appliedFilters.current) => {
    const generation = ++readGeneration.current;
    try {
      const parameters = new URLSearchParams();
      if (after) parameters.set("afterMediaId", after);
      if (filters.query) parameters.set("q", filters.query);
      if (filters.kind !== "all") parameters.set("kind", filters.kind);
      if (filters.folderId) parameters.set("folderId", filters.folderId);
      const response = await fetch(base + "/vault" + (parameters.size ? "?" + parameters : ""), { credentials: "same-origin", cache: "no-store", redirect: "error" });
      if (!active.current || generation !== readGeneration.current) return false;
      if ([401, 403].includes(response.status)) {
        sessionDenied.current = true; setData(null); clearSelection(); setCreated(null); setLabel(""); setDescription(""); setPrice(""); setRetry(null); setDenied(true);
        setNotice("Your session cannot manage this vault. Sign in again."); router.refresh(); return false;
      }
      const next = response.ok ? parseVault(await response.json(), accountId) : null;
      if (!active.current || generation !== readGeneration.current) return false;
      if (!next) { setData(null); setNotice("The recorded vault could not be refreshed. Try again."); return false; }
      appliedFilters.current = filters; setData(next); setCursor(after);
      setSelected(previous=>new Map([...previous].map(([id,row])=>[id,next.items.find(item=>item.mediaId===id)??row])));
      return true;
    } catch { if (active.current && generation === readGeneration.current) { setData(null); setNotice("The recorded vault could not be refreshed. Try again."); } return false; }
  }, [accountId, base, clearSelection, router]);
  useEffect(() => { active.current = true; void read(null).then(ok => { if (active.current) { setBusy(false); if (ok) setNotice(""); } }); return () => { active.current = false; readGeneration.current++; }; }, [read]);
  async function refresh(after: string | null, reset = false) {
    setBusy(true); if (reset) clearSelection(); const ok = await read(after);
    if (active.current) { setBusy(false); if (ok) setNotice(""); }
  }
  const changeFolder = useCallback((id:string)=>{
    setFolderId(id);setBusy(true);clearSelection();
    void read(null,{...appliedFilters.current,folderId:id}).then(ok=>{if(active.current){setBusy(false);if(ok)setNotice("");}});
  },[read,clearSelection]);
  const organizationChanged = useCallback(()=>{void read(null);router.refresh();},[read,router]);
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
        nextRetry = null; message = "Sync request recorded. Refresh for the worker’s latest progress.";
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
  const videoCount = [...selected.values()].filter(row => row.kind === "video").length;
  const mediaValid = videoCount <= 1 && (!videoCount || [...selected.values()].filter(row => row.kind === "photo").every(row => previews.has(row.mediaId)));
  const readySelection = [...selected.values()].every(row=>row.ready&&["photo","video"].includes(row.kind));
  const productValid = readySelection && mediaValid && validVaultProduct(product);

  return <Card className="mb-6 min-w-0 p-4" data-of-vault-manager>
    <h2 className="font-semibold">Vault and catalogue products</h2>
    <p className="mt-1 text-xs text-muted">Sync this account’s existing OnlyFans vault, then choose assets and save a catalogue item for eligible offers.</p>
    {notice ? <p role="status" className="mt-3 text-sm" data-of-vault-notice>{notice}</p> : null}
    {!denied ? <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" className={buttonClass} data-of-vault-refresh disabled={busy} onClick={() => void refresh(null, true)}>Refresh vault</button>
      <button type="button" className={buttonClass} data-of-vault-sync disabled={busy || !!retry || data?.connectionRevision == null || data?.sync?.status === "pending" || data?.sync?.status === "running"}
        onClick={() => { if (data?.connectionRevision) void execute({ kind: "sync", body: { requestId: crypto.randomUUID(), expectedConnectionRevision: data.connectionRevision } }); }}>Sync vault</button>
      {data?.connectionRevision == null ? <Link className="self-center text-xs font-semibold text-accent" href={`/onlyfans/accounts?account=${encodeURIComponent(accountId)}`}>Configure account connection →</Link> : null}
    </div> : null}
    {data && !denied ? <>
      <div className="mt-4 rounded-lg border border-line p-3 text-xs" data-of-vault-sync-status>
        {data.sync ? <><p>Last sync: <strong>{SYNC_STATUS[data.sync.status]}</strong> · {data.sync.pagesRead} pages · {data.sync.itemsSeen} assets observed</p><p className="mt-1 text-muted">Updated {new Date(data.sync.updatedAt).toLocaleString()}{data.sync.completedAt ? ` · Completed ${new Date(data.sync.completedAt).toLocaleString()}` : ""}</p>{data.sync.lastError ? <p className="mt-1 text-muted">Sync needs review. Check the account connection and request a new sync when ready.</p> : null}</> : <p>No vault synchronization has been recorded.</p>}
      </div>
      <form className="mt-4 space-y-3" onSubmit={event => {
        event.preventDefault(); if (busy || retry) return;
        setBusy(true); void read(null, { query: search.trim(), kind: mediaKind, folderId }).then(ok => {
          if (active.current) { setBusy(false); if (ok) setNotice(""); }
        });
      }}>
        <MediaLibraryFilters tabs={[{ key: "all", label: "All" }, { key: "photo", label: "Photos" }, { key: "video", label: "Videos" }]}
          activeTab={mediaKind} onTabChange={setMediaKind} search={search} onSearchChange={setSearch} disabled={busy || !!retry} searchLimit={120} />
        <button type="submit" data-of-vault-search className={buttonClass} disabled={busy || !!retry}>Search vault</button>
      </form>
      <VaultOrganization accountId={accountId} assetId={assetId} selectedIds={[...selected.keys()]} folderId={folderId}
        onFolderChange={changeFolder} onChanged={organizationChanged} onBusy={setOrganizationBusy}/>
      <fieldset disabled={busy || !!retry || organizationBusy} className="mt-4 min-w-0">
        <legend className="text-sm font-semibold">Choose assets</legend>
        <div className="mt-2 min-w-0 overflow-x-auto"><table className="w-full min-w-[34rem] text-left text-xs"><thead><tr className="border-b border-line text-muted"><th className="p-2">Select</th><th className="p-2">Asset</th><th className="p-2">Description</th><th className="p-2">Details</th><th className="p-2">Availability</th></tr></thead><tbody>
          {data.items.map(row => <tr key={row.mediaId} className="border-b border-line align-top" data-of-vault-item={row.mediaId}>
            <td className="p-2"><input data-of-vault-select={row.mediaId} type="checkbox" aria-label={`Select asset ${row.mediaId}`} checked={selected.has(row.mediaId)} onChange={() => toggle(row)} /></td>
            <td className="p-2"><span className="block font-semibold capitalize">{row.kind}</span><span className="font-mono">#{row.mediaId}</span></td>
            <td className="max-w-56 break-words p-2">{row.description || "No saved description"}<button type="button" data-of-vault-edit={row.mediaId} className="mt-1 block text-xs font-semibold text-accent" onClick={()=>setAssetId(row.mediaId)}>Edit metadata</button></td>
            <td className="p-2">{row.durationSeconds === null ? "" : `${row.durationSeconds}s`}{row.width && row.height ? ` ${row.width} × ${row.height}` : ""}</td>
            <td className="p-2">{row.ready ? "Available" : row.reason === "removed" ? "Removed" : row.reason === "unsupported_kind" ? "Unsupported format" : "Needs review"}</td>
          </tr>)}
        </tbody></table></div>
        {!data.items.length ? <p className="mt-3 text-sm text-muted">No vault assets are recorded on this page.</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">{data.nextCursor ? <button type="button" data-of-vault-next className={buttonClass} onClick={() => void refresh(data.nextCursor)}>Next vault page →</button> : null}{cursor ? <button type="button" className={buttonClass} onClick={() => void refresh(null)}>First vault page</button> : null}</div>
      </fieldset>
      {selected.size>0&&!readySelection?<p className="mt-3 text-xs text-muted" data-of-vault-readiness-hold>Selected assets need verified availability before creating a catalogue item. You can still organize them in folders.</p>:null}
      <form className="mt-5 min-w-0" onSubmit={event => { event.preventDefault(); if (productValid) void execute({ kind: "create", body: { requestId: crypto.randomUUID(), product } }); }}>
        <fieldset disabled={busy || !!retry} className="min-w-0 space-y-3">
          <legend className="mb-2 text-sm font-semibold">Create catalogue item · {selected.size} selected</legend>
          {selected.size ? <ul className="space-y-2">{[...selected.values()].map(row => <li key={row.mediaId} className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-2 text-xs">
            <span className="font-mono">#{row.mediaId} · {row.kind}</span>{row.kind === "photo" ? <label className="flex items-center gap-2"><input data-of-vault-preview={row.mediaId} type="checkbox" checked={previews.has(row.mediaId)} onChange={event => { const next = new Set(previews); if (event.target.checked) next.add(row.mediaId); else next.delete(row.mediaId); setPreviews(next); }} />Free preview</label> : null}
            <button type="button" className="ml-auto text-accent" onClick={() => toggle(row)}>Remove</button>
          </li>)}</ul> : <p className="text-xs text-muted">Select available assets from the vault above. Choose photos, or one video with optional photo previews.</p>}
          {!mediaValid ? <p role="status" className="text-xs text-muted">Use one video with photo previews, or a set of photos. Every photo attached to a video must be marked as a free preview.</p> : null}
          {selected.size > 0 && previews.size >= selected.size ? <p role="status" className="text-xs text-muted">Keep at least one selected asset behind the paid unlock.</p> : null}
          <div className="grid min-w-0 gap-3 md:grid-cols-2"><label className="min-w-0 text-sm">Item label<input data-of-vault-product-label className={inputClass} maxLength={160} value={label} onChange={event => setLabel(event.target.value)} required /></label><label className="min-w-0 text-sm">Price (USD)<input data-of-vault-product-price className={inputClass} inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} required /><span className="mt-1 block text-xs text-muted">USD 3.00–200.00</span></label></div>
          <label className="block text-sm">What the fan receives<textarea data-of-vault-product-description className={`${inputClass} min-h-24`} maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} required /></label>
          <label className="flex items-start gap-2 text-sm"><input data-of-vault-product-enabled type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} /><span>Enable this item for eligible offers</span></label>
          <button type="submit" data-of-vault-create className={buttonClass} disabled={!productValid}>Create catalogue item</button>
        </fieldset>
      </form>
      {created ? <div className="mt-4 rounded-lg border border-line p-3 text-sm" data-of-vault-created={created}>Catalogue item #{created} was recorded.<ContentEditor key={created} accountId={accountId} itemId={created} /></div> : null}
    </> : null}
    {retry && !denied ? <div className="mt-4 flex flex-wrap gap-2"><button type="button" data-of-vault-retry className={buttonClass} disabled={busy} onClick={() => void execute(retry)}>Retry same request</button><button type="button" className={buttonClass} disabled={busy || !data} onClick={() => { setRetry(null); clearSelection(); setNotice("Review the recorded catalogue and sync status before starting another request. The previous command may already have committed."); }}>Use refreshed vault</button></div> : null}
  </Card>;
}
