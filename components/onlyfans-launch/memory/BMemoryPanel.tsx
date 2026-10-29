"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { parseWorkspaceScope, workspaceHref } from "@/lib/onlyfans-preview/scope";
import { useCallback, useEffect, useRef, useState } from "react";
import { type BAccount } from "@/lib/onlyfans/launch/automation/b-automation";
import { readAccounts } from "@/lib/onlyfans/launch/automation/b-automation-client";
import { MEMORY_FIELD_LIMITS, correctFact, memoryValueError, readCoverage, readFanMemory, resumeHistory, type FanMemoryView, type MemoryCorrection, type MemoryCoveragePage } from "@/lib/onlyfans/launch/memory/b-memory-client";
import { MEMORY_FIELDS, type MemoryField, type MemoryProgress, type NativeMemory, type RecoveryProgress } from "@/lib/onlyfans/launch/native";
import { bTime, type BReply } from "@/lib/onlyfans/launch/b-common";
import { BAccountSwitcher, BError, BLoading, bButton } from "../b-shared/BShared";

type Load<T> = { state: "loading" } | { state: "ok"; data: T } | { state: "error"; message: string } | { state: "denied" };
const loading = { state: "loading" } as const;
function toLoad<T>(r: BReply<T>): Load<T> | null {
  if (r.kind === "stale") return null;
  if (r.kind === "ok") return { state: "ok", data: r.data };
  if (r.kind === "denied" || r.kind === "readonly") return { state: "denied" };
  return { state: "error", message: "error" in r ? r.error : "Memory is unavailable. Refresh the account." };
}
const FIELD_LABELS: Record<MemoryField, string> = { real_name: "Name", his_age: "Age", home_city: "City", home_country: "Country", hobbies: "Hobbies", occupation: "Occupation", fetishes: "Preferences", short_bio: "Saved profile", bullet_points: "Saved profile notes" };
type Edit = { field: MemoryField; value: string; reason: string; error: string };
type PendingCorrection = { accountId: string; fanId: string; correction: MemoryCorrection };

