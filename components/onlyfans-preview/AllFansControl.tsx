"use client";
import { useEffect, useRef, useState } from "react";
import type { OnlyFansDataSource } from "@/lib/onlyfans-preview/data-source";
import type { OfAccount, PreviewViewer } from "@/lib/onlyfans-preview/types";
import { parseConfiguration, parseConfigurationAck, type ConfigurationRequest } from "@/lib/onlyfans/configuration";
import { object, parseNativeReadiness } from "@/lib/onlyfans/launch/native";
import { enableExistingFanChats, type BulkProgress } from "@/lib/onlyfans/bulk-ai";

export default function AllFansControl({ account, viewer, source, onChanged }: {
  account: OfAccount; viewer: PreviewViewer; source: OnlyFansDataSource; onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [progress, setProgress] = useState<BulkProgress | null>(null);
  const lock = useRef(false), stopped = useRef(false);
  useEffect(() => { stopped.current = false; return () => { stopped.current = true; }; }, []);
  const accountId = account.accountId;
  const configurationUrl = `/api/onlyfans-configuration/accounts/${encodeURIComponent(accountId)}`;
  const controlUrl = `/api/onlyfans-launch/automation/accounts/${encodeURIComponent(accountId)}/emergency-stop`;
  async function request(url: string, body?: unknown) {
    if (stopped.current) throw Error("Stopped. Changes already recorded remain in place.");
    const response = await fetch(url, { credentials: "same-origin", cache: "no-store", redirect: "error",
      ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
    if (!response.ok) throw Error("The change could not be confirmed. Refresh the inbox and check current settings.");
    return response.json() as Promise<unknown>;
  }
  const commercialPath = `/api/onlyfans-controls/accounts/${encodeURIComponent(accountId)}/plan-c/scope`;
  async function commercialScope() {
    const response = await fetch(commercialPath, { credentials: "same-origin", cache: "no-store", redirect: "error" });
    if (response.status === 404) return null;
    const body: unknown = await response.json();
    if (!response.ok || !object(body) || body.ok !== true || !object(body.scope))
      throw Error("Current account authority could not be verified. Refresh before changing it.");
    const scope = body.scope;
    if (!("audienceMode" in scope)) return null;
    if (!["all", "selected"].includes(String(scope.audienceMode)) || typeof scope.status !== "string" || !Number.isSafeInteger(scope.revision))
      throw Error("Current commercial authority could not be verified.");
    return scope;
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
  async function run(action: "enable" | "pause") {
    if (lock.current || !viewer.canManage) return;
    lock.current = true; stopped.current = false; setBusy(true); setProgress(null); setNotice("Checking current account settings...");
    try {
      const commercial = await commercialScope();
      if (action === "pause") {
        if (commercial) {
          const body = await request(commercialPath, { action: "stop", expectedRevision: commercial.revision,
            commandKey: crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", ""),
            reason: "Operator paused commercial replies from the inbox" });
          if (!object(body) || body.ok !== true) throw Error("Commercial pause unconfirmed. Refresh before trying again.");
        } else await changeAccount("pause");
        if (!stopped.current) setNotice("Account paused. Messages already being sent may still complete.");
      } else {
        const config = parseConfiguration(await request(configurationUrl), accountId);
        if (!config?.activation?.allFansAllowed || !config.activation.selectionValid || (!commercial && !config.activation.modelCredentialReady))
          throw Error("This account is not ready for eligible existing chats. Review its AI settings first.");
        if (commercial && (commercial.status !== "active" || commercial.audienceMode !== "all"))
          throw Error("Activate the reviewed whole-account commercial scope in Settings first.");
        const state = commercial ? null : await readControl();
        if (state && !state.autonomy.deliveryEnabled)
          throw Error("Enable outgoing messages in account settings first.");
        if (state && !state.accountControl.enabled && !state.readyToEnable)
          throw Error("This account needs attention before AI can resume. Review account readiness first.");
        if (config.activation.selection?.mode !== "all") {
          const command: ConfigurationRequest = { expectedRevision: config.configurationRevision, expectedFingerprint: config.fingerprint,
            patch: { fasttScope: { mode: "all", fans: [] } } };
          if (!parseConfigurationAck(await request(configurationUrl, command), { ...command, accountId }))
            throw Error("All-fan setting unconfirmed. Refresh before continuing.");
        }
        if (commercial) {
          setNotice("Whole-account replies enabled for eligible fans as new messages arrive. Individual pauses, no-contact and human takeovers stay protected.");
          return;
        }
        if (state && !state.accountControl.enabled) await changeAccount("resume");
        const result = await enableExistingFanChats({ account, viewer, source, cancelled: () => stopped.current,
          progress: value => { if (!stopped.current) setProgress(value); } });
        if (!stopped.current) setNotice(`Finished: ${result.enabled} chats enabled, ${result.alreadyOn} already enabled, ${result.protected} protected chats kept as they were. New conversations stay off until you enable each fan individually.`);
      }
    } catch (error) {
      if (!stopped.current) setNotice(error instanceof Error ? error.message : "Stopped. Refresh to check which changes were recorded.");
    } finally {
      lock.current = false;
      if (!stopped.current) { setBusy(false); onChanged(); }
    }
  }
  return <section className="mb-3 rounded-xl border border-line bg-white px-3 py-2" aria-label="Account AI controls" data-of-all-fans-controls>
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-auto text-sm font-semibold">{account.binding.creatorName}: AI replies</span>
      <button type="button" className="min-h-10 rounded-lg bg-[#1764c0] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        disabled={busy || !viewer.canManage} onClick={() => void run("enable")}
        title="Enable AI replies for existing chats and use all-fan scope. Manually paused chats, human takeovers and no-contact fans stay protected.">Enable AI replies for existing chats</button>
      <button type="button" className="min-h-10 rounded-lg border border-line px-3 py-2 text-sm font-semibold disabled:opacity-50"
        disabled={busy || !viewer.canManage} onClick={() => { if (window.confirm("Pause all outgoing activity for " + account.binding.creatorName + "? Queued sends will be cancelled and scheduled campaigns paused. Messages already being sent may finish.")) void run("pause"); }}>Pause account</button>
      {busy ? <button type="button" className="text-sm underline" onClick={() => { stopped.current = true; setBusy(false); setNotice("Stopped after the current request. Refresh to check recorded changes."); onChanged(); }}>Stop changes</button> : null}
    </div>
    <p className="mt-2 text-xs text-muted">Individual pauses, human takeovers and no-contact conversations stay protected. New chats follow this account’s automation settings.</p>
    {notice ? <p role="status" className="mt-2 text-xs">{notice}</p> : null}
    {busy && progress ? <p className="mt-1 text-xs">Checked {progress.checked} chats. Enabled {progress.enabled}.</p> : null}
  </section>;
}
