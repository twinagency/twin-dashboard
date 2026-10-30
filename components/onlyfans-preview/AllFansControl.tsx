"use client";
import { useEffect, useRef, useState } from "react";
import type { OnlyFansDataSource } from "@/lib/onlyfans-preview/data-source";
import type { OfAccount, PreviewViewer } from "@/lib/onlyfans-preview/types";
import { parseConfiguration, parseConfigurationAck, type ConfigurationRequest } from "@/lib/onlyfans/configuration";
import { object, parseNativeReadiness } from "@/lib/onlyfans/launch/native";
import { enableExistingFanChats, disableExistingFanChats, type BulkProgress } from "@/lib/onlyfans/bulk-ai";

import { BULK_REASONS } from "@/lib/onlyfans/bulk-controls";

export default function AllFansControl({ account, viewer, source, onChanged }: {
  account: OfAccount; viewer: PreviewViewer; source: OnlyFansDataSource; onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [progress, setProgress] = useState<BulkProgress | null>(null);
  const lock = useRef(false), stopped = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; stopped.current = false; return () => { stopped.current = true; mounted.current = false; }; }, []);
  const accountId = account.accountId;
  const configurationUrl = `/api/onlyfans-configuration/accounts/${encodeURIComponent(accountId)}`;
  const controlUrl = `/api/onlyfans-launch/automation/accounts/${encodeURIComponent(accountId)}/emergency-stop`;
  async function request(url: string, body?: unknown) {
    if (stopped.current) throw Error("Stopped. Changes already recorded remain in place.");
    const response = await fetch(url, { credentials: "same-origin", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30_000),
      ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
    if (!response.ok) throw Error("The change could not be confirmed. Refresh the inbox and check current settings.");
    return response.json() as Promise<unknown>;
  }
  async function readControl() {
    const body = await request(controlUrl);
    const value = object(body) && body.schemaVersion === "of-launch-b.v1" && body.ok === true && body.accountId === accountId
      ? parseNativeReadiness(body.readiness) : null;
    if (!value) throw Error("Current account controls could not be verified. Refresh and try again.");
    return value;
  }
  async function changeAccount(action: "pause" | "resume") {
    const state = await readControl();
    if (action === "resume" && !state.readyToEnable) throw Error("This account needs attention before AI can resume. Open account readiness in Settings.");
    const body = await request(controlUrl, { action, expectedFingerprint: state.accountControl.fingerprint,
      reason: action === "pause" ? "Paused AI from the inbox account controls" : "Enabled eligible existing conversations from the inbox" });
    if (!object(body) || body.schemaVersion !== "of-launch-b.v1" || body.ok !== true || body.accountId !== accountId ||
        !object(body.command) || body.command.recorded !== true) throw Error("Account change unconfirmed. Refresh before trying again.");
  }
  async function run(action: "enable" | "disable" | "pause") {
    if (lock.current || !viewer.canManage) return;
    lock.current = true; stopped.current = false; setBusy(true); setProgress(null); setNotice("Checking current account settings...");
    try {
      if (action === "pause") {
        await changeAccount("pause");
        if (!stopped.current) setNotice("Account paused. Messages already being sent may still complete.");
      } else {
        if (action === "enable") {
          const config = parseConfiguration(await request(configurationUrl), accountId);
          const state = await readControl();
          if (!config?.activation) throw Error("Could not verify this creator's AI settings. Refresh and try again.");
          if (!config.activation.allFansAllowed) throw Error("All-chat AI is not configured for this creator. Review its AI settings.");
          if (!config.activation.selectionValid) throw Error("This creator's saved chat selection needs correction in AI settings.");
          if (!config.activation.modelCredentialReady) throw Error("This creator needs a verified AI model connection before replies can be enabled.");
          if (!state.autonomy.deliveryEnabled)
            throw Error("Enable outgoing messages in account settings first.");
          if (!state.accountControl.enabled && !state.readyToEnable)
            throw Error("This account needs attention before AI can resume. Review account readiness first.");
          if (config.activation.selection?.mode !== "all") {
            const command: ConfigurationRequest = { expectedRevision: config.configurationRevision, expectedFingerprint: config.fingerprint,
              patch: { fasttScope: { mode: "all", fans: [] } } };
            if (!parseConfigurationAck(await request(configurationUrl, command), { ...command, accountId }))
              throw Error("All-fan setting unconfirmed. Refresh before continuing.");
          }
          if (!state.accountControl.enabled) await changeAccount("resume");
        }
        const change = action === "enable" ? enableExistingFanChats : disableExistingFanChats;
        const result = await change({ account, viewer, source, cancelled: () => stopped.current,
          submitBatch: body => request(`/api/onlyfans-controls/accounts/${encodeURIComponent(accountId)}/bulk`, body),
          progress: value => { if (mounted.current) setProgress(value); } });
        if (mounted.current) setNotice(`Finished: ${result.enabled} enabled, ${result.disabled} disabled, ${result.alreadyOn + result.alreadyOff} already in that state, ${result.protected} skipped.`);

      }
    } catch (error) {
      if (mounted.current) setNotice(error instanceof Error ? error.message : "Stopped. Refresh to check which changes were recorded.");
    } finally {
      lock.current = false;
      if (mounted.current) { setBusy(false); onChanged(); }
    }
  }
  return <section className="mb-3 rounded-xl border border-line bg-white px-3 py-2" aria-label="Account AI controls" data-of-all-fans-controls>
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-auto text-sm font-semibold">{account.binding.creatorName}: AI replies</span>
      <button type="button" className="min-h-10 rounded-lg bg-[#1764c0] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        disabled={busy || !viewer.canManage} onClick={() => void run("enable")}
        title="Enable existing paused chats. Human takeovers, individual-review holds and no-contact fans remain protected.">Enable AI replies for existing chats</button>
      <button type="button" className="min-h-10 rounded-lg border border-line px-3 py-2 text-sm font-semibold disabled:opacity-50"
        disabled={busy || !viewer.canManage} onClick={() => void run("disable")}>Disable AI replies for existing chats</button>
      <button type="button" className="min-h-10 rounded-lg border border-line px-3 py-2 text-sm font-semibold disabled:opacity-50"
        disabled={busy || !viewer.canManage} onClick={() => { if (window.confirm("Pause all outgoing activity for " + account.binding.creatorName + "? Queued sends will be cancelled and scheduled campaigns paused. Messages already being sent may finish.")) void run("pause"); }}>Pause entire account</button>
      {busy ? <button type="button" className="text-sm underline" onClick={() => { stopped.current = true; setNotice("Stopping after the current batch. Confirmed changes remain saved."); }}>Stop changes</button> : null}
    </div>
    <p className="mt-2 text-xs text-muted">New fans stay off until individually enabled. Human takeovers and no-contact restrictions are preserved. Disabling AI keeps manual replies available.</p>
    {notice ? <p role="status" className="mt-2 text-xs">{notice}</p> : null}
    {progress ? <p className="mt-1 text-xs">{progress.phase === "discovering" ? `Finding existing chats: ${progress.discovered} found.` : `Checked ${progress.checked} of ${progress.discovered}. Enabled ${progress.enabled}; disabled ${progress.disabled}; skipped ${progress.protected}.`}</p> : null}
    {progress && Object.keys(progress.reasons).length ? <ul className="mt-1 text-xs">{Object.entries(progress.reasons).map(([reason, count]) => <li key={reason}>{BULK_REASONS[reason] ?? "Skipped"}: {count}</li>)}</ul> : null}
  </section>;
}
