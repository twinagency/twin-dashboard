"use client";
/** Shared pieces for launch screens A, B and C: stale-safe loading, honest labels, account switching. */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { LAUNCH_SCHEMA } from "@/lib/onlyfans/launch/a-types";

export const buttonClass = "min-h-11 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50";
export const dangerClass = "min-h-11 rounded-lg border border-[#f0c3cb] px-3 py-2 text-sm font-semibold text-[#9b1c31] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50";

export type Load<T> =
  | { kind: "loading" }
  | { kind: "ok"; data: T }
  | { kind: "denied"; error: string }
  | { kind: "pending"; error: string }   // backend contract missing or unreachable
  | { kind: "error"; error: string };

/** The base for every proxy call. */
export const launchBase = (accountId: string) => `/api/onlyfans-launch/abc/accounts/${encodeURIComponent(accountId)}`;

const LOADING = { kind: "loading" } as const;
/** Reads one resource. A response for an earlier account or request can never overwrite a newer one, and a state read for another
 * url is never returned: on a url change the caller sees loading in the same render, not the old url's data. */
export function useJsonResource<T>(url: string, parse: (v: unknown) => T | null, unwrap = true) {
  const [held, setHeld] = useState<{ url: string; load: Load<T> }>({ url, load: LOADING });
  const setState = useCallback((load: Load<T>) => setHeld({ url, load }), [url]);
  const state: Load<T> = held.url === url ? held.load : LOADING;
  const [lastSuccess, setLastSuccess] = useState<{ url: string; checkedAt: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0), controller = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    const mine = ++generation.current;
    controller.current?.abort();
    const ac = new AbortController(); controller.current = ac;
    setState({ kind: "loading" }); setAttempt(previous => previous + 1);
    try {
      const r = await fetch(url, { credentials: "same-origin", cache: "no-store", redirect: "error", signal: AbortSignal.any([ac.signal, AbortSignal.timeout(15_000)]) });
      const j = await r.json().catch(() => null) as { schemaVersion?: string; accountId?: string; ok?: boolean; data?: unknown; error?: string; outcome?: string } | null;
      if (mine !== generation.current) return;
      if (r.status === 401 || r.status === 403) { setLastSuccess(null); setState({ kind: "denied", error: j?.error ?? "Your session cannot read this." }); return; }
      if (r.status === 503 || j?.outcome === "unavailable") { setState({ kind: "pending", error: j?.error ?? "The backend contract is not available." }); return; }
      const requestedAccount = url.match(/\/api\/onlyfans-launch\/abc\/accounts\/([^/]+)/)?.[1];
      if (!r.ok || (unwrap && (!j?.ok || j.schemaVersion !== LAUNCH_SCHEMA || !requestedAccount || j.accountId !== decodeURIComponent(requestedAccount))) || j === null) { setState({ kind: "error", error: j?.error ?? "This could not be read." }); return; }
      const data = parse(unwrap ? j!.data : j);
      if (data !== null) setLastSuccess({ url, checkedAt: new Date().toISOString() });
      setState(data === null ? { kind: "error", error: "The backend answer was not in the expected shape, so nothing is shown." } : { kind: "ok", data });
    } catch (e) {
      if (mine !== generation.current || (e as Error)?.name === "AbortError") return;
      setState({ kind: "error", error: "This could not be read. Check your connection and retry." });
    }
  }, [url, parse, unwrap, setState]);
  useEffect(() => { void load(); return () => { generation.current++; controller.current?.abort(); }; }, [load]);
  return { state, reload: load, lastSuccess: lastSuccess?.url === url ? lastSuccess : null, attempt };
}

export type Post = { ok: true } | { ok: false; outcome: "refused" | "unconfirmed" | "unavailable" | "denied"; error: string };
/** Sends one command. A lost reply is reported as unconfirmed, never as success. */
export async function postCommand(accountId: string, command: unknown): Promise<Post> {
  try {
    const r = await fetch(`${launchBase(accountId)}/command`, { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(command), signal: AbortSignal.timeout(20_000) });
    const j = await r.json().catch(() => null) as { schemaVersion?: string; accountId?: string; ok?: boolean; error?: string; outcome?: string } | null;
    if (r.ok && j?.ok && j.schemaVersion === LAUNCH_SCHEMA && j.accountId === accountId) return { ok: true };
    if (r.status === 401 || r.status === 403) return { ok: false, outcome: "denied", error: j?.error ?? "Your session cannot make this change." };
    if(r.ok || !j || r.status >= 500 && r.status !== 503)return {ok:false,outcome:"unconfirmed",error:j?.error??"The acknowledgement could not be verified. Read current state before retrying."};
    return { ok: false, outcome: ["refused","unconfirmed","unavailable"].includes(j.outcome??"") ? j.outcome as "refused" | "unconfirmed" | "unavailable" : "refused", error: j.error ?? "The change was not accepted." };
  } catch { return { ok: false, outcome: "unconfirmed", error: "The outcome is not confirmed. Refresh, then retry if it did not apply." }; }
}

