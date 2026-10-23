"use client";
import { useRef, useState } from "react";
import ConfigurationEditor from "@/components/onlyfans-preview/ConfigurationEditor";
import { bFetch, bTime } from "@/lib/onlyfans/launch/b-common";
import { FACT_KEYS, parseHistory, parsePersonality, type FactKey, type History, type Personality, type Review } from "@/lib/onlyfans/launch/live/personality-model";
import { Section, StateLine, Unavailable, buttonClass, useAccess, useJsonResource } from "../a-shared";

const field = "min-h-11 w-full rounded-lg border border-line bg-white px-2 text-sm disabled:opacity-60";
const FACT_LABEL: Record<FactKey, string> = { age: "Age", job: "Job", home_city: "Home city", relationship: "Relationship", kids: "Kids", family: "Family", tattoos: "Tattoos", kinks: "Interests", limits: "Limits" };
type Mode = "keep" | "set" | "clear";
const base = (accountId: string) => `/api/onlyfans-launch/personality/accounts/${encodeURIComponent(accountId)}`;

function ReadinessCard({ p }: { p: Personality }) {
  const r = p.readiness;
  if (!r) return <p data-personality-readiness="none" className="text-sm text-muted">Not ready: no personality has been imported yet, so readiness is not verified.</p>;
  const ready = r.ready && p.state === "approved" && p.configurationCurrent === true;
  return <div data-personality-readiness={ready ? "ready" : "not-ready"} className="space-y-1 text-sm">
    <p className="font-semibold text-ink">{ready ? "Ready: approved personality, verified credential, positive budget" : "Not ready"}</p>
    {r.blockers.length ? <ul className="list-disc pl-5 text-xs text-muted">{r.blockers.map(b => <li key={b}>{b.replace(/_/g, " ")}</li>)}</ul> : null}
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
      <dt className="text-muted">Model</dt><dd>{r.model.modelId ?? "none saved"} ({r.model.state.replace(/_/g, " ")})</dd>
      <dt className="text-muted">Credential</dt><dd>{r.credential.metadataAvailable ? (r.credential.configured ? "Verified and unexpired" : "Not usable: " + r.credential.state.replace(/_/g, " ")) : "Not verified by the backend"}</dd>
      <dt className="text-muted">Daily budget</dt><dd>{r.budget.dailyCostCapCents === null ? "none" : `${(r.budget.dailyCostCapCents / 100).toFixed(2)} USD`} ({r.budget.state.replace(/_/g, " ")})</dd>
      <dt className="text-muted">Tone check</dt><dd>{r.tone.state.replace(/_/g, " ")}</dd></dl>
    <p className="text-xs text-muted">A saved model name does not make an account ready. This does not allow sending or confirm a live provider call.</p>
  </div>;
}

