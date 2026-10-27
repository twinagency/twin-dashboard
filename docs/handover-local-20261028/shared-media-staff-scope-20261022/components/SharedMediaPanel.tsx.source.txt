"use client";
import { useEffect, useRef, useState } from "react";
type Selection = { sourceId: string; kind: "photo" | "video" };
type Transfer = Selection & { id: string; status: string; processing: boolean; mediaId: string | null; receivedBytes: number; sizeBytes: number; error: string | null };
type Account = { accountId: string; binding: { creatorId: string; handle: string }; health: string };
const button = "min-h-11 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-accent disabled:opacity-50";
const labels: Record<string,string> = { prepared: "Ready to transfer", receiving: "Transferring saved file", pending: "Queued for OnlyFans", running: "Uploading to OnlyFans", complete: "Available in OnlyFans vault", failed: "Needs review", interrupted: "Interrupted — review required", superseded: "Connection changed", expired: "Cancelled or expired" };

export default function SharedMediaPanel({ creatorId, selected }: { creatorId: string; selected: Selection[] }) {
  const [open, setOpen] = useState(false), [accounts, setAccounts] = useState<Account[]>([]), [accountId, setAccountId] = useState("");
  const [transfers, setTransfers] = useState<Transfer[]>([]), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false);
  const live = useRef(true), running = useRef(false), controller = useRef<AbortController | null>(null);
  useEffect(() => { live.current = true; return () => { live.current = false; controller.current?.abort(); }; }, []);
  const endpoint = (account: string) => `/api/onlyfans-content/accounts/${encodeURIComponent(account)}/shared-media?creator=${encodeURIComponent(creatorId)}`;
  async function request(url: string, body?: unknown) {
    const response = await fetch(url, { credentials: "same-origin", cache: "no-store", redirect: "error", ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), signal: AbortSignal.any([AbortSignal.timeout(60000), ...(controller.current ? [controller.current.signal] : [])]) });
    const value = await response.json();
    if (!response.ok) throw Error([401,403].includes(response.status) ? "Your access changed. Refresh the page before continuing." : value.error || "The upload was not confirmed. Refresh before resuming.");
    return value;
  }
  async function refresh(account = accountId) {
    if (!account) return;
    const value = await request(endpoint(account));
    if (!value.ok || value.creatorId !== creatorId || value.accountId !== account || !Array.isArray(value.transfers)) throw Error("Shared upload status could not be verified.");
    if (live.current) { setTransfers(value.transfers); if (!value.statusAvailable) setNotice("OnlyFans upload status is temporarily unavailable. Saved receipts are shown below."); }
  }
  async function loadAccounts() {
    try {
      const value = await request(`/api/onlyfans/accounts?creator=${encodeURIComponent(creatorId)}`);
      if (!Array.isArray(value.accounts) || value.accounts.some((a: Account) => a.binding.creatorId !== creatorId)) throw Error("Connected accounts could not be verified.");
      if (!live.current) return;
      setAccounts(value.accounts); setLoaded(true);
      const first = value.accounts[0]?.accountId ?? ""; setAccountId(first); if (first) await refresh(first);
    } catch (error) { if (live.current) setNotice(error instanceof Error ? error.message : "Accounts are unavailable."); }
  }
  async function transfer() {
    if (running.current || !accountId || !selected.length || selected.length > 20) return;
    running.current = true; controller.current = new AbortController(); setBusy(true); setNotice("Starting the selected saved files…");
    try {
      for (const item of [...selected]) {
        let finished = false;
        while (live.current && !finished) {
          const result = await request(endpoint(accountId), item), row = result.transfer as Transfer;
          if (!result.ok || !row || row.sourceId !== item.sourceId || row.kind !== item.kind) throw Error("Transfer status could not be verified.");
          if (!live.current) return;
          setTransfers(current => [row, ...current.filter(previous => previous.id !== row.id)]);
          if (row.status === "complete") { finished = true; break; }
          if (!["prepared","receiving","pending","running"].includes(row.status)) throw Error("This transfer needs review in the OnlyFans upload history. It will not be uploaded again automatically.");
          setNotice(labels[row.status] ?? "Checking the saved transfer…");
          await new Promise(resolve => setTimeout(resolve, ["pending","running"].includes(row.status) ? 3000 : 100));
        }
      }
      if (live.current) setNotice("The selected files reached the OnlyFans vault. Files marked Processing still need OnlyFans to finish processing.");
    } catch (error) { if (live.current) setNotice(error instanceof Error ? error.message : "Transfer interrupted. Resume these same saved files."); }
    finally { running.current = false; if (live.current) setBusy(false); }
  }
  return <section className="rounded-xl border border-line bg-panel p-4" aria-label="Share saved content across channels">
    <button type="button" className="flex min-h-11 w-full items-center justify-between text-left font-semibold" aria-expanded={open} onClick={() => { setOpen(value => !value); if (!open && !loaded) void loadAccounts(); }}>Use content across channels <span aria-hidden="true">{open ? "−" : "+"}</span></button>
    {open && <div className="mt-3 space-y-3">
      <p className="text-sm text-muted">Upload once to this creator’s library. Use Edit/select to choose saved photos or videos, then add the same files to OnlyFans without uploading them again from your device.</p>
      {loaded && !accounts.length ? <p className="text-sm text-muted">No OnlyFans account is connected to this creator.</p> : <label className="block text-sm">OnlyFans account<select className="mt-1 block w-full rounded-lg border border-line bg-panel p-3" value={accountId} disabled={busy} onChange={event => { const id = event.target.value; setAccountId(id); setTransfers([]); setNotice(""); void refresh(id).catch(error => setNotice(error.message)); }}><option value="">Choose an account</option>{accounts.map(account => <option key={account.accountId} value={account.accountId}>{account.binding.handle} · {account.health}</option>)}</select></label>}
      <div className="flex flex-wrap items-center gap-3"><button type="button" className={button} disabled={busy || !accountId || !selected.length || selected.length > 20 || accounts.find(a => a.accountId === accountId)?.health !== "connected"} onClick={() => void transfer()}>{busy ? "Sharing saved files…" : `Add / resume ${selected.length} selected in OnlyFans`}</button><button type="button" className={button} disabled={busy || !accountId} onClick={() => void refresh().catch(error => setNotice(error.message))}>Refresh status</button></div>
      <p className="text-xs text-muted">Up to 20 selected files, 64 MB each. Uses the saved Telegram-ready copy. OnlyFans prices and product settings are managed separately. Closing this page pauses file transfer; reselect the same files to resume.</p>
      <p className="text-xs text-muted">OnlyFans vault uploads use a temporary scheduled post that is removed after upload. If removal needs attention, this panel stops and asks you to review the account’s upload history. No fan messages are sent.</p>
      {notice && <p className="text-sm" role="status">{notice}</p>}
      {!!transfers.length && <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">{transfers.map(row => <li key={row.id} className="rounded-lg border border-line p-3"><div className="flex flex-wrap justify-between gap-2"><span>{row.kind === "photo" ? "Photo" : "Video"} · {row.sourceId.slice(0,8)}</span><span>{row.status === "complete" && row.processing ? "Processing in OnlyFans" : labels[row.status] ?? "Needs review"}</span></div>{row.status === "receiving" && <progress className="mt-2 w-full" max={row.sizeBytes} value={row.receivedBytes} aria-label="Saved file transfer progress" />}{row.error && <p className="mt-1 text-muted">{row.error}</p>}</li>)}</ul>}
    </div>}
  </section>;
}
