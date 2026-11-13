"use client";
import { useEffect, useRef, useState } from "react";
import type { OnlyFansDataSource } from "@/lib/onlyfans-preview/data-source";
import type { OfAccount, PreviewViewer } from "@/lib/onlyfans-preview/types";
import { parseConfiguration, parseConfigurationAck, type ConfigurationRequest } from "@/lib/onlyfans/configuration";
import { object, parseNativeReadiness } from "@/lib/onlyfans/launch/native";
import { enableExistingFanChats, type BulkProgress } from "@/lib/onlyfans/bulk-ai";

const HELD = "Enable is off: the last pause was not confirmed. Pause again before enabling AI.";

export default function AllFansControl({ account, viewer, source, onChanged }: {
  account: OfAccount; viewer: PreviewViewer; source: OnlyFansDataSource; onChanged: () => void;
}) {
  const [notice, setNotice] = useState(""), [progress, setProgress] = useState<BulkProgress | null>(null);
  // A pause that was not confirmed holds the go until a pause is confirmed: a STOP whose outcome is unknown never re-arms enable.
  const [pauseUnconfirmed, setPauseUnconfirmed] = useState(false);
  // One AbortController per operation. Pause, Stop and unmount abort the enable's. The pause's is never aborted: a STOP outlives
  // the component and only stops painting after unmount. An op whose controller is no longer current neither paints nor clears
  // the lock, so a hung request never holds the next one.
  const mounted = useRef(true);
  const op = useRef<Record<"enable" | "pause", AbortController | null>>({ enable: null, pause: null });
  const [current, setCurrent] = useState(op.current), busy = current.enable !== null, pausing = current.pause !== null;
  const set = (kind: "enable" | "pause", value: AbortController | null) => { op.current = { ...op.current, [kind]: value }; if (mounted.current) setCurrent(op.current); };
  const end = (kind: "enable" | "pause", controller: AbortController) => { const mine = op.current[kind] === controller; if (mine) set(kind, null); return mine; };
  const stopEnable = () => { op.current.enable?.abort(); set("enable", null); };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; op.current.enable?.abort(); op.current = { ...op.current, enable: null }; }; }, []);
  const accountId = account.accountId;
  const configurationUrl = `/api/onlyfans-configuration/accounts/${encodeURIComponent(accountId)}`;
  const controlUrl = `/api/onlyfans-launch/automation/accounts/${encodeURIComponent(accountId)}/emergency-stop`;
  async function request(url: string, signal: AbortSignal, body?: unknown) {
    const response = await fetch(url, { credentials: "same-origin", cache: "no-store", redirect: "error", signal,
      ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
    if (!response.ok) throw Error("The change could not be confirmed. Refresh the inbox and check current settings.");
    return response.json() as Promise<unknown>;
  }
  async function readControl(signal: AbortSignal) {
    const body = await request(controlUrl, signal);
    const value = object(body) && body.schemaVersion === "of-launch-b.v1" && body.ok === true && body.accountId === accountId
      ? parseNativeReadiness(body.readiness) : null;
    if (!value) throw Error("Current account controls could not be verified. Refresh and try again.");
    return value;
  }
  async function changeAccount(action: "pause" | "resume", signal: AbortSignal) {
    const state = await readControl(signal);
    if (action === "resume" && !state.readyToEnable) throw Error("This account needs attention before AI can resume. Open account readiness in Settings.");
    const body = await request(controlUrl, signal, { action, expectedFingerprint: state.accountControl.fingerprint,
      reason: action === "pause" ? "Paused AI from the inbox account controls" : "Enabled eligible existing conversations from the inbox" });
    if (!object(body) || body.schemaVersion !== "of-launch-b.v1" || body.ok !== true || body.accountId !== accountId ||
        !object(body.command) || body.command.recorded !== true) throw Error("Account change unconfirmed. Refresh before trying again.");
  }
  async function pause() {
    if (op.current.pause || !viewer.canManage) return;
    const controller = new AbortController(), { signal } = controller;
    stopEnable(); set("pause", controller); setPauseUnconfirmed(true); setNotice("Pausing account...");
    try {
      await changeAccount("pause", signal);
      if (mounted.current) { setPauseUnconfirmed(false); setNotice("Account paused. Messages already being sent may still complete."); }
    } catch (error) {
      if (mounted.current) setNotice(error instanceof Error ? error.message : "Pause unconfirmed. Pause again.");
    } finally { if (end("pause", controller) && mounted.current) onChanged(); }
  }
  async function run() {
    if (op.current.enable || !viewer.canManage) return;
    const controller = new AbortController(), { signal } = controller;
    set("enable", controller); setProgress(null); setNotice("Checking current account settings...");
    try {
      const config = parseConfiguration(await request(configurationUrl, signal), accountId);
      const state = await readControl(signal);
      if (!config?.activation?.allFansAllowed || !config.activation.selectionValid || !config.activation.modelCredentialReady)
        throw Error("This account is not ready for eligible existing chats. Review its AI settings first.");
      if (!state.autonomy.deliveryEnabled)
        throw Error("Enable outgoing messages in account settings first.");
      if (!state.accountControl.enabled && !state.readyToEnable)
        throw Error("This account needs attention before AI can resume. Review account readiness first.");
      if (config.activation.selection?.mode !== "all") {
        const command: ConfigurationRequest = { expectedRevision: config.configurationRevision, expectedFingerprint: config.fingerprint,
          patch: { fasttScope: { mode: "all", fans: [] } } };
        if (!parseConfigurationAck(await request(configurationUrl, signal, command), { ...command, accountId }))
          throw Error("All-fan setting unconfirmed. Refresh before continuing.");
      }
      if (!state.accountControl.enabled) await changeAccount("resume", signal);
      const result = await enableExistingFanChats({ account, viewer, source, cancelled: () => signal.aborted,
        progress: value => { if (!signal.aborted) setProgress(value); } });
      if (!signal.aborted) setNotice(`Finished: ${result.enabled} chats enabled, ${result.alreadyOn} already enabled, ${result.protected} protected chats kept as they were. New conversations stay off until you enable each fan individually.`);
    } catch (error) {
      if (!signal.aborted) setNotice(error instanceof Error ? error.message : "Stopped. Refresh to check which changes were recorded.");
    } finally { if (end("enable", controller)) onChanged(); }
  }
  return <section className="mb-3 rounded-xl border border-line bg-white px-3 py-2" aria-label="Account AI controls" data-of-all-fans-controls>
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-auto text-sm font-semibold">{account.binding.creatorName}: AI replies</span>
      <button type="button" className="min-h-10 rounded-lg bg-[#1764c0] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        disabled={busy || pauseUnconfirmed || !viewer.canManage} onClick={() => void run()}
        title={pauseUnconfirmed ? HELD : "Enable AI replies for existing chats and use all-fan scope. Manually paused chats, human takeovers and no-contact fans stay protected."}>Enable AI replies for existing chats</button>
      <button type="button" className="min-h-10 rounded-lg border border-line px-3 py-2 text-sm font-semibold disabled:opacity-50"
        disabled={pausing || !viewer.canManage} onClick={() => { if (window.confirm("Pause all outgoing activity for " + account.binding.creatorName + "? Queued sends will be cancelled and scheduled campaigns paused. Messages already being sent may finish.")) void pause(); }}>Pause account</button>
      {busy ? <button type="button" className="text-sm underline" onClick={() => { stopEnable(); setNotice("Stopped. Refresh to check which changes were recorded."); onChanged(); }}>Stop changes</button> : null}
    </div>
    <p className="mt-2 text-xs text-muted">New fans stay off until individually enabled. Human takeovers, paused and no-contact conversations stay protected.</p>
    {notice || pauseUnconfirmed && !pausing ? <p role="status" className="mt-2 text-xs">{[notice, pauseUnconfirmed && !pausing ? HELD : ""].filter(Boolean).join(" ")}</p> : null}
    {busy && progress ? <p className="mt-1 text-xs">Checked {progress.checked} chats. Enabled {progress.enabled}.</p> : null}
  </section>;
}