function ReviewForm({ p, accountId, onChanged, setNote, disabled }: { p: Personality; accountId: string; onChanged: () => void; setNote: (s: string) => void; disabled: boolean }) {
  const doc = p.document!, saved = doc.review;
  const [persona, setPersona] = useState(saved.persona ?? doc.draft.suggestedPersona.text);
  const [defaultModel, setDefaultModel] = useState(saved.defaultModel ?? ""), [override, setOverride] = useState(typeof saved.replyModelOverride === "string" ? saved.replyModelOverride : ""), [removeOverride, setRemoveOverride] = useState(saved.replyModelOverride === null);
  const need = new Set(p.requiresFactResolution);
  const [modes, setModes] = useState<Record<string, Mode>>(() => Object.fromEntries(p.factComparisons.map(c => {
    const s = saved.creatorFacts?.[c.key as FactKey];
    return [c.key, s === undefined ? (need.has(c.key) ? (c.proposed ? "set" : "clear") : "keep") : s === null ? "clear" : "set"] as [string, Mode]; })));
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(p.factComparisons.map(c => [c.key, (saved.creatorFacts?.[c.key as FactKey] as string | null | undefined) ?? c.proposed ?? ""])));
  const [acks, setAcks] = useState({ mixedAuthorship: false, runtimeRules: false, factsVerified: false });
  const [busy, setBusy] = useState(false);

  const factsReview = Object.fromEntries(p.factComparisons.filter(c => modes[c.key] !== "keep").map(c => [c.key, modes[c.key] === "clear" ? null : vals[c.key].trim()]));
  const review: Review = { persona: persona.trim(), ...(Object.keys(factsReview).length ? { creatorFacts: factsReview as Review["creatorFacts"] } : {}),
    ...(defaultModel.trim() ? { defaultModel: defaultModel.trim() } : {}), ...(removeOverride ? { replyModelOverride: null } : override.trim() ? { replyModelOverride: override.trim() } : {}) };
  const factsBad = p.factComparisons.some(c => modes[c.key] === "set" && (!vals[c.key].trim() || vals[c.key].length > 240));
  const unresolved = [...need].filter(k => modes[k] === "keep");
  const valid = persona.trim().length > 0 && persona.length <= 4096 && !factsBad;
  const savedMatches = JSON.stringify(saved) === JSON.stringify(review);
  const canApprove = !disabled && !busy && p.state === "draft" && savedMatches && saved.persona !== undefined && p.conflicts.length === 0 && unresolved.length === 0 && acks.mixedAuthorship && acks.runtimeRules && acks.factsVerified;

  async function post(kind: "review" | "approve") {
    setBusy(true); setNote("");
    const body = kind === "review" ? { expectedRevision: p.revision, bindingId: p.bindingId, review } : { expectedRevision: p.revision, bindingId: p.bindingId, acknowledgements: { mixedAuthorship: true, runtimeRules: true, factsVerified: true } };
    const r = await bFetch(`${base(accountId)}/${kind}`, { method: "POST", body });
    setBusy(false);
    if (r.kind === "ok" && (r.data as { outcome?: string }).outcome === "recorded") setNote(kind === "review" ? "Review saved as a new draft revision. Reloading." : "Approval recorded and applied to the saved configuration. Reloading. This does not turn on sending.");
    else if (r.kind === "ok") setNote("The answer was not understood. Reload before trying again.");
    else if (r.kind === "unconfirmed") setNote("Unknown whether this was saved. Reload to see the current state; repeating the same request is safe.");
    else if (r.kind === "refused" && r.status === 409) setNote("The personality or configuration changed since you loaded it. It was reloaded; review it again.");
    else if (r.kind === "readonly" || r.kind === "denied") setNote("Your access does not allow this change.");
    else setNote(r.kind === "unavailable" || r.kind === "refused" ? r.error : "The change was not accepted.");
    onChanged();
  }
  return <div className="space-y-4" data-personality-review>
    <div><label htmlFor="pr-persona" className="text-sm font-semibold text-ink">Tone (the persona the AI will use)</label>
      <p className="text-xs text-muted">Edit freely. Nothing here is used until you save and approve. Suggestion basis: {doc.draft.suggestedPersona.warning ?? "observed account style"}.</p>
      <textarea id="pr-persona" className={`${field} mt-1 min-h-32 p-2`} maxLength={4096} disabled={disabled || busy} value={persona} onChange={e => setPersona(e.target.value)} /></div>
    {p.factComparisons.length ? <fieldset className="space-y-2"><legend className="text-sm font-semibold text-ink">Creator facts</legend>
      {p.factComparisons.map(c => <div key={c.key} data-fact={c.key} className="rounded-lg border border-line p-2">
        <p className="text-sm font-semibold text-ink">{FACT_LABEL[c.key as FactKey] ?? c.key}{need.has(c.key) ? <span className="ml-2 text-xs font-normal text-[#9b1c31]">must be replaced or cleared</span> : null}</p>
        <p className="text-xs text-muted">Current: {c.current ?? "none"} · Proposed: {c.proposed ?? "none"}</p>
        <label className="sr-only" htmlFor={`m-${c.key}`}>Action for {c.key}</label>
        <select id={`m-${c.key}`} className={`${field} mt-1`} disabled={disabled || busy} value={modes[c.key]} onChange={e => setModes(m => ({ ...m, [c.key]: e.target.value as Mode }))}>
          <option value="keep">Keep current</option><option value="set">Use this value</option><option value="clear">Clear it</option></select>
        {modes[c.key] === "set" ? <input aria-label={`Value for ${c.key}`} className={`${field} mt-1`} maxLength={240} disabled={disabled || busy} value={vals[c.key]} onChange={e => setVals(v => ({ ...v, [c.key]: e.target.value }))} /> : null}
      </div>)}</fieldset> : null}
    <div className="grid gap-3 sm:grid-cols-2">
      <div><label htmlFor="pr-model" className="block text-xs text-muted">Default model (empty = keep)</label><input id="pr-model" className={field} maxLength={160} disabled={disabled || busy} value={defaultModel} onChange={e => setDefaultModel(e.target.value)} /></div>
      <div><label htmlFor="pr-override" className="block text-xs text-muted">Reply model override (empty = keep)</label><input id="pr-override" className={field} maxLength={160} disabled={disabled || busy || removeOverride} value={override} onChange={e => setOverride(e.target.value)} />
        <label className="mt-1 flex min-h-11 items-center gap-2 text-xs text-ink"><input type="checkbox" checked={removeOverride} disabled={disabled || busy} onChange={e => setRemoveOverride(e.target.checked)} /> Remove the override</label></div></div>
    {unresolved.length ? <p className="text-xs text-[#9b1c31]">Resolve before approval: {unresolved.join(", ")}.</p> : null}
    {p.conflicts.length ? <ul className="list-disc pl-5 text-xs text-[#9b1c31]">{p.conflicts.map(c => <li key={c.code}>{c.message}</li>)}</ul> : null}
    <button type="button" className={buttonClass} disabled={disabled || busy || !valid || savedMatches} onClick={() => void post("review")}>{busy ? "Working…" : "Save review"}</button>
    {!savedMatches && !disabled ? <p className="text-xs text-muted">Save the review before approving so the approved text is exactly what you see.</p> : null}
    {p.state === "draft" ? <fieldset className="space-y-1 border-t border-line pt-3"><legend className="text-sm font-semibold text-ink">Approve</legend>
      {([["mixedAuthorship", "I understand the history mixes the creator, staff and automation."], ["runtimeRules", "I understand platform rules and sales limits still apply at run time."], ["factsVerified", "I checked every fact above."]] as const).map(([k, t]) =>
        <label key={k} className="flex min-h-11 items-center gap-2 text-sm text-ink"><input type="checkbox" checked={acks[k]} disabled={disabled || busy} onChange={e => setAcks(a => ({ ...a, [k]: e.target.checked }))} /> {t}</label>)}
      <button type="button" className={buttonClass} disabled={!canApprove} onClick={() => void post("approve")}>Approve and apply to configuration</button>
      <p className="text-xs text-muted">Approval saves this tone and these facts to the account configuration. It does not turn on sending.</p></fieldset> : null}
  </div>;
}

