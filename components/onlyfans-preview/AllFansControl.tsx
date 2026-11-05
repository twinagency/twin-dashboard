"use client";
import { useEffect, useRef, useState } from "react";
import type { OnlyFansDataSource } from "@/lib/onlyfans-preview/data-source";
import type { OfAccount, PreviewViewer } from "@/lib/onlyfans-preview/types";
import { object, parseNativeReadiness } from "@/lib/onlyfans/launch/native";
import { enableExistingChats, readActivation, type EnableProgress } from "@/lib/onlyfans/activation-client";
import { RESULT_SKIP_TEXT, blockerText } from "@/lib/onlyfans/activation-status";

export default function AllFansControl({ account, viewer, source, onChanged }: {
  account: OfAccount; viewer: PreviewViewer; source: OnlyFansDataSource; onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [progress, setProgress] = useState<EnableProgress | null>(null);
  const lock = useRef(false), stopped = useRef(false);
  useEffect(() => { stopped.current = false; return () => { stopped.current = true; }; }, []);
  const accountId = account.accountId;
  const controlUrl = `/api/onlyfans-launch/automation/accounts/${encodeURIComponent(accountId)}/emergency-stop`;
  async function request(url: string, body?: unknown) {
    if (stopped.current) throw Error("Stopped. Changes already recorded remain in place.");
    const response = await fetch(url, { credentials: "same-origin", cache: "no-store", redirect: "error",
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
  async function run(action: "enable" | "pause") {
    if (lock.current || !viewer.canManage) return;
    lock.current = true; stopped.current = false; setBusy(true); setProgress(null); setNotice("Checking current account settings...");
    try {
      if (action === "pause") {
        await changeAccount("pause");
        if (!stopped.current) setNotice("Account paused. Messages already being sent may still complete.");
      } else {
        const read = await readActivation(accountId);
        if (!read.ok) throw Error(read.error);
        let current = read.status;
        if (!current.activated) {
          // Only an account an administrator already activated once (a policy exists) can be resumed here.
          if (current.allowance.state === "none") throw Error("This account has not been activated yet. Open Creators and use Activate account first.");
          const state = await readControl();
          if (!state.readyToEnable) throw Error("This account needs attention before AI can resume. Open its AI chatting status in Creators.");
          await changeAccount("resume");
          const again = await readActivation(accountId);
          if (!again.ok) throw Error(again.error);
          current = again.status;
        }
        if (current.bulkEnable.blockers.length) throw Error("Not ready: " + current.bulkEnable.blockers.map(blockerText).join(" "));
        if (current.bulkEnable.counts.wouldEnable === 0) { setNotice("No existing chat is eligible. Human takeovers, no-contact, paused and restricted chats stay as they are."); return; }
        const result = await enableExistingChats({ accountId, fingerprint: current.fingerprint, cancelled: () => stopped.current,
          progress: value => { if (!stopped.current) setProgress(value); } });
        const skipped = Object.entries(result.skipped).map(([k, n]) => `${n} ${RESULT_SKIP_TEXT[k] ?? k}`).join(", ");
        if (!stopped.current) setNotice(`Finished: ${result.enabled} chats enabled out of ${result.checked} checked${skipped ? `. Skipped: ${skipped}` : ""}. New conversations stay off unless you turned on the future conversations setting.`);
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
        title="Enable AI replies for existing chats within the saved fan scope. Manually paused chats, human takeovers and no-contact fans stay protected.">Enable AI replies for existing chats</button>
      <button type="button" className="min-h-10 rounded-lg border border-line px-3 py-2 text-sm font-semibold disabled:opacity-50"
        disabled={busy || !viewer.canManage} onClick={() => { if (window.confirm("Pause all outgoing activity for " + account.binding.creatorName + "? Queued sends will be cancelled and scheduled campaigns paused. Messages already being sent may finish.")) void run("pause"); }}>Pause account</button>
      {busy ? <button type="button" className="text-sm underline" onClick={() => { stopped.current = true; setBusy(false); setNotice("Stopped after the current request. Refresh to check recorded changes."); onChanged(); }}>Stop changes</button> : null}
    </div>
    <p className="mt-2 text-xs text-muted">New conversations stay off unless the future conversations setting is on. Human takeovers, paused and no-contact conversations stay protected.</p>
    {notice ? <p role="status" className="mt-2 text-xs">{notice}</p> : null}
    {busy && progress ? <p className="mt-1 text-xs">Checked {progress.checked} chats. Enabled {progress.enabled}.</p> : null}
  </section>;
}
