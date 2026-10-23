"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { HEALTH_TEXT, MODE_TEXT, TAKEOVER_TEXT, AFTER, actionRules, type BAccount, type BConversation, type BRuntime } from "@/lib/onlyfans/launch/automation/b-automation";
import { cancelFollowUp, emergencyStop, readAccounts, readConversations, readFollowUps, readRuntime, sendControl } from "@/lib/onlyfans/launch/automation/b-automation-client";
import { fixtureFollowUps, type BFollowUp } from "@/lib/onlyfans/launch/automation/b-follow-ups";
import { bTime, type BReply } from "@/lib/onlyfans/launch/b-common";
import { BAccountSwitcher, BError, BFixtureBanner, BLoading, BPending, BSourceList, bButton, bDanger } from "../b-shared/BShared";

type Load<T> = { state: "loading" } | { state: "ok"; data: T } | { state: "error"; message: string } | { state: "denied" } | { state: "pending"; contract: string };
const loading = { state: "loading" } as const;
function toLoad<T>(r: BReply<T>): Load<T> | null {
  switch (r.kind) {
    case "stale": return null;
    case "ok": return { state: "ok", data: r.data };
    case "denied": case "readonly": return { state: "denied" };
    case "contract_pending": return { state: "pending", contract: r.contract };
    case "unavailable": return { state: "error", message: r.error };
    default: return { state: "error", message: "error" in r ? r.error : "Unavailable." };
  }
}

