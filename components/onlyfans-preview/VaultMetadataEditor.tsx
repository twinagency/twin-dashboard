"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { inputCls } from "@/components/clone/fields";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { parseVaultResource, parseVaultEditAck, validVaultEdit, type AssetMetadata, type VaultEditRequest } from "@/lib/onlyfans/vault-editing";

const button = "min-h-11 rounded-lg border border-line px-4 py-2 text-sm font-semibold text-accent disabled:opacity-50";

export default function VaultMetadataEditor({ accountId, mediaId, onClose, onChanged }: {
  accountId: string; mediaId: string; onClose: () => void; onChanged: () => void;
}) {
  const resource = `assets/${mediaId}`;
  const url = `/api/onlyfans-content/accounts/${encodeURIComponent(accountId)}/vault/manage/${resource}`;
  const active = useRef(false), submitting = useRef(false), sessionDenied = useRef(false);
  const [asset, setAsset] = useState<AssetMetadata | null>(null);
  const [description, setDescription] = useState(""), [tags, setTags] = useState("");
  const [busy, setBusy] = useState(true), [denied, setDenied] = useState(false);
  const [notice, setNotice] = useState("Loading description and tags…");
  const [pending, setPending] = useState<VaultEditRequest | null>(null);
  const load = useCallback(async () => {
    try {
      const response = await fetch(url, { cache: "no-store", credentials: "same-origin", redirect: "error", signal: AbortSignal.timeout(15000) });
      if (!active.current) return false;
      if ([401, 403].includes(response.status)) {
        setAsset(null); setDescription(""); setTags(""); setPending(null); setDenied(true); sessionDenied.current = true;
        setNotice("Your session cannot edit this asset. Sign in again."); return false;
      }
      const next = response.ok ? parseVaultResource(await response.json(), accountId, resource) as AssetMetadata | null : null;
      if (!active.current) return false;
      if (!next) throw new Error("Unavailable");
      setAsset(next); setDescription(next.description ?? ""); setTags(next.tags?.join(", ") ?? ""); return true;
    } catch {
      if (active.current) { setAsset(null); setNotice("The description and tags could not be loaded. Try again."); }
      return false;
    }
  }, [url, accountId, resource]);
  useEffect(() => {
    active.current = true;
    void load().then(ok => { if (active.current) { setBusy(false); if (ok) setNotice(""); } });
    return () => { active.current = false; };
  }, [load]);
  async function save(body: VaultEditRequest) {
    if (submitting.current || !validVaultEdit(resource, body)) return;
    submitting.current = true; setBusy(true); setNotice("Saving description and tags…");
    let retry: VaultEditRequest | null = body;
    let message = "Save not confirmed. Retry this same edit to safely check its outcome.";
    try {
      const response = await fetch(url, { method: "POST", cache: "no-store", credentials: "same-origin", redirect: "error",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
      if (!active.current) return;
      if ([401, 403].includes(response.status)) {
        retry = null; setAsset(null); setDescription(""); setTags(""); setPending(null); setDenied(true); sessionDenied.current = true;
        setNotice("Your session cannot edit this asset. Sign in again."); return;
      }
      const ack = response.ok ? parseVaultEditAck(await response.json(), accountId, resource) : null;
      if (ack) { retry = null; message = "Description and tags saved."; onChanged(); }
      else if ([400, 404, 409, 413, 503].includes(response.status)) {
        retry = null; message = response.status === 409 ? "This asset changed. Review the refreshed values before saving again." : "The edit was refused. Check the description and tags, then try again.";
      }
      const refreshed = await load();
      if (active.current && refreshed) setNotice(message);
    } catch { if (active.current) setNotice(message); }
    finally { if (active.current) { setPending(sessionDenied.current ? null : retry); setBusy(false); } submitting.current = false; }
  }
  const patch = { description: description || null, tags: tags.split(",").map(tag => tag.trim()).filter(Boolean) };
  const body: VaultEditRequest | null = asset ? { requestId: "00000000-0000-4000-8000-000000000000", expectedFingerprint: asset.fingerprint, patch } : null;
  const dirty = !!asset && (description !== (asset.description ?? "") || tags !== (asset.tags?.join(", ") ?? ""));
  return <Dialog open onOpenChange={open => { if (!open && !submitting.current && (!pending || denied)) onClose(); }}>
    <DialogContent className="max-h-[85dvh] overflow-y-auto bg-panel text-ink sm:max-w-lg" showCloseButton={!submitting.current && (!pending || denied)} data-of-vault-metadata-dialog>
      <DialogHeader><DialogTitle>Edit description and tags</DialogTitle><DialogDescription>Asset #{mediaId}. These details organize your Twin library.</DialogDescription></DialogHeader>
      {notice ? <p role="status" data-of-vault-edit-notice className="text-sm">{notice}</p> : null}
      {asset && !denied ? <form data-of-vault-asset-editor={mediaId} onSubmit={event => { event.preventDefault(); if (body && dirty && !busy && !pending) void save({ ...body, requestId: crypto.randomUUID() }); }}>
        <fieldset disabled={busy || !!pending} className="min-w-0 space-y-4">
          <label className="block text-sm">Description<textarea data-of-vault-asset-description className={`${inputCls} mt-1 min-h-28`} value={description} maxLength={2000} onChange={event => setDescription(event.target.value)} /></label>
          <label className="block text-sm">Tags, separated by commas<input data-of-vault-asset-tags className={`${inputCls} mt-1`} value={tags} maxLength={1000} placeholder="e.g. outdoors, summer" onChange={event => setTags(event.target.value)} /></label>
          <p className="text-xs text-muted">Use up to 12 tags. Your saved edits are protected from automatic replacement.</p>
          {dirty && body && !validVaultEdit(resource, body) ? <p role="status" className="text-sm">Keep the description under 2,000 bytes and each of the 12 tags under 80 bytes.</p> : null}
          <button type="submit" data-of-vault-asset-save className={button} disabled={!dirty || !body || !validVaultEdit(resource, body)}>Save changes</button>
        </fieldset>
      </form> : null}
      {pending && !denied ? <div className="flex flex-wrap gap-2"><button type="button" data-of-vault-edit-retry className={button} disabled={busy} onClick={() => void save(pending)}>Retry same edit</button><button type="button" className={button} disabled={busy} onClick={() => { setPending(null); setNotice("The previous edit may already be saved. Reload to check before changing it."); }}>Review current values</button></div> : null}
      {!busy && !pending && !denied ? <button type="button" className={button} onClick={() => { setBusy(true); void load().then(ok => { if (active.current) { setBusy(false); if (ok) setNotice(""); } }); }}>Reload saved details</button> : null}
    </DialogContent>
  </Dialog>;
}
