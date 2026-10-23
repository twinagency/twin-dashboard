"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccess } from "../a-shared";
import { HEALTH_TEXT, MODE_TEXT, TAKEOVER_TEXT, AFTER, actionRules, type BAccount, type BConversation, type BRuntime } from "@/lib/onlyfans/launch/automation/b-automation";
import { cancelAction, readAccounts, readConversations, readEngagement, readRuntime, sendControl, stopAutomation } from "@/lib/onlyfans/launch/automation/b-automation-client";
import { KIND_TEXT, STATUS_TEXT, canCancel, type EngagementView } from "@/lib/onlyfans/launch/automation/b-engagement";
import { bTime, type BReply } from "@/lib/onlyfans/launch/b-common";
import { BAccountSwitcher, BError, BLoading, BSourceList, bButton, bDanger } from "../b-shared/BShared";

type Load<T> = { state: "loading" } | { state: "ok"; data: T } | { state: "error"; message: string } | { state: "denied" };
const loading = { state: "loading" } as const;
function toLoad<T>(r: BReply<T>): Load<T> | null {
  switch (r.kind) {
    case "stale": return null;
    case "ok": return { state: "ok", data: r.data };
    case "denied": case "readonly": return { state: "denied" };
    case "unavailable": return { state: "error", message: r.error };
    default: return { state: "error", message: "error" in r ? r.error : "Unavailable." };
  }
}

/** Launch section E. Accounts, conversation modes, takeover/pause/resume/no-contact, scheduled proactive messages, and the stop controls. Account-mode write has no backend route and is not offered. */
export default function BAutomationPanel({ canManage = false }: { canManage?: boolean }) {
  const [manage, setManage] = useState(canManage);
  const [accounts, setAccounts] = useState<Load<BAccount[]>>(loading);
  const [accountId, setAccountId] = useState("");
  const [convs, setConvs] = useState<Load<{ items: BConversation[]; more: boolean; cursor: string | null }>>(loading);
  const [runtime, setRuntime] = useState<Load<BRuntime>>(loading);
  const [engagement, setEngagement] = useState<Load<EngagementView>>(loading);
  const access = useAccess(accountId);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [stopNote, setStopNote] = useState("");
  const [stopConfirm, setStopConfirm] = useState<"engagement" | "account" | null>(null);
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
    if (!only) { setConvs(loading); setRuntime(loading); setEngagement(loading); }
    const jobs: Promise<void>[] = [readConversations(id, null, c.signal).then(r => { const l = toLoad(r); if (l && live()) setConvs(l); })];
    if (!only) {
      jobs.push(readRuntime(id, c.signal).then(r => { const l = toLoad(r); if (l && live()) setRuntime(l); }));
      jobs.push(readEngagement(id, c.signal).then(r => { const l = toLoad(r); if (l && live()) setEngagement(l); }));
    }
    await Promise.all(jobs);
  }, []);
  useEffect(() => {
    // Account switch: drop everything shown for the old account before the new reads land.
    setNotice(""); setConfirming(null); setBusy(null); setStopNote(""); setStopConfirm(null);
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
  async function stop(scope: "engagement" | "account") {
    if (!manage) return;
    const forAccount = accountId; setStopConfirm(null); setBusy("stop"); setStopNote("");
    const r = await stopAutomation(forAccount, scope);
    if (current.current !== forAccount) return;
    setBusy(null);
    const out = r.kind === "ok" ? (r.data as { outcome?: string; data?: { reason?: string } }) : null;
    setStopNote(out?.outcome === "recorded" ? (scope === "account" ? "Pause recorded by the backend. Outgoing messages for this account are off; the runtime line above shows the current state." : "Stop recorded by the backend. No new proactive messages will be scheduled; already-queued ones were cancelled where possible. Check the list below.")
      : out?.outcome === "no_change" ? (out.data?.reason ?? "No change was needed. Nothing new was recorded.")
      : r.kind === "ok" ? "The answer was not understood. Nothing is assumed stopped; check the state below."
      : r.kind === "readonly" || r.kind === "denied" ? "Your access does not allow this." : r.kind === "unconfirmed" ? "Unknown whether the stop was recorded. Nothing is assumed stopped. Refresh and check before relying on it."
      : r.kind === "refused" && r.code === "operator_only" ? r.error : r.kind === "refused" || r.kind === "unavailable" ? `Nothing was changed. ${r.error}` : "The stop was not confirmed. Nothing is assumed stopped.");
    void loadAccountData(forAccount);
  }
  async function cancel(id: string) {
    if (!manage || busy) return;
    const forAccount = accountId; setBusy(id); setNotice("");
    const r = await cancelAction(forAccount, id);
    if (current.current !== forAccount) return;
    setBusy(null);
    const out = r.kind === "ok" ? (r.data as { outcome?: string }).outcome : undefined;
    setNotice(out === "cancelled" ? "Cancelled. The backend shows it as cancelled." : out === "cancel_requested" ? "Cancel requested, but it is not cancelled yet. It may still be delivered; check its status." : out === "not_cancellable" ? "It can no longer be cancelled; it was already past scheduling."
      : r.kind === "ok" ? "The answer was not understood. Refresh the list." : r.kind === "readonly" || r.kind === "denied" ? "Your access does not allow this." : r.kind === "unconfirmed" ? "Unknown whether the cancel was recorded. Refresh the list before relying on it." : "The cancel was not accepted.");
    void loadAccountData(forAccount);
  }

  const account = accounts.state === "ok" ? accounts.data.find(a => a.accountId === accountId) : undefined;
  return <section className="grid min-w-0 gap-4 p-3" aria-labelledby="b-auto-h" data-b-automation>
    <h2 id="b-auto-h" className="text-lg font-semibold">Automation and follow-ups</h2>
    {!manage ? <p className="text-sm" role="note" data-b-readonly>Read-only access: you can view modes but not change them.</p> : null}
    {accounts.state === "loading" ? <BLoading label="Loading accounts…" /> : null}
    {accounts.state === "error" ? <BError message={accounts.message} onRetry={() => void loadAccounts()} /> : null}
    {accounts.state === "denied" ? <p role="alert" className="text-sm">Your session cannot read accounts. Sign in again.</p> : null}
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
        <p className="mt-2 text-sm text-muted">Changing the account-wide handling mode is not available: the backend has no route for it.</p>
        <div className="mt-3 grid gap-2" data-b-card="stop">
          <h4 className="text-sm font-semibold">Stop controls</h4>
          {stopConfirm === null ? <div className="flex flex-wrap gap-2">
            <button type="button" className={bDanger} disabled={!manage || busy !== null || access === null} onClick={() => setStopConfirm("engagement")} data-b-stop-engagement>Stop proactive messages</button>
            <button type="button" className={bDanger} disabled={!manage || busy !== null || access?.accountPause !== true} onClick={() => setStopConfirm("account")} data-b-emergency
              aria-describedby={access && !access.accountPause ? "pause-why" : undefined}>Pause all outgoing messages</button></div> :
            <div role="group" aria-label="Confirm stop" className="grid gap-2"><p className="text-sm">{stopConfirm === "account" ? `Pause the whole ${account.handle} connection? Every outgoing message stops until the operator activates it again.` : `Turn off scheduled offers, follow-ups and re-engagement for ${account.handle}?`}</p>
              <div className="flex flex-wrap gap-2"><button type="button" className={bDanger} onClick={() => void stop(stopConfirm)} autoFocus>Confirm</button>
                <button type="button" className={bButton} onClick={() => setStopConfirm(null)}>Cancel</button></div></div>}
          {access && !access.accountPause ? <p id="pause-why" className="text-xs text-muted" data-b-pause-note>Pausing the whole account is available to the Twin operator only. You can stop proactive messages or pause conversations below.</p> : null}
          <div aria-live="polite" className="text-sm" data-b-stop-note>{stopNote}</div>
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
        <h3 className="font-semibold">Scheduled proactive messages</h3>
        {engagement.state === "loading" ? <BLoading label="Checking scheduled messages…" /> : null}
        {engagement.state === "error" ? <BError message={engagement.message} onRetry={() => void loadAccountData(accountId)} /> : null}
        {engagement.state === "denied" ? <p role="alert" className="text-sm">Your session cannot read scheduled messages.</p> : null}
        {engagement.state === "ok" ? <>
          <p className="mt-1 text-sm" data-b-engagement={engagement.data.settings.settings.enabled ? "on" : "off"}>Proactive messages are {engagement.data.settings.settings.enabled ? "ON" : "off"} for this account{engagement.data.settings.bindingCurrent ? "" : " (saved settings belong to a previous connection and are not in force)"}.</p>
          <ActionList rows={engagement.data.actions} names={convs.state === "ok" ? convs.data.items : []} accountId={accountId} manage={manage} busy={busy} onCancel={id => void cancel(id)} /></> : null}
      </div>
      <BSourceList prefix="automation" />
    </> : null}
  </section>;
}

