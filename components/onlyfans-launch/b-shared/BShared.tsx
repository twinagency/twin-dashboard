"use client";
import type { BAccount } from "@/lib/onlyfans/launch/automation/b-automation";
import { B_CAPABILITIES } from "@/lib/onlyfans/launch/b-common";

export const bButton = "min-h-11 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";
export const bDanger = "min-h-11 rounded-lg border border-warn/60 px-3 py-2 text-sm font-semibold text-warn focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";

export function BSourceList({ prefix }: { prefix: "automation" | "memory" }) {
  return <ul className="mt-2 grid min-w-0 gap-1 text-xs" aria-label="What is connected">
    {B_CAPABILITIES.filter(c => c.id.startsWith(prefix + ".")).map(c => <li key={c.id} data-b-source={c.source} className="flex min-w-0 flex-wrap gap-x-2">
      <span className={`font-bold ${c.source === "real" ? "text-good" : "text-warn"}`}>{c.source === "real" ? "CONNECTED" : "NOT AVAILABLE"}</span>
      <span className="min-w-0 break-words">{c.label}</span></li>)}</ul>;
}
/** Account switching. Changing it is the caller's cue to abort in-flight reads and clear stale data. */
export function BAccountSwitcher({ accounts, value, onChange, id }: { accounts: BAccount[]; value: string; onChange: (id: string) => void; id: string }) {
  return <div className="min-w-0"><label htmlFor={id} className="block text-xs font-semibold uppercase tracking-wide text-muted">Account</label>
    <select id={id} value={value} onChange={e => onChange(e.target.value)} className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-line bg-transparent px-2 text-sm">
      {accounts.map(a => <option key={a.accountId} value={a.accountId}>{a.handle}</option>)}</select></div>;
}
export function BLoading({ label }: { label: string }) {
  return <p className="text-sm text-muted" role="status" aria-busy="true" data-b-state="loading">{label}</p>;
}
export function BError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div role="alert" data-b-state="error" className="text-sm"><p>{message}</p>{onRetry ? <button type="button" className={`${bButton} mt-2`} onClick={onRetry}>Try again</button> : null}</div>;
}