function HistoryList({ accountId }: { accountId: string }) {
  const [pages, setPages] = useState<History["revisions"]>([]), [next, setNext] = useState<number | null | undefined>(undefined), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  async function load(before: number | null) {
    setBusy(true); setErr("");
    const r = await bFetch(`${base(accountId)}/history${before ? `?before=${before}` : ""}`);
    setBusy(false);
    const h = r.kind === "ok" ? parseHistory((r.data as { data?: unknown }).data) : null;
    if (!h) { setErr(r.kind === "unavailable" || r.kind === "refused" ? r.error : "History could not be read."); return; }
    setPages(p => before ? [...p, ...h.revisions] : h.revisions); setNext(h.nextBefore);
  }
  return <div className="space-y-2">
    {next === undefined ? <button type="button" className={buttonClass} disabled={busy} onClick={() => void load(null)}>Show revision history</button> : null}
    {err ? <p role="alert" className="text-xs text-[#9b1c31]">{err}</p> : null}
    {next !== undefined && !pages.length ? <p data-launch-state="empty" className="text-sm text-muted">No revisions have been recorded.</p> : null}
    {pages.length ? <ul className="space-y-1 text-sm">{pages.map(h => <li key={h.revision} data-revision={h.revision} className="rounded-lg border border-line p-2">Revision {h.revision}: {h.state} by <span className="break-all">{h.actor}</span>, {bTime(h.createdAt)}</li>)}</ul> : null}
    {next ? <button type="button" className={buttonClass} disabled={busy} onClick={() => void load(next)}>Load older revisions</button> : null}
  </div>;
}

