"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { object, parseNativeReadiness } from "@/lib/onlyfans/launch/native";
import { bFetch } from "@/lib/onlyfans/launch/b-common";
import {
  StateLine,
  useJsonResource,
  buttonClass,
  dangerClass,
} from "../a-shared";
const parser = (accountId: string) => (v: unknown) =>
  object(v) &&
  v.schemaVersion === "of-launch-b.v1" &&
  v.ok === true &&
  v.accountId === accountId
    ? parseNativeReadiness(v.readiness)
    : null;
export default function AccountControls({
  accountId,
  manage,
  onChanged,
}: {
  accountId: string;
  manage: boolean;
  onChanged: () => void;
}) {
  const base = `/api/onlyfans-launch/automation/accounts/${encodeURIComponent(accountId)}/emergency-stop`;
  const r = useJsonResource(
      base,
      useCallback(parser(accountId), [accountId]),
      false,
    ),
    [reason, setReason] = useState(""),
    [action, setAction] = useState<
      "pause" | "emergency_stop" | "resume" | null
    >(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<unknown | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  async function send(command: unknown) {
    setBusy(true);
    const q = await bFetch(base, { method: "POST", body: command });
    if (!mounted.current) return;
    setBusy(false);
    const recorded =
      q.kind === "ok" &&
      object(q.data) &&
      q.data.schemaVersion === "of-launch-b.v1" &&
      q.data.ok === true &&
      q.data.accountId === accountId &&
      object(q.data.command) &&
      q.data.command.recorded === true;
    setPending(
      q.kind === "unconfirmed" || (q.kind === "ok" && !recorded)
        ? command
        : null,
    );
    setAction(null);
    setNotice(
      recorded
        ? "Account command recorded. Reading authoritative current state. Already dispatched or unknown operations retain their status."
        : "error" in q
          ? q.error
          : "The account command outcome is unconfirmed. Read current state before retrying.",
    );
    r.reload();
    onChanged();
  }
  async function submit() {
    if (
      !manage ||
      !action ||
      busy ||
      pending !== null ||
      r.state.kind !== "ok" ||
      !reason.trim()
    )
      return;
    await send({
      action,
      expectedFingerprint: r.state.data.accountControl.fingerprint,
      reason: reason.trim(),
    });
  }

  return (
    <div className="mt-3 space-y-3 border-t border-line pt-3">
      <h3 className="font-semibold">Account-wide controls</h3>
      <StateLine state={r.state} retry={r.reload} label="account controls" />
      {r.state.kind === "pending" ? (
        <p role="alert">
          {r.state.error}
          <button className={buttonClass} onClick={r.reload}>
            Retry
          </button>
        </p>
      ) : null}
      {r.state.kind === "ok" ? (
        <>
          <p className="text-sm" data-b-runtime>
            {r.state.data.accountControl.enabled
              ? "Account runtime enabled"
              : "Account runtime stopped"}
            . Unresolved outgoing operations:{" "}
            {r.state.data.accountControl.unresolvedOutgoing}. Control revision{" "}
            {r.state.data.accountControl.revision}.
          </p>
          <label className="block text-sm">
            Reason
            <input
              className="min-h-11 w-full rounded border border-line px-2"
              disabled={!manage || busy}
              maxLength={512}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              className={buttonClass}
              disabled={
                !manage ||
                busy ||
                pending !== null ||
                !reason.trim() ||
                !r.state.data.accountControl.enabled
              }
              onClick={() => setAction("pause")}
            >
              Pause account
            </button>
            <button
              data-b-emergency
              className={dangerClass}
              disabled={!manage || busy || pending !== null || !reason.trim()}
              onClick={() => setAction("emergency_stop")}
            >
              Emergency stop
            </button>
            <button
              className={buttonClass}
              disabled={
                !manage ||
                busy ||
                pending !== null ||
                !reason.trim() ||
                r.state.data.accountControl.enabled ||
                !r.state.data.readyToEnable
              }
              onClick={() => setAction("resume")}
            >
              Resume with current prerequisites
            </button>
          </div>
          {action ? (
            <div
              role="alertdialog"
              aria-label="Confirm account control"
              className="rounded border border-line p-3 text-sm"
            >
              <p>
                {action === "resume"
                  ? "Resume this account for newly revalidated work? Cancelled work will not be replayed."
                  : "Stop this account and cancel queued work? Already dispatched or unknown operations cannot be assumed unsent."}
              </p>
              <button
                className={action === "resume" ? buttonClass : dangerClass}
                disabled={busy}
                onClick={() => void submit()}
              >
                Confirm {action.replaceAll("_", " ")}
              </button>
              <button
                className={buttonClass}
                disabled={busy}
                onClick={() => setAction(null)}
              >
                Cancel
              </button>
            </div>
          ) : null}
        </>
      ) : null}
      <p role="status" data-b-stop-note className="text-sm">
        {notice}
      </p>
      {pending !== null ? (
        <div className="flex flex-wrap gap-2">
          <button
            className={buttonClass}
            disabled={!manage || busy}
            onClick={() => void send(pending)}
          >
            Retry identical account command
          </button>
          <button
            className={buttonClass}
            disabled={busy}
            onClick={() => {
              setPending(null);
              setNotice("Review current account state before another action.");
            }}
          >
            Use current account view
          </button>
        </div>
      ) : null}
    </div>
  );
}
