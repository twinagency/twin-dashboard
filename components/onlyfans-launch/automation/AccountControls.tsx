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
type Action = "pause" | "emergency_stop" | "resume";
type Command = { action: Action; expectedFingerprint?: string; reason: string };
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
    [action, setAction] = useState<Action | null>(null),
    [notice, setNotice] = useState(""),
    // The action in flight. Only a STOP in flight blocks STOP; a pause or resume in flight or unconfirmed never does.
    [busy, setBusy] = useState<Action | null>(null),
    [pending, setPending] = useState<Command | null>(null);
  const ready = r.state.kind === "ok" ? r.state.data : null;
  const mounted = useRef(true),
    latest = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  async function send(command: Command) {
    const mine = ++latest.current;
    setBusy(command.action);
    const q = await bFetch(base, { method: "POST", body: command });
    if (!mounted.current) return;
    setAction((a) => (a === command.action ? null : a));
    r.reload();
    onChanged();
    // A STOP sent while a pause or resume was in flight supersedes it: only the latest command reports.
    if (mine !== latest.current) return;
    setBusy(null);
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
    setNotice(
      recorded
        ? "Account command recorded. Reading authoritative current state. Already dispatched or unknown operations retain their status."
        : "error" in q
          ? q.error
          : "The account command outcome is unconfirmed. Read current state before retrying.",
    );
  }
  async function submit() {
    if (!manage || !action || !reason.trim()) return;
    // A STOP is a brake: it never carries the fingerprint this view read, which may be stale. The route pins it to the current one.
    if (action === "emergency_stop") {
      if (busy !== "emergency_stop")
        await send({ action, reason: reason.trim() });
      return;
    }
    if (!ready || busy || pending !== null) return;
    await send({
      action,
      expectedFingerprint: ready.accountControl.fingerprint,
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
      {ready ? (
        <p className="text-sm" data-b-runtime>
          {ready.accountControl.enabled
            ? "Account runtime enabled"
            : "Account runtime stopped"}
          . Unresolved outgoing operations:{" "}
          {ready.accountControl.unresolvedOutgoing}. Control revision{" "}
          {ready.accountControl.revision}.
        </p>
      ) : null}
      <label className="block text-sm">
        Reason
        <input
          className="min-h-11 w-full rounded border border-line px-2"
          disabled={!manage || busy === "emergency_stop"}
          maxLength={512}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {ready ? (
          <button
            className={buttonClass}
            disabled={
              !manage ||
              busy !== null ||
              pending !== null ||
              !reason.trim() ||
              !ready.accountControl.enabled
            }
            onClick={() => setAction("pause")}
          >
            Pause account
          </button>
        ) : null}
        <button
          data-b-emergency
          className={dangerClass}
          disabled={!manage || busy === "emergency_stop" || !reason.trim()}
          onClick={() => setAction("emergency_stop")}
        >
          Emergency stop
        </button>
        {ready ? (
          <button
            className={buttonClass}
            disabled={
              !manage ||
              busy !== null ||
              pending !== null ||
              !reason.trim() ||
              ready.accountControl.enabled ||
              !ready.readyToEnable
            }
            onClick={() => setAction("resume")}
          >
            Resume with current prerequisites
          </button>
        ) : null}
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
            disabled={
              action === "emergency_stop"
                ? busy === "emergency_stop"
                : busy !== null
            }
            onClick={() => void submit()}
          >
            Confirm {action.replaceAll("_", " ")}
          </button>
          <button
            className={buttonClass}
            disabled={busy === action}
            onClick={() => setAction(null)}
          >
            Cancel
          </button>
        </div>
      ) : null}
      <p role="status" data-b-stop-note className="text-sm">
        {notice}
      </p>
      {pending !== null ? (
        <div className="flex flex-wrap gap-2">
          <button
            className={buttonClass}
            disabled={!manage || busy !== null}
            onClick={() => void send(pending)}
          >
            {pending.action === "emergency_stop"
              ? "Send stop again"
              : "Retry identical account command"}
          </button>
          <button
            className={buttonClass}
            disabled={busy !== null}
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