export const useLaunchResource = <T,>(accountId: string, resource: string, parse: (v: unknown) => T | null) => useJsonResource<T>(`${launchBase(accountId)}/${resource}`, parse);

export function useCanManage(accountId: string) {
  const [canManage, setCanManage] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true; setCanManage(null);
    fetch(`${launchBase(accountId)}/access`, { credentials: "same-origin", cache: "no-store" }).then(r => r.ok ? r.json() : null).then(j => { if (live) setCanManage(j?.schemaVersion === LAUNCH_SCHEMA && j.accountId === accountId && j.ok === true && j.data?.canManage === true); }).catch(() => { if (live) setCanManage(false); });
    return () => { live = false; };
  }, [accountId]);
  return canManage;
}

export function FixtureBanner({ what }: { what: string }) {
  return <div role="note" data-launch-fixture="true" className="rounded-lg border-2 border-dashed border-[#d9a441] bg-[#fff8e8] px-3 py-2 text-sm font-semibold text-[#6b4a00]">
    FIXTURE-ONLY, NOT CONNECTED. {what} Sample data on this screen is not from your account. Nothing here can be saved.</div>;
}

export function Pending({ screen, error, onFixture, children }: { screen: string; error: string; onFixture: () => void; children?: ReactNode }) {
  return <div data-launch-state="pending" role="status" className="rounded-xl border border-[#f0d9a8] bg-[#fff8e8] p-4">
    <div className="text-sm font-semibold text-ink">{screen}: backend contract not available</div>
    <p className="mt-1 text-xs leading-5 text-muted">{error} Nothing is shown as live. You can look at a labelled sample of the layout.</p>
    {children}
    <button type="button" className={`${buttonClass} mt-3`} onClick={onFixture}>Show FIXTURE-ONLY sample</button>
  </div>;
}

export function StateLine({ state, retry, label }: { state: Load<unknown>; retry: () => void; label: string }) {
  if (state.kind === "loading") return <div data-launch-state="loading" aria-busy="true" role="status" className="text-sm text-muted">Loading {label}…</div>;
  if (state.kind === "denied") return <div data-launch-state="denied" role="alert" className="rounded-xl border border-[#f0c3cb] bg-[#fff5f6] p-3 text-sm text-ink">{state.error} Sign in again.</div>;
  if (state.kind === "error") return <div data-launch-state="error" role="alert" className="rounded-xl border border-[#f0c3cb] bg-[#fff5f6] p-3 text-sm text-ink">{state.error}
    <button type="button" className={`${buttonClass} ml-2`} onClick={retry}>Retry</button></div>;
  return null;
}

export const Section = ({ title, children, id }: { title: string; children: ReactNode; id?: string }) =>
  <Card className="p-4"><h2 id={id} className="text-base font-semibold text-ink">{title}</h2><div className="mt-3 space-y-3">{children}</div></Card>;

export const STATUS_STYLE: Record<string, string> = { ok: "bg-[#e6f6ec] text-[#14653a]", warn: "bg-[#fff1cc] text-[#6b4a00]", blocked: "bg-[#fde3e7] text-[#9b1c31]", unknown: "bg-elev text-muted" };
export const StatusPill = ({ status }: { status: string }) => <span data-status={status} className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[status] ?? STATUS_STYLE.unknown}`}>{status === "ok" ? "Ready" : status === "warn" ? "Needs attention" : status === "blocked" ? "Blocked" : "Not verified"}</span>;
export const formatCents = (c: number | null, cur: string | null) => {
  if(c === null || !Number.isSafeInteger(c))return "amount unknown";
  const whole=BigInt(c < 0 ? -c : c),hundred=BigInt(100);
  return `${c < 0 ? "-" : ""}${whole / hundred}.${String(whole % hundred).padStart(2,"0")} ${cur ?? ""}`.trim();
};
export const when = (v: string | null) => v ? new Date(v).toLocaleString() : "unknown time";
