"use client";
// AI chatting status and activation for one OnlyFans account: what works, what does not and why, and the few
// administrator steps that turn it on. Everything shown comes from the backend; nothing is inferred here.
import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { STAGE_NAMES, STAGE_TITLES, RESULT_SKIP_TEXT, SKIP_TEXT, blockerText, type ActivationStatus, type Stage } from "@/lib/onlyfans/activation-status";
import { enableExistingChats, postActivation, readActivation, type EnableProgress } from "@/lib/onlyfans/activation-client";

const DOT: Record<Stage["state"], string> = { ok: "bg-[#1f9d55]", warn: "bg-[#d99a1c]", blocked: "bg-[#d64545]", unknown: "bg-[#8a94a6]" };
const WORD: Record<Stage["state"], string> = { ok: "OK", warn: "Check", blocked: "Not ready", unknown: "Unknown" };
const ACTION_HINT: Record<string, string> = {
  connect: "Use Add OnlyFans account or Reconnect for this creator.", settings: "Open creator settings.", model_credential: "Save this account's own model key below.",
  activate: "Use Activate account below.", limits: "Raise the total allowance below.", enable_existing: "Use Enable AI replies for existing chats below.",
  content: "Approve at least one fixed-price paid item in the vault.", support: "Ask the Twin team.",
};
const button = "min-h-9 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-50";
const primary = "min-h-9 rounded-lg bg-[#1764c0] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50";
const input = "mt-1 block w-full rounded-lg border border-line px-2 py-1.5 text-xs";

