"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { type BAccount, type BConversation } from "@/lib/onlyfans/launch/automation/b-automation";
import { readAccounts, readConversations } from "@/lib/onlyfans/launch/automation/b-automation-client";
import { FACT_FIELDS, FACT_SOURCE_TEXT, FIELD_LABEL, PROFILE_FIELDS, fanOfConversation, limitFor, recoveryLines, validCorrection, type FanReply, type Recovery } from "@/lib/onlyfans/launch/memory/b-memory";
import { correctField, readFan, readRecovery, requestBackfill } from "@/lib/onlyfans/launch/memory/b-memory-client";
import { bTime, type BReply } from "@/lib/onlyfans/launch/b-common";
import { BAccountSwitcher, BError, BLoading, BSourceList, bButton } from "../b-shared/BShared";

type Load<T> = { state: "loading" } | { state: "ok"; data: T } | { state: "error"; message: string } | { state: "denied" };
const loading = { state: "loading" } as const;
function toLoad<T>(r: BReply<T>): Load<T> | null {
  switch (r.kind) {
    case "stale": return null;
    case "ok": return { state: "ok", data: r.data };
    case "denied": case "readonly": return { state: "denied" };
    default: return { state: "error", message: "error" in r ? r.error : "Unavailable." };
  }
}
type Edit = { field: string; value: string; error: string };
type Roster = { items: BConversation[]; cursor: string | null };

