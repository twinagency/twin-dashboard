"use client";
import { useState } from "react";
import ConfigurationEditor from "@/components/onlyfans-preview/ConfigurationEditor";
import { FIXTURES } from "@/lib/onlyfans/launch/a-fixtures";
import { parsePersonality, type PersonalityDraft, type PersonalitySettings } from "@/lib/onlyfans/launch/a-types";
import { FixtureBanner, Pending, Section, StateLine, buttonClass, postCommand, useCanManage, useLaunchResource, type Post } from "../a-shared";

const field = "min-h-11 w-full rounded-lg border border-line bg-white px-2 text-sm disabled:opacity-60";

function Draft({ d, accountId, enabled, onChanged }: { d: PersonalityDraft; accountId: string; enabled: boolean; onChanged: () => void }) {
  const [text, setText] = useState(d.edited ?? d.imported), [busy, setBusy] = useState(false), [res, setRes] = useState<Post | null>(null);
  const changed = text !== (d.edited ?? d.imported);
  async function save() {
    if (busy) return; setBusy(true); setRes(null);
    const r = await postCommand(accountId, { path: "personality/draft", id: d.id, body: { expectedRevision: d.revision, edited: text } });
    setRes(r); setBusy(false); if (r.ok) onChanged();
  }
  return <li data-draft={d.id} className="rounded-lg border border-line p-3">
    <label htmlFor={`d-${d.id}`} className="text-sm font-semibold text-ink">{d.field} <span className="font-normal text-muted">(imported from {d.source})</span></label>
    <textarea id={`d-${d.id}`} className={`${field} mt-1 min-h-24 p-2`} maxLength={4096} disabled={!enabled || busy} value={text} onChange={e => setText(e.target.value)} />
    <div className="mt-1 flex flex-wrap items-center gap-2"><button type="button" className={buttonClass} disabled={!enabled || !changed || !text.trim() || busy} onClick={save}>Save edit</button>
      {changed ? <button type="button" className={buttonClass} onClick={() => setText(d.edited ?? d.imported)}>Revert</button> : null}
      <span className="text-xs text-muted">{d.approved ? "Approved" : "Not approved"}</span></div>
    {res ? <p role="status" className="mt-1 text-xs text-ink">{res.ok ? "Saved. Refreshing." : res.error}</p> : null}
  </li>;
}

