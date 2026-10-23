"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { type BAccount } from "@/lib/onlyfans/launch/automation/b-automation";
import { readAccounts } from "@/lib/onlyfans/launch/automation/b-automation-client";
import { COVERAGE_TEXT, SOURCE_TEXT, coveragePercent, fixtureAccountCoverage, fixtureFanMemory, validateCorrection, type BAccountCoverage, type BCoverage, type BFanMemory } from "@/lib/onlyfans/launch/memory/b-memory";
import { correctFact, readCoverage, readFanMemory } from "@/lib/onlyfans/launch/memory/b-memory-client";
import { bTime, type BReply } from "@/lib/onlyfans/launch/b-common";
import { BAccountSwitcher, BError, BFixtureBanner, BLoading, BPending, BSourceList, bButton } from "../b-shared/BShared";

type Load<T> = { state: "loading" } | { state: "ok"; data: T } | { state: "error"; message: string } | { state: "denied" } | { state: "pending"; contract: string };
const loading = { state: "loading" } as const;
function toLoad<T>(r: BReply<T>): Load<T> | null {
  switch (r.kind) {
    case "stale": return null;
    case "ok": return { state: "ok", data: r.data };
    case "denied": case "readonly": return { state: "denied" };
    case "contract_pending": return { state: "pending", contract: r.contract };
    default: return { state: "error", message: "error" in r ? r.error : "Unavailable." };
  }
}