export default function PersonalityScreen({ accountId }: { accountId: string }) {
  const parse = useRef((v: unknown) => parsePersonality(v)).current;
  const { state, reload } = useJsonResource(`${base(accountId)}`, parse);
  const access = useAccess(accountId);
  const [note, setNote] = useState(""), [busy, setBusy] = useState(false);
  const manage = access?.canManage === true;
  const p = state.kind === "ok" ? state.data : null;

  async function importDraft(cur: Personality) {
    setBusy(true); setNote("");
    const r = await bFetch(`${base(accountId)}/import`, { method: "POST", body: { expectedRevision: cur.revision, bindingId: cur.bindingId } });
    setBusy(false);
    if (r.kind === "ok" && (r.data as { outcome?: string }).outcome === "recorded") setNote("A draft was built from the chat history already stored for this account. Review it before approving. Reloading.");
    else if (r.kind === "unconfirmed") setNote("Unknown whether the import ran. Reload to see the current state; repeating the same request is safe.");
    else if (r.kind === "refused" && r.status === 409) setNote("The personality changed since you loaded it. It was reloaded.");
    else if (r.kind === "readonly" || r.kind === "denied") setNote("Your access does not allow this change.");
    else setNote(r.kind === "unavailable" || r.kind === "refused" ? r.error : "The import was not confirmed.");
    reload();
  }
  return <div className="space-y-4">
    <StateLine state={state} retry={reload} label="personality" />
    {state.kind === "unavailable" ? <Unavailable screen="Personality" error={state.error} /> : null}
    {p ? <>
      <Section title="Readiness" id="personality-readiness"><ReadinessCard p={p} /></Section>
      <Section title={p.state === "empty" ? "Import" : p.state === "draft" ? `Draft (revision ${p.revision})` : `Approved (revision ${p.revision})`} id="personality-flow">
        <p aria-live="polite" role="status" data-personality-note className="min-h-5 text-sm text-ink">{note}</p>
        {p.state === "empty" ? <>
          <p data-launch-state="empty" className="text-sm text-muted">No personality has been imported for this account. Import reads the chat history already stored here (no provider call, no model call) and proposes a tone to review.</p>
          <button type="button" className={buttonClass} disabled={!manage || busy} onClick={() => void importDraft(p)}>{busy ? "Importing…" : "Import from chat history"}</button>
          {access && !manage ? <p data-launch-state="readonly" className="text-xs text-muted">Your team access is read-only.</p> : null}</> : null}
        {p.document ? <>
          {p.state === "approved" ? <p className="text-sm text-ink">Approved{p.document.approval ? ` and applied as configuration revision ${p.document.approval.appliedConfigurationRevision}` : ""}. {p.configurationCurrent ? "The saved configuration still matches." : "The configuration changed after approval, so this is not current. Import or review again."}</p> : null}
          <details className="rounded-lg border border-line p-2"><summary className="cursor-pointer text-sm font-semibold text-ink">What the draft was built from</summary>
            <p className="mt-1 text-xs text-muted">Source: {p.document.source.replace(/_/g, " ")}. Messages examined: {String(p.document.draft.coverage.inputMessages ?? "unknown")}, sampled: {String(p.document.draft.coverage.sampledMessages ?? "unknown")}.</p>
            {Array.isArray(p.document.draft.coverage.limitations) ? <ul className="list-disc pl-5 text-xs text-muted">{(p.document.draft.coverage.limitations as unknown[]).filter((x): x is string => typeof x === "string").map(x => <li key={x}>{x}</li>)}</ul> : null}
            <p className="mt-2 text-xs font-semibold text-ink">Writing style observed</p>
            {p.document.draft.writingStyle.length ? <ul className="list-disc pl-5 text-xs text-muted">{p.document.draft.writingStyle.map((o, i) => <li key={`${o.key}-${i}`}>{o.key.replace(/_/g, " ")}: {o.value} ({o.attribution})</li>)}</ul> : <p className="text-xs text-muted">None.</p>}
            <p className="mt-2 text-xs font-semibold text-ink">Excluded sales instructions (never added to the tone)</p>
            {p.document.draft.operationalInstructions.length ? <ul className="list-disc pl-5 text-xs text-muted">{p.document.draft.operationalInstructions.map((o, i) => <li key={i}>{o.text} ({o.attribution}){o.conflicts.length ? ` - conflicts: ${o.conflicts.map(c => c.code).join(", ")}` : ""}</li>)}</ul> : <p className="text-xs text-muted">None.</p>}
            <p className="mt-2 text-xs font-semibold text-ink">Evidence excerpts (plain text)</p>
            {p.document.draft.evidence.length ? <ul className="space-y-1 text-xs text-muted">{p.document.draft.evidence.map(e => <li key={e.id} className="break-words">{e.author}: {e.excerpt}{e.truncated ? " [shortened]" : ""}</li>)}</ul> : <p className="text-xs text-muted">None.</p>}
          </details>
          <ReviewForm key={`${accountId}-${p.revision}`} p={p} accountId={accountId} onChanged={reload} setNote={setNote} disabled={!manage} />
          {access && !manage ? <p data-launch-state="readonly" className="text-xs text-muted">Your team access is read-only, so the review is view-only.</p> : null}
          {manage && p.state === "approved" ? <button type="button" className={buttonClass} disabled={busy} onClick={() => void importDraft(p)}>Import a fresh draft from history</button> : null}</> : null}
      </Section>
      <Section title="Revision history" id="personality-history"><HistoryList key={`${accountId}-${p.revision}`} accountId={accountId} /></Section></> : null}
    <Section title="Budget, sales switch and other settings" id="live-config">
      <p className="text-xs text-muted">The existing configuration editor. Credentials stay on the server; none is shown here.</p>
      {access && !manage ? <p data-launch-state="readonly" className="text-xs text-muted">Your team access is read-only, so the editor is hidden.</p> : <ConfigurationEditor key={accountId} accountId={accountId} />}
    </Section>
  </div>;
}
