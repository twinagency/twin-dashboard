"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Info, inputCls } from "@/components/clone/fields";
import { parseVault, vaultAvailability, vaultDuration, type VaultItem, type VaultRead } from "@/lib/onlyfans/vault";
import { contentHistoryLabels, type FanContentHistory } from "@/lib/onlyfans/chat-content-history";
import VaultAssetPreview from "./VaultAssetPreview";
import VaultOrganization from "./VaultOrganization";

const button = "min-h-9 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-accent disabled:opacity-50";
const noop = () => {};

/** Read-only browse of ONE account's vault. Parent keys this by accountId, and every read is aborted or ignored once it goes stale. */
export default function ChatVaultBrowser({ accountId, history, contentHref, onDenied }: {
  accountId: string; history: FanContentHistory; contentHref: string; onDenied?: () => void;
}) {
  const [data, setData] = useState<VaultRead | null>(null), [busy, setBusy] = useState(true), [notice, setNotice] = useState("Loading media…");
  const [query, setQuery] = useState(""), [kind, setKind] = useState("all"), [folderId, setFolderId] = useState("");
  const [cursor, setCursor] = useState<string | null>(null), [trail, setTrail] = useState<(string | null)[]>([]);
  const [picked, setPicked] = useState<VaultItem | null>(null);
  const filters = useRef({ query: "", kind: "all", folderId: "" }), generation = useRef(0), controller = useRef<AbortController | null>(null);
  const denied = useRef(onDenied); denied.current = onDenied;
  const read = useCallback(async (after: string | null, next = filters.current) => {
    controller.current?.abort(); const abort = controller.current = new AbortController(), stamp = ++generation.current; setBusy(true);
    const stale = () => abort.signal.aborted || stamp !== generation.current;
    try {
      const params = new URLSearchParams();
      if (after) params.set("afterMediaId", after);
      if (next.query) params.set("q", next.query);
      if (next.kind !== "all") params.set("kind", next.kind);
      if (next.folderId) params.set("folderId", next.folderId);
      const response = await fetch(`/api/onlyfans-content/accounts/${encodeURIComponent(accountId)}/vault?${params}`, {
        credentials: "same-origin", cache: "no-store", redirect: "error", signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]),
      });
      if (stale()) return false;
      if ([401, 403].includes(response.status)) { denied.current?.(); setData(null); setNotice("Your session cannot read this vault. Sign in again."); return false; }
      const parsed = response.ok ? parseVault(await response.json(), accountId) : null;
      if (stale()) return false;
      if (!parsed) throw Error("Unavailable");
      filters.current = next; setData(parsed); setCursor(after); setNotice(""); return true;
    } catch { if (!stale()) { setData(null); setNotice("Media could not be loaded. Retry to browse files."); } return false; }
    finally { if (!stale()) setBusy(false); }
  }, [accountId]);
  useEffect(() => { void read(null); return () => { generation.current++; controller.current?.abort(); }; }, [read]);
  const filter = (next: { query: string; kind: string; folderId: string }) => { setTrail([]); setPicked(null); void read(null, next); };
  const changeFolder = useCallback((id: string) => { setFolderId(id); setTrail([]); setPicked(null); void read(null, { ...filters.current, folderId: id }); }, [read]);
  async function go(after: string | null, nextTrail: (string | null)[]) { if (await read(after)) setTrail(nextTrail); }
  return <div data-of-chat-vault>
    <form className="space-y-2" onSubmit={event => { event.preventDefault(); event.stopPropagation(); if (!busy) filter({ query: query.trim(), kind, folderId }); }}>
      <label className="block text-xs font-medium text-muted">Search descriptions, names and tags
        <input type="search" className={`${inputCls} mt-1 w-full`} maxLength={120} value={query} onChange={event => setQuery(event.target.value)} />
      </label>
      <div className="flex flex-wrap items-end gap-2">
        <div role="group" aria-label="Media type" className="flex gap-1">
          {[["all", "All"], ["photo", "Photos"], ["video", "Videos"]].map(([value, label]) => <button key={value} type="button" aria-pressed={kind === value} disabled={busy}
            className={`${button} ${kind === value ? "bg-accent text-white" : ""}`} onClick={() => { setKind(value); filter({ query: query.trim(), kind: value, folderId }); }}>{label}</button>)}
        </div>
        <button type="submit" className={button} disabled={busy}>Search media</button>
      </div>
    </form>
    <VaultOrganization compact readOnly accountId={accountId} selectedIds={[]} folderId={folderId} onFolderChange={changeFolder} onChanged={noop} onBusy={noop} />
    {notice ? <p role="status" className="mt-3 text-xs">{notice}</p> : null}
    <div className="mt-3 grid min-w-0 gap-3 min-[380px]:grid-cols-2 sm:grid-cols-3" data-of-chat-vault-grid>
      {data?.items.map(row => {
        const labels = contentHistoryLabels(history, row.mediaId), availability = vaultAvailability(row);
        return <article key={row.mediaId} className="min-w-0 rounded-xl border border-line p-3" data-of-chat-vault-item={row.mediaId}>
          <VaultAssetPreview accountId={accountId} mediaId={row.mediaId} kind={row.kind} readOnly />
          <p className="min-w-0 break-words text-sm">{row.description || `${row.kind} #${row.mediaId}`}</p>
          <p className="text-xs text-muted">{row.kind} {vaultDuration(row.durationSeconds)}</p>
          <p className="mt-1 text-xs" title={availability.explanation}>{availability.label}</p>
          <ul className="mt-1 flex flex-wrap gap-1" aria-label="Fan history for this media" data-of-chat-history>
            {labels.map(label => <li key={label} className="rounded-full bg-elev px-2 py-0.5 text-[11px] text-muted">{label}</li>)}
          </ul>
          <button type="button" className={`${button} mt-2`} aria-pressed={picked?.mediaId === row.mediaId} onClick={() => setPicked(row)}>Choose media</button>
        </article>;
      })}
    </div>
    {data && !data.items.length ? <p className="mt-3 text-sm">No media matches this view. Try another search, type or folder.</p> : null}
    {picked ? <div role="alert" className="mt-3 rounded-lg border border-line p-3 text-sm" data-of-chat-media-unprepared={picked.mediaId}>
      <p className="font-semibold">This media is not prepared for sale yet.</p>
      <p className="mt-1 text-xs">Chat sends saved offers only. Media #{picked.mediaId} is not linked to a saved offer that chat can send, so it cannot be attached on its own.
        <Info className="ml-1" text="The saved offer list does not report which media each offer contains, so Twin cannot show or confirm membership from chat. Create an offer on the Content page, set its price there, then pick it from Saved offers." /></p>
      <Link href={contentHref} className="mt-2 inline-block text-xs font-semibold text-accent underline">Create an offer on the Content page</Link>
    </div> : null}
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button type="button" className={button} disabled={busy || !trail.length} onClick={() => void go(trail.at(-1) ?? null, trail.slice(0, -1))}>Previous media</button>
      <span className="text-xs">Page {trail.length + 1}</span>
      <button type="button" className={button} disabled={busy || !data?.nextCursor} onClick={() => data?.nextCursor && void go(data.nextCursor, [...trail, cursor])}>Next media</button>
    </div>
  </div>;
}