/** Launch section E. Real: accounts, conversation modes, takeover/pause/resume/no-contact. Fixture-only: follow-ups. Not connected: emergency stop, account-mode write. */
export default function BAutomationPanel({ canManage = false }: { canManage?: boolean }) {
  const [manage, setManage] = useState(canManage);
  const [accounts, setAccounts] = useState<Load<BAccount[]>>(loading);
  const [accountId, setAccountId] = useState("");
  const [convs, setConvs] = useState<Load<{ items: BConversation[]; more: boolean }>>(loading);
  const [runtime, setRuntime] = useState<Load<BRuntime>>(loading);
  const [followUps, setFollowUps] = useState<Load<BFollowUp[]>>(loading);
  const [fixtureOn, setFixtureOn] = useState(false);
  const [fixtureRows, setFixtureRows] = useState<BFollowUp[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [stopNote, setStopNote] = useState("");
  const [stopConfirm, setStopConfirm] = useState(false);
  const epoch = useRef(0), ctl = useRef<AbortController | null>(null), convCtl = useRef<AbortController | null>(null), current = useRef("");
  current.current = accountId;

  const loadAccounts = useCallback(async () => {
    setAccounts(loading);
    const r = toLoad(await readAccounts());
    if (!r) return;
    setAccounts(r);
    if (r.state === "ok") setAccountId(prev => prev && r.data.some(a => a.accountId === prev) ? prev : r.data[0]?.accountId ?? "");
  }, []);
  useEffect(() => { void loadAccounts(); }, [loadAccounts]);

  const loadAccountData = useCallback(async (id: string, only?: "convs") => {
    // A full load owns the account epoch. A conversations-only refresh must not abort or invalidate it,
    // but any account switch (full load) invalidates a refresh still in flight.
    let c: AbortController, mine: number;
    if (only) { convCtl.current?.abort(); c = new AbortController(); convCtl.current = c; mine = epoch.current; }
    else { ctl.current?.abort(); convCtl.current?.abort(); c = new AbortController(); ctl.current = c; mine = ++epoch.current; }
    const live = () => mine === epoch.current && !c.signal.aborted;
    if (!only) { setConvs(loading); setRuntime(loading); setFollowUps(loading); }
    const jobs: Promise<void>[] = [readConversations(id, c.signal).then(r => { const l = toLoad(r); if (l && live()) setConvs(l); })];
    if (!only) {
      jobs.push(readRuntime(id, c.signal).then(r => { const l = toLoad(r); if (l && live()) setRuntime(l); }));
      jobs.push(readFollowUps(id, c.signal).then(r => { const l = toLoad(r); if (l && live()) setFollowUps(l); }));
    }
    await Promise.all(jobs);
  }, []);
  useEffect(() => {
    // Account switch: drop everything shown for the old account before the new reads land.
    setNotice(""); setConfirming(null); setBusy(null); setStopNote(""); setStopConfirm(false); setFixtureOn(false); setFixtureRows([]);
    if (accountId) void loadAccountData(accountId); else { ctl.current?.abort(); convCtl.current?.abort(); epoch.current++; }
    return () => { ctl.current?.abort(); convCtl.current?.abort(); };
  }, [accountId, loadAccountData]);

  async function act(c: BConversation, action: Parameters<typeof sendControl>[2]) {
    if (busy || !manage) return;
    const forAccount = accountId; setBusy(c.conversationId); setConfirming(null); setNotice("");
    const r = await sendControl(forAccount, c.conversationId, action, c.revision);
    if (current.current !== forAccount) return; // operator switched account: the reply belongs to another screen
    setBusy(null);
    if (r.kind === "ok") setNotice(`${c.fanName}: ${AFTER[action]}`);
    else if (r.kind === "readonly" || r.kind === "denied") { setManage(false); setNotice("Your access does not allow this change."); }
    else if (r.kind === "refused") setNotice(r.status === 409 ? `${c.fanName}: the conversation changed or is on hold. The list was refreshed; check it and try again.` : `${c.fanName}: ${r.error}`);
    else if (r.kind === "unconfirmed") setNotice(`${c.fanName}: ${r.error}`);
    else if (r.kind === "unavailable") setNotice(`${c.fanName}: ${r.error}`);
    void loadAccountData(forAccount, "convs");
  }
  async function stop() {
    const forAccount = accountId; setStopConfirm(false); setBusy("stop");
    const r = await emergencyStop(forAccount);
    if (current.current !== forAccount) return;
    setBusy(null);
    setStopNote(r.kind === "contract_pending" ? "Emergency stop is not connected yet. Nothing was stopped. Pause conversations individually below." :
      r.kind === "ok" ? "Stop recorded. Re-check each conversation below." : r.kind === "readonly" || r.kind === "denied" ? "Your access does not allow this." : "The stop was not confirmed. Nothing is assumed stopped.");
  }

  const account = accounts.state === "ok" ? accounts.data.find(a => a.accountId === accountId) : undefined;
  return <section className="grid min-w-0 gap-4 p-3" aria-labelledby="b-auto-h" data-b-automation>
    <h2 id="b-auto-h" className="text-lg font-semibold">Automation and follow-ups</h2>
    {!manage ? <p className="text-sm" role="note" data-b-readonly>Read-only access: you can view modes but not change them.</p> : null}
    {accounts.state === "loading" ? <BLoading label="Loading accounts…" /> : null}
    {accounts.state === "error" ? <BError message={accounts.message} onRetry={() => void loadAccounts()} /> : null}
    {accounts.state === "denied" ? <p role="alert" className="text-sm">Your session cannot read accounts. Sign in again.</p> : null}
    {accounts.state === "pending" ? <BPending title="Accounts" contract={accounts.contract} /> : null}
    {accounts.state === "ok" && accounts.data.length === 0 ? <p className="text-sm" data-b-state="empty">No OnlyFans accounts are connected yet.</p> : null}
    {accounts.state === "ok" && account ? <>
      <BAccountSwitcher id="b-auto-acct" accounts={accounts.data} value={accountId} onChange={setAccountId} />
      <div aria-live="polite" className="min-h-5 text-sm" data-b-notice>{notice}</div>

      <div className="min-w-0 rounded-xl border border-line p-3" data-b-card="account">
        <h3 className="font-semibold">Account handling</h3>
        <dl className="mt-2 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted">Handling mode</dt><dd data-b-account-mode={account.automationMode}>{MODE_TEXT[account.automationMode]}</dd>
          <dt className="text-muted">Connection</dt><dd>{HEALTH_TEXT[account.health] ?? "Needs review"}</dd>
          {runtime.state === "ok" ? <>
            <dt className="text-muted">Runtime</dt><dd data-b-runtime>{runtime.data.runtimeEnabled ? "Enabled" : "Disabled"}</dd>
            <dt className="text-muted">Outgoing</dt><dd>{runtime.data.deliveryEnabled === null ? "No delivery policy saved" : runtime.data.deliveryEnabled ? "Allowed" : "Disabled"}{runtime.data.limitUnits !== null ? ` (${runtime.data.usedUnits ?? "?"}/${runtime.data.limitUnits} used)` : ""}</dd>
            <dt className="text-muted">History</dt><dd>{runtime.data.historyRecoveryRequired ? "Recovery still required" : "No recovery flagged"}</dd></> : null}
        </dl>
        {runtime.state === "loading" ? <BLoading label="Loading runtime…" /> : null}
        {runtime.state === "error" ? <BError message={runtime.message} onRetry={() => void loadAccountData(accountId)} /> : null}
        <p className="mt-2 text-sm text-muted">Changing the account-wide mode is not available: the backend has no write contract for it yet.</p>
        <div className="mt-3">
          {!stopConfirm ? <button type="button" className={bDanger} disabled={!manage || busy !== null} onClick={() => setStopConfirm(true)} data-b-emergency>Emergency stop (not connected)</button> :
            <div role="group" aria-label="Confirm emergency stop" className="grid gap-2"><p className="text-sm">Stop all automatic replies for {account.handle}? This is not wired to the backend yet and will report that.</p>
              <div className="flex flex-wrap gap-2"><button type="button" className={bDanger} onClick={() => void stop()} autoFocus>Confirm stop</button>
                <button type="button" className={bButton} onClick={() => setStopConfirm(false)}>Cancel</button></div></div>}
          <div aria-live="polite" className="mt-2 text-sm" data-b-stop-note>{stopNote}</div>
        </div>
      </div>

      <div className="min-w-0 rounded-xl border border-line p-3" data-b-card="conversations">
        <h3 className="font-semibold">Conversation handling</h3>
        {convs.state === "loading" ? <BLoading label="Loading conversations…" /> : null}
        {convs.state === "error" ? <BError message={convs.message} onRetry={() => void loadAccountData(accountId, "convs")} /> : null}
        {convs.state === "denied" ? <p role="alert" className="text-sm">Your session cannot read conversations.</p> : null}
        {convs.state === "ok" && convs.data.items.length === 0 ? <p className="mt-2 text-sm" data-b-state="empty">No conversations on this account yet.</p> : null}
        {convs.state === "ok" ? <ul className="mt-2 grid min-w-0 gap-3">
          {convs.data.items.map(c => <li key={c.conversationId} data-b-conversation={c.conversationId} className="min-w-0 rounded-lg border border-line p-2">
            <p className="break-words font-semibold">{c.fanName}{c.requiresAttention ? <span className="ml-2 text-xs text-warn">Needs attention</span> : null}</p>
            <p className="text-sm" data-b-mode={c.automationMode}>{MODE_TEXT[c.automationMode]} · {TAKEOVER_TEXT[c.takeoverState]}</p>
            <p className="text-xs text-muted">Last activity {bTime(c.lastActivityAt)}</p>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={`Actions for ${c.fanName}`}>
              {actionRules(c, manage).map(rule => rule.confirm && confirming === c.conversationId ?
                <span key={rule.action} role="group" aria-label="Confirm no-contact" className="flex flex-wrap items-center gap-2">
                  <span className="text-sm">Permanently stop contacting {c.fanName}?</span>
                  <button type="button" className={bDanger} autoFocus onClick={() => void act(c, rule.action as never)}>Confirm</button>
                  <button type="button" className={bButton} onClick={() => setConfirming(null)}>Cancel</button></span> :
                <button key={rule.action} type="button" data-b-action={rule.action} className={rule.confirm ? bDanger : bButton}
                  disabled={!rule.enabled || busy !== null} aria-describedby={rule.reason ? `why-${c.conversationId}-${rule.action}` : undefined}
                  onClick={() => rule.confirm ? setConfirming(c.conversationId) : void act(c, rule.action as never)}>
                  {busy === c.conversationId ? "Working…" : rule.label}
                  {rule.reason ? <span id={`why-${c.conversationId}-${rule.action}`} className="sr-only"> unavailable: {rule.reason}</span> : null}</button>)}
            </div></li>)}</ul> : null}
        {convs.state === "ok" && convs.data.more ? <p className="mt-2 text-xs text-muted" data-b-more>Only the most recent conversations are shown. More exist.</p> : null}
      </div>

      <div className="min-w-0 rounded-xl border border-line p-3" data-b-card="follow-ups">
        <h3 className="font-semibold">Scheduled follow-ups</h3>
        {followUps.state === "loading" ? <BLoading label="Checking follow-ups…" /> : null}
        {followUps.state === "error" ? <BError message={followUps.message} onRetry={() => void loadAccountData(accountId)} /> : null}
        {followUps.state === "denied" ? <p role="alert" className="text-sm">Your session cannot read follow-ups.</p> : null}
        {followUps.state === "pending" && !fixtureOn ? <BPending title="Follow-ups" contract={followUps.contract}>
          <button type="button" className={`${bButton} mt-2`} onClick={() => { setFixtureRows(fixtureFollowUps(accountId)); setFixtureOn(true); }} data-b-show-fixture>Show fixture preview</button></BPending> : null}
        {followUps.state === "pending" && fixtureOn ? <div className="grid gap-2"><BFixtureBanner what="These follow-ups" />
          <FollowUpList rows={fixtureRows} manage={manage} onCancel={id => setFixtureRows(rs => rs.map(r => r.followUpId === id ? { ...r, status: "cancelled", cancellable: false } : r))} fixture />
          <button type="button" className={bButton} onClick={() => setFixtureOn(false)}>Hide fixture preview</button></div> : null}
        {followUps.state === "ok" ? <FollowUpList rows={followUps.data} manage={manage} onCancel={async id => { const r = await cancelFollowUp(accountId, id); setNotice(r.kind === "ok" ? "Cancellation recorded." : "Cancellation not confirmed."); void loadAccountData(accountId); }} /> : null}
      </div>
      <BSourceList prefix="automation" />
    </> : null}
  </section>;
}

function FollowUpList({ rows, manage, onCancel, fixture = false }: { rows: BFollowUp[]; manage: boolean; onCancel: (id: string) => void; fixture?: boolean }) {
  if (rows.length === 0) return <p className="mt-2 text-sm" data-b-state="empty">No follow-ups are scheduled.</p>;
  return <ul className="mt-2 grid min-w-0 gap-2">{rows.map(f => <li key={f.followUpId} data-b-followup={f.status} className="min-w-0 rounded-lg border border-line p-2 text-sm">
    <p className="break-words font-semibold">{f.fanName} · {f.kind.replace(/_/g, " ")}</p>
    <p>{f.status === "scheduled" ? "Scheduled for" : f.status === "sent" ? "Sent at" : f.status === "cancelled" ? "Was scheduled for" : "Blocked, was due"} {bTime(f.scheduledFor)}{fixture ? " (fixture)" : ""}</p>
    {f.blockedReason ? <p className="text-warn">{f.blockedReason}</p> : null}
    {f.status === "cancelled" ? <p className="text-muted">Cancelled{fixture ? " in this preview only" : ""}.</p> : null}
    {f.cancellable ? <button type="button" className={`${bButton} mt-2`} disabled={!manage} onClick={() => onCancel(f.followUpId)}>Cancel follow-up{fixture ? " (preview)" : ""}</button> : null}</li>)}</ul>;
}