export default function ActivationPanel({ accountId, creatorName, onChanged, initial }: { accountId: string; creatorName: string; onChanged?: () => void; initial?: { status: ActivationStatus; canManage: boolean } }) {
  const [status, setStatus] = useState<ActivationStatus | null>(initial?.status ?? null), [canManage, setCanManage] = useState(initial?.canManage ?? false);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<EnableProgress | null>(null);
  const [limit, setLimit] = useState(""), [throttle, setThrottle] = useState(""), [media, setMedia] = useState(false);
  const [modelId, setModelId] = useState(""), [apiKey, setApiKey] = useState("");
  const lock = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const load = useCallback(async () => {
    const result = await readActivation(accountId);
    if (!alive.current) return;
    if (!result.ok) { setError(result.error); return; }
    setError(""); setStatus(result.status); setCanManage(result.canManage);
    setLimit(v => v || String(Math.max(result.status.allowance.limitUnits, 1)));
    setThrottle(v => v || String(result.status.allowance.throttleSeconds ?? 30));
    setMedia(m => result.status.allowance.state === "none" ? m : result.status.allowance.mediaEnabled);
    setModelId(v => v || (result.status.stages.model.modelId ?? ""));
  }, [accountId]);
  useEffect(() => { void load(); }, [load]);

  async function run(label: string, work: () => Promise<string>) {
    if (lock.current || !canManage) return;
    lock.current = true; setBusy(true); setNotice(label + "...");
    try { const done = await work(); if (alive.current) setNotice(done); }
    catch (e) { if (alive.current) setNotice(e instanceof Error ? e.message : "The change was not confirmed. Refresh the status."); }
    finally { lock.current = false; if (alive.current) { setBusy(false); setProgress(null); await load(); onChanged?.(); } }
  }
  function fail(reply: { error: string; blockers: string[] }): never { throw Error(reply.blockers.length ? `${reply.error} ${reply.blockers.map(blockerText).join(" ")}` : reply.error); }
  const connectionRevision = status?.stages.connection.revision ?? 0;

  const activate = () => run("Activating the account", async () => {
    const reply = await postActivation(accountId, "activate", { expectedRevision: connectionRevision, limitUnits: Number(limit), throttleSeconds: Number(throttle), mediaEnabled: media });
    if (!reply.ok) fail(reply);
    return "Account activated. No conversation is enabled yet.";
  });
  const saveLimits = () => run("Saving limits", async () => {
    const reply = await postActivation(accountId, "operating-limits", { expectedFingerprint: status!.fingerprint, limitUnits: Number(limit), throttleSeconds: Number(throttle), mediaEnabled: media });
    if (!reply.ok) fail(reply);
    return "Limits saved. Used sends were kept.";
  });
  const saveKey = () => run("Saving the model key", async () => {
    const reply = await postActivation(accountId, "model-credential", { modelId: modelId.trim(), apiKey: apiKey.trim(), expectedRevision: connectionRevision });
    setApiKey("");
    if (!reply.ok) fail(reply);
    return "Model key saved for this account only. It takes effect when the sender next starts.";
  });
  const checkKey = () => run("Checking the model key", async () => {
    const reply = await postActivation(accountId, "model-check", {});
    if (!reply.ok) fail(reply);
    const state = String(reply.command.state);
    return ({ usable: "The key is accepted by the provider.", rejected: "The provider rejected this key.", no_credit: "The key has no credit left.", unsupported: "This provider has no key check. Test by sending a reply.", missing: "No model key is saved for this account.", unavailable: "The provider could not be reached. Try again." } as Record<string, string>)[state] ?? "The check was inconclusive.";
  });
  const setFuture = (enabled: boolean) => run(enabled ? "Turning on future conversations" : "Turning off future conversations", async () => {
    const reply = await postActivation(accountId, "future-conversations", { expectedFingerprint: status!.fingerprint, enabled });
    if (!reply.ok) fail(reply);
    return enabled ? "New conversations that start from now on will get AI replies." : "New conversations will wait for you to enable them.";
  });
  const enableAll = () => run("Enabling existing chats", async () => {
    const result = await enableExistingChats({ accountId, fingerprint: status!.fingerprint, progress: value => { if (alive.current) setProgress(value); } });
    const skipped = Object.entries(result.skipped).map(([k, n]) => `${n} ${RESULT_SKIP_TEXT[k] ?? k}`).join(", ");
    return `Finished: ${result.enabled} chats enabled out of ${result.checked} checked${skipped ? `. Skipped: ${skipped}` : ""}. Human takeovers, no-contact and paused chats were kept.`;
  });

  if (!status) return <Card className="mt-3 p-3 text-xs" data-of-activation-panel={accountId}>{error || "Loading AI chatting status..."}{error ? <button type="button" className={`${button} ml-2`} onClick={() => void load()}>Retry</button> : null}</Card>;
  const bulk = status.bulkEnable, counts = bulk.counts, c = status.conversations;
  const kept = Object.entries(SKIP_TEXT).filter(([k]) => k !== "outsideScope" || counts.outsideScope).map(([k, label]) => [label, (counts as Record<string, number>)[k]] as const).filter(([, n]) => n > 0);
  return <Card className="mt-3 min-w-0 p-3" data-of-activation-panel={accountId} onClick={event => event.stopPropagation()}>
    <div className="flex flex-wrap items-center gap-2"><h3 className="mr-auto text-sm font-semibold">{creatorName}: AI chatting status</h3>
      <button type="button" className={button} disabled={busy} onClick={() => void load()}>Refresh</button></div>
    <ol className="mt-2 space-y-2" data-of-activation-stages>
      {STAGE_NAMES.map(name => { const st = status.stages[name]; return <li key={name} data-of-stage={name} data-of-stage-state={st.state} className="flex items-start gap-2 text-xs">
        <span aria-hidden className={`mt-1 size-2.5 shrink-0 rounded-full ${DOT[st.state]}`} />
        <span className="min-w-0"><span className="font-semibold">{STAGE_TITLES[name]}</span>: {WORD[st.state]}
          {st.reason ? <span className="block text-muted" data-of-stage-reason>{st.reason}{st.action && ACTION_HINT[st.action] ? " " + ACTION_HINT[st.action] : ""}</span> : null}</span></li>; })}
    </ol>
    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs" data-of-activation-facts>
      <dt className="text-muted" title="Total sends this account may make, including the ones already used. Used sends are never reset.">Send allowance</dt>
      <dd>{status.allowance.usedUnits} of {status.allowance.limitUnits} used{status.allowance.state === "exhausted" ? " (used up)" : ""}</dd>
      <dt className="text-muted">Model budget today</dt>
      <dd>{status.budget.dailyCostCapCents === null ? "not set" : `${(status.budget.spentTodayUnits / 100).toFixed(1)} of ${status.budget.dailyCostCapCents} cents`}{status.budget.state === "exhausted" ? " (spent)" : ""}</dd>
      <dt className="text-muted">Chats enabled</dt><dd>{c.enabledNow} of {c.total}</dd>
      <dt className="text-muted">Human takeover</dt><dd>{c.humanControlled}{c.takeoverRequested ? ` (${c.takeoverRequested} requested)` : ""}</dd>
      <dt className="text-muted">No-contact</dt><dd>{c.noContact}</dd>
      <dt className="text-muted" title="Chats the AI paused because the fan asked for a person. A team member should answer them.">Asked for a person</dt>
      <dd data-of-needs-person>{status.escalations.needsPerson}</dd>
    </dl>
    {status.warnings.length ? <ul className="mt-2 space-y-1 text-xs text-[#8a5f06]" data-of-activation-warnings>{status.warnings.map(w => <li key={w.code}>{w.text}</li>)}</ul> : null}
    {status.escalations.needsPerson ? <p className="mt-2 text-xs" data-of-escalation-note>{status.escalations.needsPerson} chat{status.escalations.needsPerson === 1 ? "" : "s"} waiting for a person. Open the inbox and choose Human handling.</p> : null}
    {canManage ? <div className="mt-3 space-y-3 border-t border-line pt-3">
      <details data-of-model-key><summary className="cursor-pointer text-xs font-semibold">Model key for {creatorName}</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="text-xs">Model ID<input className={input} value={modelId} onChange={e => setModelId(e.target.value)} disabled={busy} /></label>
          <label className="text-xs">This account's own API key<input className={input} type="password" autoComplete="new-password" value={apiKey} onChange={e => setApiKey(e.target.value)} disabled={busy} /></label>
        </div>
        <div className="mt-2 flex flex-wrap gap-2"><button type="button" className={button} disabled={busy || !modelId.trim() || apiKey.trim().length < 8} onClick={() => void saveKey()}>Save key</button>
          <button type="button" className={button} disabled={busy} onClick={() => void checkKey()} title="Asks the provider whether the saved key is valid and has credit. It does not send any message.">Check saved key</button></div>
      </details>
      <details open={!status.activated} data-of-limits><summary className="cursor-pointer text-xs font-semibold">{status.activated ? "Operating limits" : "Activate account"}</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <label className="text-xs" title="Total sends including the ones already used.">Total send allowance<input className={input} type="number" min={Math.max(1, status.allowance.usedUnits)} max={10000} value={limit} onChange={e => setLimit(e.target.value)} disabled={busy} /></label>
          <label className="text-xs">Seconds between sends<input className={input} type="number" min={1} max={86400} value={throttle} onChange={e => setThrottle(e.target.value)} disabled={busy} /></label>
          <label className="flex items-end gap-2 pb-1.5 text-xs"><input type="checkbox" checked={media} onChange={e => setMedia(e.target.checked)} disabled={busy} />Allow paid media sends</label>
        </div>
        <div className="mt-2">{status.activated
          ? <button type="button" className={button} disabled={busy || Number(limit) < status.allowance.usedUnits || !Number(limit) || !Number(throttle)} onClick={() => void saveLimits()}>Save limits</button>
          : <button type="button" className={primary} disabled={busy || !Number(limit) || !Number(throttle)} onClick={() => void activate()} title="Turns outgoing on for this account only, within these limits. No chat is enabled by it.">Activate account</button>}</div>
      </details>
      <div data-of-enable-existing>
        <button type="button" className={primary} disabled={busy || !status.activated || bulk.blockers.length > 0 || counts.wouldEnable === 0} onClick={() => { if (window.confirm(`Enable AI replies for ${counts.wouldEnable} existing chats of ${creatorName}? Human takeovers, no-contact, paused and restricted chats stay as they are.`)) void enableAll(); }}>Enable AI replies for existing chats</button>
        <p className="mt-1 text-xs" data-of-enable-preview>{bulk.blockers.length ? `Not ready: ${bulk.blockers.map(blockerText).join(" ")}` : `Would enable ${counts.wouldEnable} of ${counts.total} chats${kept.length ? `. Kept as they are: ${kept.map(([l, n]) => `${n} ${l}`).join(", ")}` : ""}.`}</p>
      </div>
      <label className="flex items-start gap-2 text-xs" title="Off by default. When on, a person who starts a brand new conversation after you turn it on gets AI replies without a manual step. Existing chats are not touched.">
        <input type="checkbox" data-of-future-conversations checked={status.futureConversations.enabled} disabled={busy || !status.activated} onChange={e => void setFuture(e.target.checked)} />
        <span>Also reply to new conversations that start from now on{status.futureConversations.enabled && status.futureConversations.startsAt ? ` (on since ${new Date(status.futureConversations.startsAt).toLocaleString()})` : " (off)"}</span></label>
    </div> : <p className="mt-3 text-xs text-muted">Your team access is read-only. A manager can change activation settings.</p>}
    {busy && progress ? <p className="mt-2 text-xs" role="status">Checked {progress.checked} chats. Enabled {progress.enabled}.</p> : null}
    {notice ? <p role="status" className="mt-2 text-xs" data-of-activation-notice>{notice}</p> : null}
  </Card>;
}