/** Native account-scoped memory. Archive recovery and stored-message processing remain separate. */
export default function BMemoryPanel({ canManage = false, canRecover = canManage, initialAccountId, selectedAccountId, selectedFanId }: { canManage?: boolean; canRecover?: boolean; initialAccountId?: string; selectedAccountId?: string; selectedFanId?: string }) {
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();
  const chooseAccount = (id: string) => { setAccountId(id); router.replace(workspaceHref(pathname, { ...parseWorkspaceScope(params), accountId: id }), { scroll: false }); };
  const [accounts, setAccounts] = useState<Load<BAccount[]>>(loading), [accountId, setAccountId] = useState("");
  const [coverage, setCoverage] = useState<Load<MemoryCoveragePage>>(loading), [fan, setFan] = useState<Load<FanMemoryView>>(loading);
  const [fanId, setFanId] = useState(""), [query, setQuery] = useState(""), [edit, setEdit] = useState<Edit | null>(null);
  const [notice, setNotice] = useState(""), [paging, setPaging] = useState(false), [busy, setBusy] = useState(false), [permissionDenied, setPermissionDenied] = useState(false);
  const [pending, setPending] = useState<PendingCorrection | null>(null);
  const accountRef = useRef(accountId), fanRef = useRef(fanId), queryRef = useRef(query);
  accountRef.current = accountId; fanRef.current = fanId; queryRef.current = query;
  const accountsCtl = useRef<AbortController | null>(null), listCtl = useRef<AbortController | null>(null), fanCtl = useRef<AbortController | null>(null), commandCtl = useRef<AbortController | null>(null);
  const listEpoch = useRef(0), fanEpoch = useRef(0);
  const manage = canManage && !permissionDenied;

  const loadAccounts = useCallback(async () => {
    accountsCtl.current?.abort(); const c = new AbortController(); accountsCtl.current = c; setAccounts(loading);
    const l = toLoad(await readAccounts(c.signal)); if (!l || c.signal.aborted) return;
    setAccounts(l);
    if (l.state === "ok") {
      const wanted = selectedAccountId ?? initialAccountId;
      if (wanted && !l.data.some(a => a.accountId === wanted)) { setAccounts({ state: "denied" }); setAccountId(""); return; }
      setAccountId(old => wanted ?? (old && l.data.some(a => a.accountId === old) ? old : l.data[0]?.accountId ?? ""));
    }
  }, [selectedAccountId, initialAccountId]);
  useEffect(() => { void loadAccounts(); return () => { accountsCtl.current?.abort(); }; }, [loadAccounts]);

  const loadCoverage = useCallback(async (id: string, cursor?: string) => {
    listCtl.current?.abort(); const c = new AbortController(); listCtl.current = c; const mine = ++listEpoch.current;
    if (cursor === undefined) setCoverage(loading); else setPaging(true);
    const l = toLoad(await readCoverage(id, c.signal, cursor));
    if (!l || c.signal.aborted || mine !== listEpoch.current || accountRef.current !== id) return;
    setPaging(false);
    setCoverage(previous => {
      if (cursor === undefined || l.state !== "ok" || previous.state !== "ok") return l;
      const rows = new Map(previous.data.fans.map(row => [row.fanId, row]));
      for (const row of l.data.fans) rows.set(row.fanId, row);
      return { state: "ok", data: { ...l.data, fans: [...rows.values()] } };
    });
  }, []);
  const loadFan = useCallback(async (id: string, selectedFan: string, reset = false, search?: string) => {
    fanCtl.current?.abort(); const c = new AbortController(); fanCtl.current = c; const mine = ++fanEpoch.current;
    if (reset) { setFanId(selectedFan); fanRef.current = selectedFan; setEdit(null); setNotice(""); setQuery(""); }
    setFan(loading);
    const l = toLoad(await readFanMemory(id, selectedFan, c.signal, search ?? (reset ? "" : queryRef.current)));
    if (l && !c.signal.aborted && mine === fanEpoch.current && accountRef.current === id && fanRef.current === selectedFan) setFan(l);
  }, []);
  useEffect(() => {
    listCtl.current?.abort(); fanCtl.current?.abort(); commandCtl.current?.abort(); listEpoch.current++; fanEpoch.current++;
    setCoverage(loading); setFan(loading); setFanId(""); fanRef.current = ""; setEdit(null); setNotice(""); setQuery(""); setPending(null); setBusy(false); setPaging(false); setPermissionDenied(false);
    if (accountId) {
      if (selectedFanId) void loadFan(accountId, selectedFanId, true);
      else void loadCoverage(accountId);
    }
    return () => { listCtl.current?.abort(); fanCtl.current?.abort(); commandCtl.current?.abort(); };
  }, [accountId, loadCoverage, loadFan, selectedFanId]);

  async function sendCorrection(command: PendingCorrection) {
    if (!manage || busy || command.accountId !== accountRef.current || command.fanId !== fanRef.current) return;
    commandCtl.current?.abort(); const c = new AbortController(); commandCtl.current = c; setBusy(true); setNotice("");
    const r = await correctFact(command.accountId, command.fanId, command.correction, c.signal);
    if (c.signal.aborted || accountRef.current !== command.accountId || fanRef.current !== command.fanId) return;
    setBusy(false);
    if (r.kind === "stale") return;
    if (r.kind === "ok") {
      setPending(null); setEdit(null); setNotice(r.data.replayed ? "The same correction was already recorded. Reading current memory." : "Correction recorded. Reading current memory.");
      await loadFan(command.accountId, command.fanId);
    } else if (r.kind === "unconfirmed") {
      setPending(command); setNotice("The correction outcome is unconfirmed. Current memory is being refreshed. You may retry the identical correction.");
      await loadFan(command.accountId, command.fanId);
    } else {
      setPending(null);
      if (r.kind === "denied" || r.kind === "readonly") { setPermissionDenied(true); setNotice("Your current access does not allow this correction."); }
      else setNotice(r.kind === "refused" && r.status === 409 ? "Memory changed since this view. Current memory is being refreshed. Review it before making another correction." : "error" in r ? r.error : "The correction was not accepted.");
      await loadFan(command.accountId, command.fanId);
    }
  }
  async function save(operation: "set" | "clear") {
    if (!edit || fan.state !== "ok" || !manage || busy) return;
    const value = edit.value.trim(), reason = edit.reason.trim();
    const error = !reason ? "Give a reason for the audit record." : reason.length > 512 ? "Keep the reason within 512 characters." : operation === "set" && memoryValueError(edit.field, value) ? memoryValueError(edit.field, value)! : /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(reason) ? "Remove control characters." : "";
    if (error) { setEdit({ ...edit, error }); return; }
    const command: PendingCorrection = { accountId, fanId, correction: { field: edit.field, operation, value: operation === "clear" ? null : value, expectedVersion: fan.data.memory.version, reason } };
    await sendCorrection(command);
  }
  async function backfill(selectedFan?: string) {
    if (!manage || !canRecover || busy) return;
    const id = accountId; commandCtl.current?.abort(); const c = new AbortController(); commandCtl.current = c; setBusy(true); setNotice("");
    const r = await resumeHistory(id, selectedFan, c.signal);
    if (c.signal.aborted || accountRef.current !== id) return;
    setBusy(false); if (r.kind === "stale") return;
    if (r.kind === "ok") setNotice("Recovery scheduling was recorded. Read progress below; this does not mean recovery is complete.");
    else if (r.kind === "denied" || r.kind === "readonly") { setPermissionDenied(true); setNotice("Your current access does not allow recovery commands."); }
    else setNotice(r.kind === "unconfirmed" ? "The scheduling outcome is unconfirmed. Reading current progress." : "error" in r ? r.error : "Recovery was not scheduled.");
    await loadCoverage(id);
    if (selectedFan && fanRef.current === selectedFan) await loadFan(id, selectedFan);
  }

  const selectedName = coverage.state === "ok" ? coverage.data.fans.find(f => f.fanId === fanId) : undefined;
  return <section className="grid min-w-0 gap-4 p-3" aria-labelledby="b-mem-h" data-b-memory>
    <h2 id="b-mem-h" className="text-lg font-semibold">Fan memory</h2>
    {!manage ? <p className="text-sm" role="note" data-b-readonly>Read-only access: you can inspect memory and progress.</p> : null}
    {accounts.state === "loading" ? <BLoading label="Loading accounts…" /> : null}
    {accounts.state === "error" ? <BError message={accounts.message} onRetry={() => void loadAccounts()} /> : null}
    {accounts.state === "denied" ? <p role="alert" className="text-sm">Your session cannot read accounts. Sign in again.</p> : null}
    {accounts.state === "ok" && accounts.data.length === 0 ? <p className="text-sm" data-b-state="empty">No OnlyFans accounts are connected yet.</p> : null}
    {accounts.state === "ok" && accountId ? <>
      {!selectedAccountId ? <BAccountSwitcher id="b-mem-acct" accounts={accounts.data} value={accountId} onChange={chooseAccount} /> : <p className="text-sm">{accounts.data.find(a => a.accountId === accountId)?.handle ?? accountId} · fan {selectedFanId}</p>}
      <div className="flex flex-wrap gap-2"><button type="button" className={bButton} onClick={() => { if (!selectedFanId) void loadCoverage(accountId); if (fanId) void loadFan(accountId, fanId); }}>Refresh current state</button>
        {!selectedFanId ? <button type="button" className={bButton} disabled={!manage || !canRecover || busy} onClick={() => void backfill()}>Resume account recovery</button> : null}</div>
      {!selectedFanId && coverage.state === "loading" ? <BLoading label="Loading history and fans…" /> : null}
      {coverage.state === "error" ? <BError message={coverage.message} onRetry={() => void loadCoverage(accountId)} /> : null}
      {coverage.state === "denied" ? <p role="alert" className="text-sm">Your session cannot read memory for this account.</p> : null}
      {!selectedFanId && coverage.state === "ok" ? <>
        <div className="min-w-0 rounded-xl border border-line p-3" data-b-card="coverage"><h3 className="font-semibold">Account recovery</h3><RecoveryView progress={coverage.data.progress} /></div>
        <div className="min-w-0 rounded-xl border border-line p-3" data-b-card="fans"><h3 className="font-semibold">Fans</h3>
          {coverage.data.fans.length === 0 ? <p className="mt-2 text-sm" data-b-state="empty">No canonical fan rows are available yet.</p> :
            <ul className="mt-2 grid min-w-0 gap-2">{coverage.data.fans.map(f => <li key={f.fanId}>
              <button type="button" className={`${bButton} w-full text-left`} disabled={busy} aria-pressed={fanId === f.fanId} data-b-fan={f.fanId} onClick={() => void loadFan(accountId, f.fanId, true)}>
                <span className="break-words">{f.displayName || f.username || `Fan ${f.fanId}`}</span><span className="block text-xs font-normal text-muted">Stored-message processing: {f.processedMessages} / {f.storedMessages} · archive: {f.archive?.status ?? "not started"}</span>
              </button></li>)}</ul>}
          {coverage.data.nextCursor ? <button type="button" className={`${bButton} mt-3`} disabled={paging} onClick={() => void loadCoverage(accountId, coverage.data.nextCursor!)}>{paging ? "Loading…" : "Load more fans"}</button> : null}
        </div></> : null}
      <div aria-live="polite" className="min-h-5 text-sm" data-b-notice>{notice}</div>
      {pending && pending.accountId === accountId && pending.fanId === fanId ? <button type="button" className={bButton} disabled={!manage || busy} onClick={() => void sendCorrection(pending)}>Retry identical correction</button> : null}
      {fanId ? <div className="min-w-0 rounded-xl border border-line p-3" data-b-card="fan">
        {fan.state === "loading" ? <BLoading label="Loading current fan memory…" /> : null}
        {fan.state === "error" ? <BError message={fan.message} onRetry={() => void loadFan(accountId, fanId)} /> : null}
        {fan.state === "denied" ? <p role="alert" className="text-sm">Your session cannot read this fan.</p> : null}
        {fan.state === "ok" ? <div className="grid min-w-0 gap-4">
          <h3 className="break-words font-semibold">{selectedName?.displayName || selectedName?.username || `Fan ${fanId}`}</h3>
          {!selectedFanId ? <><MemoryProgressView progress={fan.data.progress} /><RecoveryView progress={fan.data.recovery} /></> : null}
          {!selectedFanId ? <button type="button" className={bButton} disabled={!manage || !canRecover || busy} onClick={() => void backfill(fanId)}>Resume this fan's recovery</button> : null}
          <FanFacts memory={fan.data.memory} manage={manage} busy={busy} edit={edit} setEdit={setEdit} onSave={save} />
          <div className="grid min-w-0 gap-2"><h4 className="text-sm font-semibold">Source excerpts</h4>
            <form className="flex min-w-0 flex-wrap gap-2" onSubmit={e => { e.preventDefault(); void loadFan(accountId, fanId, false, query); }}>
              <label htmlFor="b-memory-query" className="sr-only">Search source excerpts</label><input id="b-memory-query" maxLength={2000} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search stored messages" className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-transparent px-2" />
              <button className={bButton} type="submit">Search excerpts</button></form>
            {fan.data.memory.interactions.length ? <ul className="grid gap-2">{fan.data.memory.interactions.map((x, index) => <li key={`${x.sourceMessageId}-${index}`} className="min-w-0 rounded-lg border border-line p-2 text-sm"><p className="break-words">{x.excerpt}</p><p className="text-xs text-muted">{x.direction === "in" ? "Fan" : "Account"} · {bTime(x.sourceAt)} · message {x.sourceMessageId}</p></li>)}</ul> : <p className="text-sm text-muted">No source excerpts match this view.</p>}
            <p className="text-xs text-muted">Recall uses conservative English patterns and lexical retrieval from stored messages. Saved profile notes and excerpts are not a generated biography or proof of complete provider history.</p>
          </div>
        </div> : null}
      </div> : null}
    </> : null}
  </section>;
}

function RecoveryView({ progress: p }: { progress: RecoveryProgress }) {
  return <dl className="mt-2 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm" data-b-archive={p.status}>
    <dt className="text-muted">Recent intake</dt><dd>{p.recentRecoveryNeeded ? "Recovery gap reported" : "No recovery gap reported"}. Intake count is not supplied.</dd>
    <dt className="text-muted">Archive recovery</dt><dd>{p.status === "complete" ? "Available provider history recovered" : "Incomplete"}</dd>
    <dt className="text-muted">Discovery</dt><dd>{p.discoveryComplete ? "Current discovery complete" : "Still discovering conversations"}</dd>
    <dt className="text-muted">Conversations</dt><dd>{p.conversationsComplete} complete / {p.conversationsDiscovered} discovered</dd>
    <dt className="text-muted">Archive messages</dt><dd>{p.messagesObserved} observed, {p.messagesAdded} added. Provider total unknown.</dd>
    <dt className="text-muted">Archive pages</dt><dd>{p.pagesCommitted}</dd>
    <dt className="text-muted">Retrying / deferred</dt><dd>{p.conversationsRetrying} / {p.conversationsDeferredForLiveInput} deferred for current input</dd>
  </dl>;
}
function MemoryProgressView({ progress: p }: { progress: MemoryProgress }) {
  return <div data-b-memory-progress><h4 className="text-sm font-semibold">Processing stored messages into memory</h4><dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
    <dt className="text-muted">Stored messages</dt><dd>{p.storedMessages}</dd><dt className="text-muted">Processed / pending</dt><dd>{p.processedCurrentMessages} / {p.pendingMessages}</dd>
    <dt className="text-muted">Stored-message processing</dt><dd>{p.storedMemoryComplete ? "Current stored messages processed" : "Work remains"}</dd>
    <dt className="text-muted">Oldest / newest stored</dt><dd>{bTime(p.oldestStoredAt)} / {bTime(p.newestStoredAt)}</dd>
    <dt className="text-muted">Memory last processed</dt><dd>{bTime(p.lastProcessedAt, "Not yet processed")}</dd>
    <dt className="text-muted">Provider-history total</dt><dd>Unknown</dd></dl></div>;
}
function FanFacts({ memory: m, manage, busy, edit, setEdit, onSave }: { memory: NativeMemory; manage: boolean; busy: boolean; edit: Edit | null; setEdit: (edit: Edit | null) => void; onSave: (operation: "set" | "clear") => Promise<void> }) {
  return <div className="grid min-w-0 gap-2"><h4 className="text-sm font-semibold">Saved facts and profile</h4><ul className="grid min-w-0 gap-2">{MEMORY_FIELDS.map(field => {
    const fact = m.facts[field], override = m.overrides[field], value = fact?.value ?? m.summaries[field] ?? "", editing = edit?.field === field;
    return <li key={field} data-b-fact={field} className="min-w-0 rounded-lg border border-line p-3 text-sm"><h5 className="font-semibold">{FIELD_LABELS[field]}</h5>
      {override?.operation === "clear" ? <p className="text-muted">Cleared by an operator. The clear is retained across history imports.</p> : <p className="whitespace-pre-wrap break-words">{value || "No saved value"}</p>}
      {fact ? <p className="mt-1 text-xs text-muted">{fact.source === "operator" ? "Operator correction" : fact.source === "canonical" ? "Saved canonical profile" : "Chat-history evidence"}{fact.sourceAt ? ` · ${bTime(fact.sourceAt)}` : ""}{fact.sourceMessageId ? ` · message ${fact.sourceMessageId}` : ""}</p> : null}
      {fact?.quote ? <blockquote className="mt-2 break-words border-l-2 border-line pl-2 text-xs">{fact.quote}</blockquote> : null}
      {editing ? <div className="mt-2 grid gap-2">
        <label htmlFor={`memory-value-${field}`} className="text-xs">Replacement value (up to {MEMORY_FIELD_LIMITS[field]} characters)</label><textarea id={`memory-value-${field}`} rows={3} maxLength={MEMORY_FIELD_LIMITS[field]} value={edit.value} disabled={busy || !manage} onChange={e => setEdit({ ...edit, value: e.target.value, error: "" })} className="w-full min-w-0 rounded-lg border border-line bg-transparent p-2" />
        <label htmlFor={`memory-reason-${field}`} className="text-xs">Reason for correction or clear</label><input id={`memory-reason-${field}`} maxLength={512} value={edit.reason} disabled={busy || !manage} onChange={e => setEdit({ ...edit, reason: e.target.value, error: "" })} className="min-h-11 w-full min-w-0 rounded-lg border border-line bg-transparent px-2" />
        {edit.error ? <p role="alert" className="text-warn">{edit.error}</p> : null}
        <div className="flex flex-wrap gap-2"><button type="button" className={bButton} disabled={!manage || busy} onClick={() => void onSave("set")}>Save value</button><button type="button" className={bButton} disabled={!manage || busy} onClick={() => void onSave("clear")}>Clear field</button><button type="button" className={bButton} disabled={busy} onClick={() => setEdit(null)}>Cancel</button></div>
      </div> : <button type="button" className={`${bButton} mt-2`} disabled={!manage || busy} onClick={() => setEdit({ field, value, reason: "", error: "" })}>Correct {FIELD_LABELS[field].toLowerCase()}</button>}
    </li>;
  })}</ul></div>;
}