/** Launch section D. Every memory/coverage/correction call is contract-pending, so data appears only in an explicit FIXTURE-ONLY preview. */
export default function BMemoryPanel({ canManage = false }: { canManage?: boolean }) {
  const [manage, setManage] = useState(canManage);
  const [accounts, setAccounts] = useState<Load<BAccount[]>>(loading);
  const [accountId, setAccountId] = useState("");
  const [cov, setCov] = useState<Load<BAccountCoverage>>(loading);
  const [fixtureOn, setFixtureOn] = useState(false);
  const [fanId, setFanId] = useState("");
  const [fan, setFan] = useState<Load<BFanMemory>>({ state: "loading" });
  const [edit, setEdit] = useState<{ factId: string; value: string; error: string } | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string | null>>({});
  const [notice, setNotice] = useState("");
  const epoch = useRef(0), ctl = useRef<AbortController | null>(null), fanEpoch = useRef(0), fanCtl = useRef<AbortController | null>(null), current = useRef("");
  current.current = accountId;

  const loadAccounts = useCallback(async () => {
    setAccounts(loading);
    const r = await readAccounts(); const l = toLoad(r); if (!l) return;
    setAccounts(l);
    if (l.state === "ok") setAccountId(prev => prev && l.data.some(a => a.accountId === prev) ? prev : l.data[0]?.accountId ?? "");
  }, []);
  useEffect(() => { void loadAccounts(); }, [loadAccounts]);

  const loadCoverage = useCallback(async (id: string) => {
    ctl.current?.abort(); const c = new AbortController(); ctl.current = c; const mine = ++epoch.current;
    setCov(loading);
    const l = toLoad(await readCoverage(id, c.signal));
    if (l && mine === epoch.current && !c.signal.aborted) setCov(l);
  }, []);
  useEffect(() => {
    setFixtureOn(false); setFanId(""); setFan(loading); setEdit(null); setOverrides({}); setNotice("");
    fanCtl.current?.abort(); fanEpoch.current++;
    if (accountId) void loadCoverage(accountId); else { ctl.current?.abort(); epoch.current++; }
    return () => { ctl.current?.abort(); fanCtl.current?.abort(); };
  }, [accountId, loadCoverage]);

  const openFan = useCallback(async (id: string, fixture: boolean) => {
    fanCtl.current?.abort(); const c = new AbortController(); fanCtl.current = c; const mine = ++fanEpoch.current;
    setFanId(id); setFan(loading); setEdit(null); setOverrides({}); setNotice("");
    if (fixture) { const m = fixtureFanMemory(current.current, id); setFan(m ? { state: "ok", data: m } : { state: "error", message: "That fan is not in the fixture." }); return; }
    const l = toLoad(await readFanMemory(current.current, id, c.signal));
    if (l && mine === fanEpoch.current && !c.signal.aborted) setFan(l);
  }, []);

  async function save(m: BFanMemory, factId: string, value: string | null) {
    if (!manage) return;
    if (value !== null) { const bad = validateCorrection(value); if (bad) { setEdit(e => e && { ...e, error: bad }); return; } }
    const forAccount = accountId, forFan = m.fanId;
    if (fixtureOn) { setOverrides(o => ({ ...o, [factId]: value === null ? null : value.trim() })); setEdit(null); setNotice("Changed in this fixture preview only. Nothing was saved."); return; }
    const r = await correctFact(forAccount, forFan, factId, value === null ? null : value.trim(), m.revision);
    if (current.current !== forAccount) return;
    if (r.kind === "ok") { setNotice("Saved. Reloading the memory."); setEdit(null); void openFan(forFan, false); }
    else if (r.kind === "contract_pending") setNotice("Saving corrections is not connected yet. Nothing was changed.");
    else if (r.kind === "readonly" || r.kind === "denied") { setManage(false); setNotice("Your access does not allow this change."); }
    else setNotice(r.kind === "refused" && r.status === 409 ? "This memory changed since you opened it. Reload and try again." : "The change was not confirmed. Reload before trying again.");
  }

  const useCov: Load<BAccountCoverage> = fixtureOn ? { state: "ok", data: fixtureAccountCoverage(accountId) } : cov;
  return <section className="grid min-w-0 gap-4 p-3" aria-labelledby="b-mem-h" data-b-memory>
    <h2 id="b-mem-h" className="text-lg font-semibold">Fan memory</h2>
    {!manage ? <p className="text-sm" role="note" data-b-readonly>Read-only access: you can view memory but not correct it.</p> : null}
    {accounts.state === "loading" ? <BLoading label="Loading accounts…" /> : null}
    {accounts.state === "error" ? <BError message={accounts.message} onRetry={() => void loadAccounts()} /> : null}
    {accounts.state === "denied" ? <p role="alert" className="text-sm">Your session cannot read accounts. Sign in again.</p> : null}
    {accounts.state === "ok" && accounts.data.length === 0 ? <p className="text-sm" data-b-state="empty">No OnlyFans accounts are connected yet.</p> : null}
    {accounts.state === "ok" && accountId ? <>
      <BAccountSwitcher id="b-mem-acct" accounts={accounts.data} value={accountId} onChange={setAccountId} />
      {useCov.state === "loading" ? <BLoading label="Loading memory coverage…" /> : null}
      {useCov.state === "error" ? <BError message={useCov.message} onRetry={() => void loadCoverage(accountId)} /> : null}
      {useCov.state === "denied" ? <p role="alert" className="text-sm">Your session cannot read memory.</p> : null}
      {useCov.state === "pending" ? <BPending title="Fan memory" contract={useCov.contract}>
        <button type="button" className={`${bButton} mt-2`} data-b-show-fixture onClick={() => setFixtureOn(true)}>Show fixture preview</button></BPending> : null}
      {fixtureOn ? <div className="grid gap-2"><BFixtureBanner what="These facts, summaries and coverage numbers" />
        <button type="button" className={bButton} onClick={() => { setFixtureOn(false); setFanId(""); }}>Hide fixture preview</button></div> : null}
      {useCov.state === "ok" ? <>
        <div className="min-w-0 rounded-xl border border-line p-3" data-b-card="coverage"><h3 className="font-semibold">History and memory coverage</h3>
          <CoverageView c={useCov.data.coverage} />
          <p className="mt-2 text-sm">Fans with saved memory: {useCov.data.fansWithMemory ?? "unknown"} of {useCov.data.fansTotal ?? "unknown"}</p></div>
        <div className="min-w-0 rounded-xl border border-line p-3" data-b-card="fans"><h3 className="font-semibold">Fans</h3>
          {useCov.data.fans.length === 0 ? <p className="mt-2 text-sm" data-b-state="empty">No fans have memory on this account yet.</p> :
            <ul className="mt-2 grid min-w-0 gap-2">{useCov.data.fans.map(f => <li key={f.fanId}>
              <button type="button" className={`${bButton} w-full text-left`} aria-pressed={fanId === f.fanId} data-b-fan={f.fanId} onClick={() => void openFan(f.fanId, fixtureOn)}>
                <span className="break-words">{f.displayName}</span><span className="block text-xs font-normal text-muted">{COVERAGE_TEXT[f.coverage]} · {f.factCount} fact{f.factCount === 1 ? "" : "s"}</span></button></li>)}</ul>}
        </div></> : null}
      <div aria-live="polite" className="min-h-5 text-sm" data-b-notice>{notice}</div>
      {fanId ? <div className="min-w-0 rounded-xl border border-line p-3" data-b-card="fan">
        {fan.state === "loading" ? <BLoading label="Loading fan memory…" /> : null}
        {fan.state === "error" ? <BError message={fan.message} onRetry={() => void openFan(fanId, fixtureOn)} /> : null}
        {fan.state === "denied" ? <p role="alert" className="text-sm">Your session cannot read this fan.</p> : null}
        {fan.state === "pending" ? <BPending title="Fan detail" contract={fan.contract} /> : null}
        {fan.state === "ok" ? <FanView m={fan.data} manage={manage} edit={edit} setEdit={setEdit} overrides={overrides} onSave={save} /> : null}
      </div> : null}
      <BSourceList prefix="memory" />
    </> : null}
  </section>;
}