/** Launch section D. Recovery progress, per-fan memory and corrections are read from and written to the history-memory routes. Nothing is sample data. */
export default function BMemoryPanel({ canManage = false }: { canManage?: boolean }) {
  const [manage, setManage] = useState(canManage);
  const [accounts, setAccounts] = useState<Load<BAccount[]>>(loading);
  const [accountId, setAccountId] = useState("");
  const [rec, setRec] = useState<Load<Recovery>>(loading);
  const [roster, setRoster] = useState<Load<Roster>>(loading);
  const [rosterBusy, setRosterBusy] = useState(false);
  const [fanId, setFanId] = useState("");
  const [fan, setFan] = useState<Load<FanReply>>(loading);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const epoch = useRef(0), ctl = useRef<AbortController | null>(null), fanEpoch = useRef(0), fanCtl = useRef<AbortController | null>(null), current = useRef("");
  current.current = accountId;

  const loadAccounts = useCallback(async () => {
    setAccounts(loading);
    const l = toLoad(await readAccounts()); if (!l) return;
    setAccounts(l);
    if (l.state === "ok") setAccountId(prev => prev && l.data.some(a => a.accountId === prev) ? prev : l.data[0]?.accountId ?? "");
  }, []);
  useEffect(() => { void loadAccounts(); }, [loadAccounts]);

  const loadAccount = useCallback(async (id: string) => {
    ctl.current?.abort(); const c = new AbortController(); ctl.current = c; const mine = ++epoch.current;
    setRec(loading); setRoster(loading);
    const live = () => mine === epoch.current && !c.signal.aborted;
    await Promise.all([
      readRecovery(id, c.signal).then(r => { const l = toLoad(r); if (l && live()) setRec(l); }),
      readConversations(id, null, c.signal).then(r => { const l = toLoad(r); if (l && live()) setRoster(l.state === "ok" ? { state: "ok", data: { items: l.data.items, cursor: l.data.cursor } } : l); })]);
  }, []);
  useEffect(() => {
    // Account switch: drop everything shown for the old account before the new reads land.
    setFanId(""); setFan(loading); setEdit(null); setNotice(""); setBusy(false);
    fanCtl.current?.abort(); fanEpoch.current++;
    if (accountId) void loadAccount(accountId); else { ctl.current?.abort(); epoch.current++; }
    return () => { ctl.current?.abort(); fanCtl.current?.abort(); };
  }, [accountId, loadAccount]);

  async function more() {
    if (roster.state !== "ok" || !roster.data.cursor || rosterBusy) return;
    const forAccount = accountId, cursor = roster.data.cursor; setRosterBusy(true);
    const l = toLoad(await readConversations(forAccount, cursor));
    if (current.current !== forAccount) return;
    setRosterBusy(false);
    if (l?.state === "ok") setRoster(r => r.state === "ok" ? { state: "ok", data: { items: [...r.data.items, ...l.data.items.filter(i => !r.data.items.some(o => o.conversationId === i.conversationId))], cursor: l.data.cursor } } : r);
    else setNotice("More conversations could not be loaded.");
  }

  const openFan = useCallback(async (id: string) => {
    fanCtl.current?.abort(); const c = new AbortController(); fanCtl.current = c; const mine = ++fanEpoch.current;
    setFanId(id); setFan(loading); setEdit(null);
    const l = toLoad(await readFan(current.current, id, c.signal));
    if (l && mine === fanEpoch.current && !c.signal.aborted) setFan(l);
  }, []);

  async function save(m: FanReply, field: string, value: string | null) {
    if (!manage || busy) return;
    const body = value === null ? { field, operation: "clear" as const, value: null, expectedVersion: m.memory.version } : { field, operation: "set" as const, value: value.trim(), expectedVersion: m.memory.version };
    if (!validCorrection(body)) { setEdit(e => e && { ...e, error: value !== null && !value.trim() ? "Enter a value, or use Clear to remove it." : field === "his_age" ? "Age must be a number from 18 to 120." : `Use up to ${limitFor(field)} characters and no control characters.` }); return; }
    const forAccount = accountId, forFan = m.fanId; setBusy(true); setNotice("");
    const r = await correctField(forAccount, forFan, body);
    if (current.current !== forAccount) return;
    setBusy(false);
    const out = r.kind === "ok" ? (r.data as { outcome?: string }).outcome : undefined;
    if (r.kind === "ok" && out === "recorded") { setNotice(`${FIELD_LABEL[field]} ${value === null ? "cleared" : "saved"}. Reloading the memory.`); setEdit(null); }
    else if (r.kind === "ok") setNotice("The answer was not understood. Reloading to check.");
    else if (r.kind === "readonly" || r.kind === "denied") { setManage(false); setNotice("Your access does not allow this change."); }
    else if (r.kind === "unconfirmed") setNotice("Unknown whether this was saved. Reloading to check; saving again is safe.");
    else setNotice(r.kind === "refused" && r.status === 409 ? "This memory changed since you opened it. It was reloaded; check it and try again." : r.kind === "refused" || r.kind === "unavailable" ? r.error : "The change was not accepted.");
    void openFan(forFan);
  }
  async function backfill(forFan: string | null) {
    if (!manage || busy) return;
    const forAccount = accountId; setBusy(true); setNotice("");
    const r = await requestBackfill(forAccount, forFan);
    if (current.current !== forAccount) return;
    setBusy(false);
    const out = r.kind === "ok" ? (r.data as { outcome?: string }).outcome : undefined;
    setNotice(r.kind === "ok" && out === "requested" ? "Recovery requested. Nothing has been read yet: the worker picks it up if history recovery is enabled. Check progress." :
      r.kind === "unconfirmed" ? "Unknown whether the request was recorded. Check progress before asking again." : r.kind === "readonly" || r.kind === "denied" ? "Your access does not allow this." : r.kind === "refused" || r.kind === "unavailable" ? r.error : "The request was not confirmed.");
    void loadAccount(forAccount);
  }

  return <section className="grid min-w-0 gap-4 p-3" aria-labelledby="b-mem-h" data-b-memory>
    <h2 id="b-mem-h" className="text-lg font-semibold">Fan memory</h2>
    {!manage ? <p className="text-sm" role="note" data-b-readonly>Read-only access: you can view memory but not correct it.</p> : null}
    {accounts.state === "loading" ? <BLoading label="Loading accounts…" /> : null}
    {accounts.state === "error" ? <BError message={accounts.message} onRetry={() => void loadAccounts()} /> : null}
    {accounts.state === "denied" ? <p role="alert" className="text-sm">Your session cannot read accounts. Sign in again.</p> : null}
    {accounts.state === "ok" && accounts.data.length === 0 ? <p className="text-sm" data-b-state="empty">No OnlyFans accounts are connected yet.</p> : null}
    {accounts.state === "ok" && accountId ? <>
      <BAccountSwitcher id="b-mem-acct" accounts={accounts.data} value={accountId} onChange={setAccountId} />
      <div aria-live="polite" className="min-h-5 text-sm" data-b-notice>{notice}</div>
      <div className="min-w-0 rounded-xl border border-line p-3" data-b-card="coverage"><h3 className="font-semibold">History recovery</h3>
        {rec.state === "loading" ? <BLoading label="Loading recovery progress…" /> : null}
        {rec.state === "error" ? <BError message={rec.message} onRetry={() => void loadAccount(accountId)} /> : null}
        {rec.state === "denied" ? <p role="alert" className="text-sm">Your session cannot read recovery progress.</p> : null}
        {rec.state === "ok" ? <><ul className="mt-2 list-disc pl-5 text-sm" data-b-coverage={rec.data.status}>{recoveryLines(rec.data).map(l => <li key={l}>{l}</li>)}</ul>
          {rec.data.discoveryLastError ? <p className="mt-1 text-sm text-warn">Last discovery error: {rec.data.discoveryLastError.replace(/_/g, " ")}</p> : null}
          <p className="mt-1 text-xs text-muted">Counts are what has been read so far. The provider gives no total, so there is no percentage.</p>
          <button type="button" className={`${bButton} mt-2`} disabled={!manage || busy} onClick={() => void backfill(null)}>Request account history recovery</button></> : null}
      </div>
      <div className="min-w-0 rounded-xl border border-line p-3" data-b-card="fans"><h3 className="font-semibold">Fans (from this account's conversations)</h3>
        {roster.state === "loading" ? <BLoading label="Loading conversations…" /> : null}
        {roster.state === "error" ? <BError message={roster.message} onRetry={() => void loadAccount(accountId)} /> : null}
        {roster.state === "denied" ? <p role="alert" className="text-sm">Your session cannot read conversations.</p> : null}
        {roster.state === "ok" && roster.data.items.length === 0 ? <p className="mt-2 text-sm" data-b-state="empty">No conversations on this account yet.</p> : null}
        {roster.state === "ok" ? <><ul className="mt-2 grid min-w-0 gap-2">{roster.data.items.map(c => { const id = fanOfConversation(accountId, c.conversationId); return <li key={c.conversationId}>
          <button type="button" className={`${bButton} w-full text-left`} aria-pressed={!!id && fanId === id} disabled={!id} data-b-fan={id ?? ""} onClick={() => id && void openFan(id)}>
            <span className="break-words">{c.fanName}</span><span className="block text-xs font-normal text-muted">Last activity {bTime(c.lastActivityAt)}</span></button></li>; })}</ul>
          {roster.data.cursor ? <button type="button" className={`${bButton} mt-2`} disabled={rosterBusy} onClick={() => void more()} data-b-more>{rosterBusy ? "Loading…" : "Load more fans"}</button> : null}</> : null}
      </div>
      {fanId ? <div className="min-w-0 rounded-xl border border-line p-3" data-b-card="fan">
        {fan.state === "loading" ? <BLoading label="Loading fan memory…" /> : null}
        {fan.state === "error" ? <BError message={fan.message} onRetry={() => void openFan(fanId)} /> : null}
        {fan.state === "denied" ? <p role="alert" className="text-sm">Your session cannot read this fan.</p> : null}
        {fan.state === "ok" ? <FanView m={fan.data} manage={manage} busy={busy} edit={edit} setEdit={setEdit} onSave={save} onBackfill={() => void backfill(fan.data.fanId)} /> : null}
      </div> : null}
      <BSourceList prefix="memory" />
    </> : null}
  </section>;
}

function FanView({ m, manage, busy, edit, setEdit, onSave, onBackfill }: { m: FanReply; manage: boolean; busy: boolean; edit: Edit | null; setEdit: (e: Edit | null) => void;
  onSave: (m: FanReply, field: string, v: string | null) => void; onBackfill: () => void }) {
  const facts = new Map(m.memory.facts.map(f => [f.field, f]));
  const rows = [...FACT_FIELDS, ...Object.keys(PROFILE_FIELDS)].map(field => ({ field, fact: facts.get(field), summary: field in PROFILE_FIELDS ? m.memory.summaries[field] ?? null : undefined }));
  return <div className="grid min-w-0 gap-3">
    <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm" data-b-fan-progress>
      <dt className="text-muted">Stored messages</dt><dd>{m.progress.storedMessages}</dd>
      <dt className="text-muted">Memory processed</dt><dd>{m.progress.processedCurrentMessages} of {m.progress.storedMessages}{m.progress.pendingMessages ? ` (${m.progress.pendingMessages} waiting)` : ""}</dd>
      <dt className="text-muted">Older history</dt><dd>{m.recovery.status === "complete" ? "Fully recovered" : `Not fully recovered (${m.recovery.pagesCommitted} pages read)`}</dd></dl>
    {m.recovery.status !== "complete" ? <button type="button" className={bButton} disabled={!manage || busy} onClick={onBackfill}>Request history recovery for this fan</button> : null}
    <div><h4 className="text-sm font-semibold">Saved facts and summaries</h4>
      <ul className="mt-1 grid min-w-0 gap-2">{rows.map(({ field, fact, summary }) => {
        const value = summary !== undefined ? summary : fact?.value ?? null, editing = edit?.field === field;
        return <li key={field} data-b-fact={field} className="min-w-0 rounded-lg border border-line p-2 text-sm">
          <p className="font-semibold">{FIELD_LABEL[field]}</p>
          {editing ? <div className="grid gap-2">
            <label className="text-xs text-muted" htmlFor={`fact-${field}`}>New value for {FIELD_LABEL[field]} (up to {limitFor(field)} characters)</label>
            <input id={`fact-${field}`} className="min-h-11 w-full min-w-0 rounded-lg border border-line bg-transparent px-2" value={edit.value} maxLength={limitFor(field)} autoFocus
              aria-invalid={!!edit.error} onChange={e => setEdit({ field, value: e.target.value, error: "" })} onKeyDown={e => { if (e.key === "Escape") setEdit(null); if (e.key === "Enter") onSave(m, field, edit.value); }} />
            {edit.error ? <p role="alert" className="text-warn">{edit.error}</p> : null}
            <div className="flex flex-wrap gap-2"><button type="button" className={bButton} disabled={busy} onClick={() => onSave(m, field, edit.value)}>Save correction</button>
              <button type="button" className={bButton} disabled={busy} onClick={() => onSave(m, field, null)}>Clear</button>
              <button type="button" className={bButton} onClick={() => setEdit(null)}>Cancel</button></div></div> :
            <p className="break-words">{value ?? <span className="text-muted">Not saved</span>}</p>}
          {fact ? <p className="text-xs text-muted">{FACT_SOURCE_TEXT[fact.source]}{fact.sourceAt ? ` · ${bTime(fact.sourceAt)}` : ""}</p> : null}
          {fact?.quote ? <p className="break-words text-xs text-muted">Quote: “{fact.quote}”</p> : null}
          {!editing ? <button type="button" className={`${bButton} mt-2`} disabled={!manage || busy} aria-label={`Correct ${FIELD_LABEL[field]}`} onClick={() => setEdit({ field, value: value ?? "", error: "" })}>Correct</button> : null}
        </li>; })}</ul>
      <p className="mt-1 text-xs text-muted">A cleared or corrected field stays as you set it; automatic updates will not overwrite it.</p></div>
    <div><h4 className="text-sm font-semibold">Older messages the AI can recall</h4>
      {m.memory.interactions.length ? <ul className="mt-1 grid gap-1 text-xs text-muted">{m.memory.interactions.map((i, n) => <li key={n} className="break-words">{i.direction === "in" ? "Fan" : "Account"} · {bTime(i.sourceAt)}: {i.excerpt}</li>)}</ul> :
        <p className="mt-1 text-sm text-muted" data-b-state="empty">No older excerpts are stored for this fan.</p>}</div>
  </div>;
}
