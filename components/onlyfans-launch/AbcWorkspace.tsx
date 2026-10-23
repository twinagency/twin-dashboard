"use client";
/** Launch screens A (readiness), B (purchases ledger), C (personality and AI). */
import { useCallback, useEffect, useRef, useState } from "react";
import { SCREEN_LABELS, SCREENS, WIRING, type Screen } from "@/lib/onlyfans/launch/a-types";
import ReadinessScreen from "./readiness/ReadinessScreen";
import LedgerScreen from "./ledger/LedgerScreen";
import PersonalityScreen from "./personality/PersonalityScreen";
import { StateLine, useJsonResource } from "./a-shared";

const parseAccounts = (v: unknown) => {
  const a = (v as { accounts?: { accountId?: unknown; binding?: { handle?: unknown; creatorName?: unknown } }[] } | null)?.accounts;
  if (!Array.isArray(a)) return null;
  return a.filter(x => typeof x.accountId === "string").map(x => ({ accountId: x.accountId as string, label: `${String(x.binding?.creatorName ?? "Account")} (${String(x.binding?.handle ?? x.accountId)})` }));
};

export default function AbcWorkspace({ initialAccountId = null, initialScreen = "readiness" }: { initialAccountId?: string | null; initialScreen?: Screen }) {
  const { state, reload } = useJsonResource("/api/onlyfans/accounts", parseAccounts, false);
  const [accountId, setAccountId] = useState<string | null>(initialAccountId), [screen, setScreen] = useState<Screen>(initialScreen);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => { if (state.kind === "ok" && (!accountId || !state.data.some(a => a.accountId === accountId))) setAccountId(state.data[0]?.accountId ?? null); }, [state, accountId]);
  const onGo = useCallback((s: string) => { if ((SCREENS as string[]).includes(s)) setScreen(s as Screen); }, []);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const n = e.key === "ArrowRight" ? (i + 1) % SCREENS.length : e.key === "ArrowLeft" ? (i + SCREENS.length - 1) % SCREENS.length : e.key === "Home" ? 0 : e.key === "End" ? SCREENS.length - 1 : -1;
    if (n >= 0) { e.preventDefault(); setScreen(SCREENS[n]); tabs.current[n]?.focus(); }
  };
  return <div data-launch-workspace className="mx-auto w-full max-w-4xl space-y-4 overflow-x-hidden p-4">
    <header className="space-y-2"><h1 className="text-xl font-semibold text-ink">Launch control</h1>
      <StateLine state={state} retry={reload} label="accounts" />
      {state.kind === "unavailable" ? <p data-launch-state="pending" className="text-sm text-muted">Accounts could not be read. Nothing can be shown.</p> : null}
      {state.kind === "ok" && !state.data.length ? <p data-launch-state="empty" className="text-sm text-muted">No accounts are available to you.</p> : null}
      {state.kind === "ok" && state.data.length ? <div><label htmlFor="launch-account" className="block text-xs text-muted">Account</label>
        <select id="launch-account" className="min-h-11 w-full max-w-sm rounded-lg border border-line bg-white px-2 text-sm" value={accountId ?? ""} onChange={e => setAccountId(e.target.value)}>
          {state.data.map(a => <option key={a.accountId} value={a.accountId}>{a.label}</option>)}</select></div> : null}
    </header>
    {accountId ? <>
      <div role="tablist" aria-label="Launch screens" className="flex gap-1 overflow-x-auto">
        {SCREENS.map((s, i) => <button key={s} ref={el => { tabs.current[i] = el; }} role="tab" id={`tab-${s}`} aria-selected={screen === s} aria-controls={`panel-${s}`} tabIndex={screen === s ? 0 : -1}
          onKeyDown={e => onKey(e, i)} onClick={() => setScreen(s)}
          className={`min-h-11 shrink-0 rounded-lg border border-line px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 ${screen === s ? "bg-elev text-ink" : "text-accent"}`}>{SCREEN_LABELS[s]}</button>)}</div>
      <p data-wiring={screen} className="text-xs text-muted">{WIRING[screen]}</p>
      <div role="tabpanel" id={`panel-${screen}`} aria-labelledby={`tab-${screen}`} tabIndex={0}>
        {screen === "readiness" ? <ReadinessScreen key={accountId} accountId={accountId} onGo={onGo} /> : null}
        {screen === "ledger" ? <LedgerScreen key={accountId} accountId={accountId} /> : null}
        {screen === "personality" ? <PersonalityScreen key={accountId} accountId={accountId} /> : null}
      </div></> : null}
  </div>;
}