function CoverageView({ c }: { c: BCoverage }) {
  const pct = coveragePercent(c);
  return <dl className="mt-2 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm" data-b-coverage={c.state}>
    <dt className="text-muted">History</dt><dd>{COVERAGE_TEXT[c.state]}</dd>
    <dt className="text-muted">Messages</dt><dd>{c.messagesImported === null ? "Unknown" : c.messagesImported}{c.messagesKnownTotal !== null ? ` of ${c.messagesKnownTotal}` : ""}{pct !== null ? ` (${pct}%)` : ""}</dd>
    <dt className="text-muted">Oldest</dt><dd>{bTime(c.oldestAt, "Not recorded")}</dd><dt className="text-muted">Newest</dt><dd>{bTime(c.newestAt, "Not recorded")}</dd>
    <dt className="text-muted">Memory built</dt><dd>{bTime(c.memoryBuiltAt, "Never")}</dd></dl>;
}

function FanView({ m, manage, edit, setEdit, overrides, onSave }: { m: BFanMemory; manage: boolean; edit: { factId: string; value: string; error: string } | null;
  setEdit: (e: { factId: string; value: string; error: string } | null) => void; overrides: Record<string, string | null>; onSave: (m: BFanMemory, id: string, v: string | null) => void }) {
  return <div className="grid min-w-0 gap-3"><h3 className="break-words font-semibold">{m.displayName}</h3>
    <CoverageView c={m.coverage} />
    <div><h4 className="text-sm font-semibold">Summary</h4>{m.summary ? <p className="mt-1 break-words text-sm" data-b-summary>{m.summary.text}<span className="block text-xs text-muted">{SOURCE_TEXT[m.summary.source]} · updated {bTime(m.summary.updatedAt)}</span></p> :
      <p className="mt-1 text-sm text-muted" data-b-state="empty">No summary has been written for this fan.</p>}</div>
    <div><h4 className="text-sm font-semibold">Saved facts</h4>
      {m.facts.length === 0 ? <p className="mt-1 text-sm text-muted" data-b-state="empty">No facts are saved for this fan.</p> :
        <ul className="mt-1 grid min-w-0 gap-2">{m.facts.map(f => {
          const removed = overrides[f.factId] === null, ov = overrides[f.factId], value: string = typeof ov === "string" ? ov : f.value;
          const editing = edit?.factId === f.factId;
          return <li key={f.factId} data-b-fact={f.factId} className="min-w-0 rounded-lg border border-line p-2 text-sm">
            <p className="font-semibold">{f.label}</p>
            {removed ? <p className="text-muted">Cleared (preview).</p> : editing ? <div className="grid gap-2">
              <label className="text-xs text-muted" htmlFor={`fact-${f.factId}`}>New value for {f.label}</label>
              <input id={`fact-${f.factId}`} className="min-h-11 w-full min-w-0 rounded-lg border border-line bg-transparent px-2" value={edit.value} maxLength={600} autoFocus
                aria-invalid={!!edit.error} aria-describedby={edit.error ? `fact-err-${f.factId}` : undefined}
                onChange={e => setEdit({ factId: f.factId, value: e.target.value, error: "" })} onKeyDown={e => { if (e.key === "Escape") setEdit(null); if (e.key === "Enter") onSave(m, f.factId, edit.value); }} />
              {edit.error ? <p id={`fact-err-${f.factId}`} role="alert" className="text-warn">{edit.error}</p> : null}
              <div className="flex flex-wrap gap-2"><button type="button" className={bButton} onClick={() => onSave(m, f.factId, edit.value)}>Save correction</button>
                <button type="button" className={bButton} onClick={() => onSave(m, f.factId, null)}>Clear fact</button>
                <button type="button" className={bButton} onClick={() => setEdit(null)}>Cancel</button></div></div> :
              <p className="break-words">{value}</p>}
            <p className="text-xs text-muted">{SOURCE_TEXT[f.source]} · {bTime(f.updatedAt, "date unknown")}</p>
            {!editing && !removed ? <button type="button" className={`${bButton} mt-2`} disabled={!manage || !f.editable}
              aria-label={`Correct ${f.label}`} onClick={() => setEdit({ factId: f.factId, value, error: "" })}>{f.editable ? "Correct" : "Not editable"}</button> : null}
          </li>; })}</ul>}
    </div></div>;
}