function ActionList({ rows, names, accountId, manage, busy, onCancel }: { rows: EngagementView["actions"]; names: BConversation[]; accountId: string; manage: boolean; busy: string | null; onCancel: (id: string) => void }) {
  if (rows.length === 0) return <p className="mt-2 text-sm" data-b-state="empty">No proactive messages are scheduled.</p>;
  const nameOf = (fanId: string) => names.find(c => c.conversationId === `${accountId}:${fanId}`)?.fanName ?? `Fan ${fanId}`;
  return <ul className="mt-2 grid min-w-0 gap-2">{rows.map(a => <li key={a.actionId} data-b-followup={a.status} className="min-w-0 rounded-lg border border-line p-2 text-sm">
    <p className="break-words font-semibold">{nameOf(a.fanId)} · {KIND_TEXT[a.kind]}</p>
    <p>{STATUS_TEXT[a.status]}. Due {bTime(a.dueAt)}, expires {bTime(a.expiresAt)}.</p>
    {a.cancelRequested && a.status !== "cancelled" ? <p className="text-warn">A cancel was requested but it is not cancelled. It may still be delivered.</p> : null}
    {a.reason ? <p className="text-xs text-muted">Reason: {a.reason.replace(/_/g, " ")}</p> : null}
    {canCancel(a.status) ? <button type="button" className={`${bButton} mt-2`} disabled={!manage || busy !== null} onClick={() => onCancel(a.actionId)}>Cancel this message</button> : null}</li>)}</ul>;
}
