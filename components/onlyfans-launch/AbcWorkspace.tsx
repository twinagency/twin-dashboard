"use client";
/** Launch screens A (readiness), B (purchases and ownership), C (personality and AI settings). */
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SCREEN_LABELS, SCREENS, WIRING, type Screen } from "@/lib/onlyfans/launch/a-types";
import ReadinessScreen from "./readiness/ReadinessScreen";
import PurchasesScreen from "./purchases/PurchasesScreen";
import PersonalityScreen from "./personality/PersonalityScreen";
import { StateLine, useJsonResource } from "./a-shared";
import { parseAccounts as parseNativeAccounts } from "@/lib/onlyfans/launch/automation/b-automation";

const parseAccounts = (v: unknown) => {
  const a = parseNativeAccounts(v);
  return a ? a.map(x => ({ accountId: x.accountId, label: `${x.handle} (${x.accountId})` })) : null;
};
const WIRING_LABEL = { connected: "Connected", partial: "Partly connected", "backend-pending": "Backend pending" } as const;

export default function AbcWorkspace({ initialAccountId = null, initialScreen = "readiness" }: { initialAccountId?: string | null; initialScreen?: Screen }) {
  const { state, reload } = useJsonResource("/api/onlyfans/accounts", parseAccounts, false);
  const [accountId, setAccountId] = useState<string | null>(initialAccountId), [screen, setScreen] = useState<Screen>(initialScreen);
  const router = useRouter(), pathname = usePathname(), searchParams = useSearchParams();
  const selectAccount = (next: string) => {
    if (state.kind !== "ok" || !state.data.some(account => account.accountId === next)) return;
    setAccountId(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("account", next); params.delete("creator");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };
  useEffect(() => {
    if (state.kind === "ok" && initialAccountId) setAccountId(state.data.some(a => a.accountId === initialAccountId) ? initialAccountId : null);
  }, [initialAccountId, state.kind]);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => { if (state.kind === "ok" && !initialAccountId && (!accountId || !state.data.some(a => a.accountId === accountId))) setAccountId(state.data[0]?.accountId ?? null); }, [state, accountId, initialAccountId]);
  const onGo = useCallback((s: string) => { if ((SCREENS as string[]).includes(s)) setScreen(s as Screen); }, []);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const n = e.key === "ArrowRight" ? (i + 1) % SCREENS.length : e.key === "ArrowLeft" ? (i + SCREENS.length - 1) % SCREENS.length : e.key === "Home" ? 0 : e.key === "End" ? SCREENS.length - 1 : -1;
    if (n >= 0) { e.preventDefault(); setScreen(SCREENS[n]); tabs.current[n]?.focus(); }
  };
  return <div data-launch-workspace className="mx-auto w-full max-w-4xl space-y-4 overflow-x-hidden p-4">
    <header className="space-y-2"><h1 className="text-xl font-semibold text-ink">Launch control</h1>
      <StateLine state={state} retry={reload} label="accounts" />
      {state.kind === "pending" ? <p data-launch-state="pending" className="text-sm text-muted">Accounts are not available from this dashboard's backend. Nothing can be shown.</p> : null}
      {state.kind === "ok" && !state.data.length ? <p data-launch-state="empty" className="text-sm text-muted">No accounts are available to you.</p> : null}
      {state.kind === "ok" && state.data.length ? <div><label htmlFor="launch-account" className="block text-xs text-muted">Account</label>
        <select id="launch-account" className="min-h-11 w-full max-w-sm rounded-lg border border-line bg-white px-2 text-sm" value={accountId ?? ""} onChange={e => selectAccount(e.target.value)}>
          {accountId ? null : <option value="" disabled>Select an account</option>}
          {state.data.map(a => <option key={a.accountId} value={a.accountId}>{a.label}</option>)}</select></div> : null}
    </header>
    {state.kind === "ok" && initialAccountId && !accountId ? <p role="status">That account is not available to this session. Select an authorised account.</p> : null}
    {accountId ? <>
      <div role="tablist" aria-label="Launch screens" className="flex gap-1 overflow-x-auto">
        {SCREENS.map((s, i) => <button key={s} ref={el => { tabs.current[i] = el; }} role="tab" id={`tab-${s}`} aria-selected={screen === s} aria-controls={`panel-${s}`} tabIndex={screen === s ? 0 : -1}
          onKeyDown={e => onKey(e, i)} onClick={() => setScreen(s)}
          className={`min-h-11 shrink-0 rounded-lg border border-line px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 ${screen === s ? "bg-elev text-ink" : "text-accent"}`}>{SCREEN_LABELS[s]}</button>)}</div>
      <p data-wiring={WIRING[screen].wiring} className="text-xs text-muted"><strong>{WIRING_LABEL[WIRING[screen].wiring]}.</strong> {WIRING[screen].note}</p>
      <div role="tabpanel" id={`panel-${screen}`} aria-labelledby={`tab-${screen}`} tabIndex={0}>
        {screen === "readiness" ? <ReadinessScreen key={accountId} accountId={accountId} onGo={onGo} /> : null}
        {screen === "purchases" ? <PurchasesScreen key={accountId} accountId={accountId} /> : null}
        {screen === "personality" ? <PersonalityScreen key={accountId} accountId={accountId} /> : null}
      </div></> : null}
  </div>;
}
