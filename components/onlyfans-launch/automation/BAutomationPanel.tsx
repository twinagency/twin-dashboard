"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { parseWorkspaceScope, workspaceHref } from "@/lib/onlyfans-preview/scope";
import { useCallback, useEffect, useRef, useState } from "react";
import { HEALTH_TEXT, MODE_TEXT, TAKEOVER_TEXT, AFTER, actionRules, type BAccount, type BConversation, type BRuntime } from "@/lib/onlyfans/launch/automation/b-automation";
import { readAccounts, readConversations, readRuntime, sendControl } from "@/lib/onlyfans/launch/automation/b-automation-client";
import EngagementPanel from "./EngagementPanel";
import AccountControls from "./AccountControls";
import MoxyControls from "./MoxyControls";
import { bTime, type BReply } from "@/lib/onlyfans/launch/b-common";
import { BAccountSwitcher, BError, BLoading, BPending, bButton, bDanger } from "../b-shared/BShared";

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

/** Current account controls, conversation handling and native proactive engagement. */
export default function BAutomationPanel({ canManage = false, initialAccountId }: { canManage?: boolean; initialAccountId?: string }) {
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();
  const chooseAccount = (id: string) => { setAccountId(id); router.replace(workspaceHref(pathname, { ...parseWorkspaceScope(params), accountId: id }), { scroll: false }); };
  const [manage, setManage] = useState(canManage);
  const [accounts, setAccounts] = useState<Load<BAccount[]>>(loading);
  const [accountId, setAccountId] = useState("");
  const [convs, setConvs] = useState<Load<{ items: BConversation[]; more: boolean }>>(loading);
  const [runtime, setRuntime] = useState<Load<BRuntime>>(loading);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [moxySelected, setMoxySelected] = useState<boolean | null>(null);
  const epoch = useRef(0), ctl = useRef<AbortController | null>(null), convCtl = useRef<AbortController | null>(null), current = useRef("");
  current.current = accountId;

  const loadAccounts = useCallback(async () => {
    setAccounts(loading);
    const r = toLoad(await readAccounts());
    if (!r) return;
    setAccounts(r);
    if (r.state === "ok") {
      // An empty ?account= is no ?account=; one this session cannot see selects nothing and keeps the switcher.
      const wanted = initialAccountId || undefined;
      if (wanted && !r.data.some(a => a.accountId === wanted)) { setAccountId(""); return; }
      setAccountId(prev => wanted ?? (prev && r.data.some(a => a.accountId === prev) ? prev : r.data[0]?.accountId ?? ""));
    }
  }, [initialAccountId]);
  useEffect(() => { void loadAccounts(); }, [loadAccounts]);

  const loadAccountData = useCallback(async (id: string, only?: "convs") => {
    // A full load owns the account epoch. A conversations-only refresh must not abort or invalidate it,
    // but any account switch (full load) invalidates a refresh still in flight.
    let c: AbortController, mine: number;
    if (only) { convCtl.current?.abort(); c = new AbortController(); convCtl.current = c; mine = epoch.current; }
    else { ctl.current?.abort(); convCtl.current?.abort(); c = new AbortController(); ctl.current = c; mine = ++epoch.current; }
    const live = () => mine === epoch.current && !c.signal.aborted;
    if (!only) { setConvs(loading); setRuntime(loading); }
    const jobs: Promise<void>[] = [readConversations(id, c.signal).then(r => { const l = toLoad(r); if (l && live()) setConvs(l); })];
    if (!only) {
      jobs.push(readRuntime(id, c.signal).then(r => { const l = toLoad(r); if (l && live()) setRuntime(l); }));

    }
    await Promise.all(jobs);
  }, []);
  useEffect(() => {
    // Account switch: drop everything shown for the old account before the new reads land.
    setNotice(""); setConfirming(null); setBusy(null); setMoxySelected(null);
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

  const account = accounts.state === "ok" ? accounts.data.find(a => a.accountId === accountId) : undefined;
  return <section className="grid min-w-0 gap-4 p-3" aria-labelledby="b-auto-h" data-b-automation>
    <h2 id="b-auto-h" className="text-lg font-semibold">Automation and follow-ups</h2>
    {!manage ? <p className="text-sm" role="note" data-b-readonly>Read-only access: you can view modes but not change them.</p> : null}
    {accounts.state === "loading" ? <BLoading label="Loading accounts…" /> : null}
    {accounts.state === "error" ? <BError message={accounts.message} onRetry={() => void loadAccounts()} /> : null}
    {accounts.state === "denied" ? <p role="alert" className="text-sm">Your session cannot read accounts. Sign in again.</p> : null}
    {accounts.state === "pending" ? <BPending title="Accounts" contract={accounts.contract} /> : null}
    {accounts.state === "ok" && accounts.data.length === 0 ? <p className="text-sm" data-b-state="empty">No OnlyFans accounts are connected yet.</p> : null}
    {accounts.state === "ok" && accounts.data.length > 0 ? <BAccountSwitcher id="b-auto-acct" accounts={accounts.data} value={account ? accountId : ""} onChange={chooseAccount} /> : null}
    {accounts.state === "ok" && accounts.data.length > 0 && !account ? <p role="status" className="text-sm">That account is not available to this session. Select an authorised account.</p> : null}
    {accounts.state === "ok" && account ? <>
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
        <AccountControls key={accountId} accountId={accountId} manage={manage} onChanged={() => void loadAccountData(accountId)} />
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

      <MoxyControls key={accountId} accountId={accountId} manage={manage} onOwnership={setMoxySelected} />
      {/* A brake: follow-ups and their cancel render whatever the Moxy read says; only the policy editor waits for a legacy view. */}
      <EngagementPanel key={accountId} accountId={accountId} manage={manage} editPolicy={moxySelected === false} />

    </> : null}
  </section>;
}
