"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { moxyAck, parseMoxy, record, starterSettings, type MoxyMode, type MoxyView } from "@/lib/onlyfans/moxy";
import { buttonClass, dangerClass } from "../a-shared";

const words = (value: string) => value.replaceAll("_", " ").replaceAll(":", ": ");
export function MoxyStateSummary({ value }: { value: MoxyView }) {
  if (value.engine === "legacy") return <p className="text-sm">Moxy has not been selected for this account.</p>;
  return <>
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
      <dt>Engine</dt><dd className="font-semibold">Moxy</dd>
      <dt>Mode</dt><dd className="capitalize" data-moxy-mode={value.mode}>{value.mode}</dd>
      <dt>Readiness</dt><dd className={value.readiness.ready ? "text-green-700" : "text-amber-700"}>
        {value.readiness.ready ? "Configured prerequisites met" : "Setup needs attention"}</dd>
    </dl>
    {value.readiness.blockers.length ? <ul className="list-disc space-y-1 pl-5 text-sm" aria-label="Moxy readiness blockers">
      {value.readiness.blockers.map(reason => <li key={reason}>{words(reason)}</li>)}</ul> : null}
    <details className="text-sm"><summary className="cursor-pointer font-medium">Recent decisions ({value.decisions.length})</summary>
      {value.decisions.length === 0 ? <p className="py-2">No decisions recorded.</p> : <ul className="mt-2 grid gap-2">
        {value.decisions.map(d => <li key={d.id} className="min-w-0 rounded-lg border border-line p-3">
          <p className="font-medium">Fan {d.fanId} · {words(d.kind)} · {words(d.status)}</p>
          {d.reason ? <p className="mt-1 break-words">{words(d.reason)}</p> : null}
          {typeof d.decision?.reason === "string" ? <p className="mt-1 break-words">{d.decision.reason}</p> : null}
          {typeof d.decision?.text === "string" && d.decision.text ? <blockquote className="mt-2 whitespace-pre-wrap break-words border-l-2 border-blue-300 pl-3">{d.decision.text}</blockquote> : null}
        </li>)}</ul>}
    </details>
  </>;
}