function Settings({ s, accountId, enabled, onChanged }: { s: PersonalitySettings; accountId: string; enabled: boolean; onChanged: () => void }) {
  const [model, setModel] = useState(s.model ?? ""), [budget, setBudget] = useState(String(s.dailyBudgetCents ?? 0)), [rate, setRate] = useState(String(s.behaviour.maxRepliesPerHour ?? 0)), [sales, setSales] = useState(s.behaviour.allowSales === true);
  const [busy, setBusy] = useState(false), [res, setRes] = useState<Post | null>(null), [confirm, setConfirm] = useState(false);
  const b = Number(budget), r = Number(rate);
  const valid = model.trim() !== "" && Number.isInteger(b) && b >= 0 && b <= 1_000_000 && Number.isInteger(r) && r >= 0 && r <= 1000;
  async function run(command: unknown) {
    if (busy) return; setBusy(true); setRes(null);
    const out = await postCommand(accountId, command); setRes(out); setBusy(false); if (out.ok) { setConfirm(false); onChanged(); }
  }
  return <div className="space-y-3">
    <div><label htmlFor="m" className="block text-xs text-muted">Model</label><input id="m" className={field} value={model} disabled={!enabled || busy} onChange={e => setModel(e.target.value)} maxLength={160} /></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <div><label htmlFor="b" className="block text-xs text-muted">Daily budget (cents)</label><input id="b" inputMode="numeric" className={field} value={budget} disabled={!enabled || busy} onChange={e => setBudget(e.target.value)} /></div>
      <div><label htmlFor="r" className="block text-xs text-muted">Max replies per hour</label><input id="r" inputMode="numeric" className={field} value={rate} disabled={!enabled || busy} onChange={e => setRate(e.target.value)} /></div></div>
    <label className="flex min-h-11 items-center gap-2 text-sm text-ink"><input type="checkbox" checked={sales} disabled={!enabled || busy} onChange={e => setSales(e.target.checked)} /> Allow sales offers</label>
    {!valid ? <p className="text-xs text-[#9b1c31]">Enter a model, a whole-number budget and a whole-number rate.</p> : null}
    <button type="button" className={buttonClass} disabled={!enabled || !valid || busy}
      onClick={() => run({ path: "personality/settings", id: null, body: { expectedRevision: s.configRevision, model: model.trim(), dailyBudgetCents: b, maxRepliesPerHour: r, allowSales: sales } })}>Save settings</button>
    <div className="border-t border-line pt-3">
      <p className="text-xs text-muted">Approval states that the drafts and settings above are reviewed. It does not turn on sending.</p>
      {!confirm ? <button type="button" className={`${buttonClass} mt-2`} disabled={!enabled || busy || s.configApproved} onClick={() => setConfirm(true)}>{s.configApproved ? "Configuration approved" : "Approve configuration"}</button>
        : <div role="alertdialog" aria-label="Confirm approval" className="mt-2 flex flex-wrap items-center gap-2"><span className="text-sm text-ink">Approve revision {s.configRevision}?</span>
          <button type="button" autoFocus className={buttonClass} disabled={busy} onClick={() => run({ path: "personality/approve", id: null, body: { expectedRevision: s.configRevision } })}>Yes, approve</button>
          <button type="button" className={buttonClass} onClick={() => setConfirm(false)}>Cancel</button></div>}
    </div>
    {res ? <p role="status" className="text-xs text-ink">{res.ok ? "Saved. Refreshing." : res.error}</p> : null}
  </div>;
}

export default function PersonalityScreen({ accountId }: { accountId: string }) {
  const [fixture, setFixture] = useState(false);
  const { state, reload } = useLaunchResource(accountId, "personality", parsePersonality);
  const canManage = useCanManage(accountId);
  const live = state.kind === "ok";
  const data = live ? state.data : state.kind === "pending" && fixture ? FIXTURES.personality : null;
  return <div className="space-y-4">
    <Section title="Persona, facts, model and sales switch (connected)" id="live-config">
      <p className="text-xs text-muted">This is the existing configuration editor on the real contract. Credentials stay on the server; none is shown here.</p>
      {canManage === false ? <p data-launch-state="readonly" className="text-xs text-muted">Your team access is read-only, so the editor is hidden.</p> : <ConfigurationEditor key={accountId} accountId={accountId} />}
    </Section>
    <StateLine state={state} retry={reload} label="personality drafts" />
    {state.kind === "pending" && !fixture ? <Pending screen="Imported drafts, approval, budget and behaviour" error={state.error} onFixture={() => setFixture(true)}><p className="mt-2 text-xs text-muted">Needs the Chat 3 personality contract.</p></Pending> : null}
    {data ? <>
      {!live ? <FixtureBanner what="Imported drafts, approval, model, budget and behaviour sample." /> : null}
      <Section title="Imported personality drafts" id="drafts">
        {data.drafts.length ? <ul className="space-y-3">{data.drafts.map(d => <Draft key={`${accountId}-${d.id}-${d.revision}`} d={d} accountId={accountId} enabled={live && canManage === true} onChanged={reload} />)}</ul>
          : <p data-launch-state="empty" className="text-sm text-muted">No imported drafts. History import has not produced a personality draft for this account.</p>}</Section>
      <Section title="Model, budget, behaviour and approval" id="settings">
        <Settings key={`${accountId}-${data.configRevision}`} s={data} accountId={accountId} enabled={live && canManage === true} onChanged={reload} />
        {live && canManage === false ? <p data-launch-state="readonly" className="text-xs text-muted">Your team access is read-only.</p> : null}</Section></> : null}
  </div>;
}
