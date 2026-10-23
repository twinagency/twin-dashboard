"use client";
/** Shared pieces for launch screens A, B and C: stale-safe loading, honest labels, account switching. */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";

export const buttonClass = "min-h-11 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50";
export const dangerClass = "min-h-11 rounded-lg border border-[#f0c3cb] px-3 py-2 text-sm font-semibold text-[#9b1c31] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50";

export type Load<T> =
  | { kind: "loading" }
  | { kind: "ok"; data: T }
  | { kind: "denied"; error: string }
  | { kind: "unavailable"; error: string }   // backend not configured or unreachable
  | { kind: "error"; error: string };

/** The base for every readiness and purchases proxy call. */
export const launchBase = (accountId: string) => `/api/onlyfans-launch/abc/accounts/${encodeURIComponent(accountId)}`;

/** Reads one resource. A response for an earlier account or request can never overwrite a newer one. */
export function useJsonResource<T>(url: string, parse: (v: unknown) => T | null, unwrap = true) {
  const [state, setState] = useState<Load<T>>({ kind: "loading" });
  const generation = useRef(0), controller = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    const mine = ++generation.current;
    controller.current?.abort();
    const ac = new AbortController(); controller.current = ac;
    setState({ kind: "loading" });
    try {
      const r = await fetch(url, { credentials: "same-origin", cache: "no-store", redirect: "error", signal: ac.signal });
      const j = await r.json().catch(() => null) as { ok?: boolean; data?: unknown; error?: string; outcome?: string } | null;
      if (mine !== generation.current) return;
      if (r.status === 401 || r.status === 403) { setState({ kind: "denied", error: j?.error ?? "Your session cannot read this." }); return; }
      if (r.status === 503 || j?.outcome === "unavailable") { setState({ kind: "unavailable", error: j?.error ?? "The backend is not available right now." }); return; }
      if (!r.ok || (unwrap && !j?.ok) || j === null) { setState({ kind: "error", error: j?.error ?? "This could not be read." }); return; }
      const data = parse(unwrap ? j!.data : j);
      setState(data === null ? { kind: "error", error: "The backend answer was not in the expected shape, so nothing is shown." } : { kind: "ok", data });
    } catch (e) {
      if (mine !== generation.current || (e as Error)?.name === "AbortError") return;
      setState({ kind: "error", error: "This could not be read. Check your connection and retry." });
    }
  }, [url, parse, unwrap]);
  useEffect(() => { void load(); return () => { generation.current++; controller.current?.abort(); }; }, [load]);
  return { state, reload: load };
}

export const useLaunchResource = <T,>(accountId: string, resource: string, parse: (v: unknown) => T | null) => useJsonResource<T>(`${launchBase(accountId)}/${resource}`, parse);

export type Access = { canManage: boolean; accountPause: boolean };
/** Permission from the server session. Null until known; controls stay disabled until then. */
export function useAccess(accountId: string): Access | null {
  const [access, setAccess] = useState<Access | null>(null);
  useEffect(() => {
    let live = true; setAccess(null);
    if (!accountId) return;
    fetch(`${launchBase(accountId)}/access`, { credentials: "same-origin", cache: "no-store" }).then(r => r.json()).then(j => {
      if (live) setAccess(j?.ok === true && typeof j.data?.canManage === "boolean" ? { canManage: j.data.canManage, accountPause: j.data.accountPause === true } : { canManage: false, accountPause: false }); })
      .catch(() => { if (live) setAccess({ canManage: false, accountPause: false }); });
    return () => { live = false; };
  }, [accountId]);
  return access;
}

export function Unavailable({ screen, error }: { screen: string; error: string }) {
  return <div data-launch-state="unavailable" role="status" className="rounded-xl border border-[#f0d9a8] bg-[#fff8e8] p-4">
    <div className="text-sm font-semibold text-ink">{screen}: not available right now</div>
    <p className="mt-1 text-xs leading-5 text-muted">{error} Nothing is shown as live and nothing was changed.</p></div>;
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
export const formatCents = (c: number | null, cur: string | null) => c === null ? "amount unknown" : `${(c / 100).toFixed(2)} ${cur ?? ""}`.trim();
export const when = (v: string | null) => v ? new Date(v).toLocaleString() : "unknown time";