export default function MoxyControls({ accountId, manage, onOwnership }: {
  accountId: string; manage: boolean; onOwnership: (selected: boolean | null) => void;
}) {
  const base = `/api/onlyfans-configuration/accounts/${encodeURIComponent(accountId)}/moxy`;
  const [value, setValue] = useState<MoxyView | null>(null), [error, setError] = useState("");
  const [notice, setNotice] = useState(""), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [serverManage, setServerManage] = useState(false), [nextMode, setNextMode] = useState<MoxyMode>("off");
  const [creator, setCreator] = useState(""), [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const [fileName, setFileName] = useState("");
  const epoch = useRef(0), mounted = useRef(true);
  const load = useCallback(async () => {
    const mine = ++epoch.current;
    setLoading(true); setError(""); onOwnership(null);
    try {
      const r = await fetch(base, { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(10000) });
      const raw: unknown = await r.json();
      const data = r.ok ? parseMoxy(raw, accountId) : null;
      if (!mounted.current || mine !== epoch.current) return;
      if (!data) throw Error(record(raw) && typeof raw.error === "string" ? raw.error : "Moxy controls are unavailable. Refresh to try again.");
      setValue(data); setServerManage(record(raw) && raw.canManage === true);
      setNextMode(data.engine === "moxy" ? data.mode : "off"); onOwnership(data.moxySelected);
    } catch (e) {
      if (mounted.current && mine === epoch.current) { setValue(null); setServerManage(false); setError(e instanceof Error ? e.message : "Moxy controls are unavailable."); }
    } finally { if (mounted.current && mine === epoch.current) setLoading(false); }
  }, [base, accountId, onOwnership]);
  useEffect(() => { mounted.current = true; setDraft(null); setCreator(""); setFileName(""); setNotice(""); setBusy(false);
    void load(); return () => { mounted.current = false; epoch.current++; }; }, [load]);
  const editable = manage && serverManage && !loading && !busy;
  const settings = draft ?? (value?.engine === "moxy" ? value.settings : creator ? starterSettings(creator) : null);
  const onReady = value?.engine === "moxy" && value.readiness.ready && draft === null;

  async function importSetup(file: File | undefined) {
    if (!file) return;
    if (file.size > 120000) { setError("Choose a creator setup smaller than 120 KB."); return; }
    const mine = epoch.current;
    try {
      const next: unknown = JSON.parse(await file.text());
      if (!record(next) || typeof next.creator_key !== "string" || !Array.isArray(next.products) ||
          !record(next.sequences) || !record(next.catalogue_bindings) || !record(next.operational)) throw Error("Use an approved Moxy creator setup file.");
      if (!mounted.current || mine !== epoch.current) return;
      setDraft(next); setFileName(file.name); setNextMode("off"); setError("");
    } catch (e) { if (mounted.current && mine === epoch.current) setError(e instanceof Error ? e.message : "That creator setup is invalid."); }
  }
  async function save() {
    if (!editable || !value || !settings || nextMode === "on" && !onReady) return;
    const change = { expectedRevision: value.engine === "moxy" ? value.revision : 0, mode: nextMode, settings };
    const mine = epoch.current;
    setBusy(true); setNotice(""); setError("");
    try {
      const r = await fetch(base, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change), signal: AbortSignal.timeout(10000) });
      const raw: unknown = await r.json();
      if (!mounted.current || mine !== epoch.current) return;
      if (r.ok && moxyAck(raw, accountId, change)) { setNotice("Moxy settings saved."); setDraft(null); setFileName(""); }
      else setNotice(record(raw) && typeof raw.error === "string" ? words(raw.error) : "The save outcome is unconfirmed. Reading the current mode.");
    } catch { if (mounted.current && mine === epoch.current) setNotice("The save outcome is unconfirmed. Reading the current mode before another change."); }
    finally { if (mounted.current && mine === epoch.current) { setBusy(false); await load(); } }
  }
  return <section data-moxy-controls className="grid min-w-0 gap-3 rounded-xl border border-line bg-white p-4" aria-labelledby="moxy-controls-heading">
    <div className="flex items-center justify-between gap-3"><h3 id="moxy-controls-heading" className="font-semibold">Moxy engine</h3>
      <button type="button" className={buttonClass} disabled={loading || busy} onClick={() => void load()}>Refresh</button></div>
    {loading ? <p role="status" className="text-sm">Loading Moxy controls…</p> : null}
    {error ? <p role="alert" className="break-words text-sm text-red-700">{error}</p> : null}
    {value && !loading ? <>
      <MoxyStateSummary value={value} />
      {!manage || !serverManage ? <p className="text-sm">Read-only access.</p> : null}
      {value.engine === "legacy" && !draft ? <label className="grid gap-1 text-sm">Creator setup
        <select className="min-h-11 rounded-lg border border-line bg-white px-2" value={creator} disabled={!editable} onChange={e => setCreator(e.target.value)}>
          <option value="">Select a creator setup</option><option value="amelia">Amelia</option><option value="cristina">Cristina</option>
        </select></label> : null}
      <div className="flex flex-wrap items-end gap-3"><label className="grid gap-1 text-sm">Mode
        <select className="min-h-11 rounded-lg border border-line bg-white px-3" value={nextMode} disabled={!editable} onChange={e => setNextMode(e.target.value as MoxyMode)}>
          <option value="off">Off</option><option value="preview">Preview</option><option value="on" disabled={!onReady}>On</option>
        </select></label>
        <span title="Off retains Moxy ownership and stops new Moxy work. Preview records decisions without sending. On requires current verified prerequisites." aria-label="Mode help" className="mb-3 cursor-help text-blue-700">ⓘ</span>
        <button type="button" className={nextMode === "off" ? dangerClass : buttonClass} disabled={!editable || !settings || nextMode === "on" && !onReady} onClick={() => void save()}>
          {busy ? "Saving…" : value.engine === "legacy" ? "Select Moxy" : "Save mode"}</button></div>
      <details className="text-sm"><summary className="cursor-pointer font-medium">Creator setup</summary>
        <label className="mt-3 grid gap-2">Upload approved creator setup
          <input type="file" accept="application/json,.json" disabled={!editable} onChange={e => void importSetup(e.target.files?.[0])} /></label>
        {fileName ? <p className="mt-2 break-words">Ready to save with Moxy Off: {fileName}</p> : null}
        {settings ? <p className="mt-2">{String(settings.creator_key ?? "Creator")} · {Array.isArray(settings.products) ? settings.products.length : 0} products</p> : null}
      </details>
      <a className="text-sm text-blue-700 underline" href={`/onlyfans/operations?account=${encodeURIComponent(accountId)}`}>Open handovers and account operations</a>
    </> : null}
    {notice ? <p role="status" className="break-words text-sm">{notice}</p> : null}
  </section>;
}
