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
/** STOP reports in its own lane, pause and resume share the other: one lane's result never hides or replaces the other's. */
type Lane = "stop" | "control";
const laneOf = (a: Action): Lane => (a === "emergency_stop" ? "stop" : "control");
const LABEL: Record<Action, string> = { pause: "Pause", emergency_stop: "Emergency stop", resume: "Resume" };
type Outcome = { notice: string; pending: Command | null };
const NONE: Outcome = { notice: "", pending: null };
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
    // Every command in flight (at most one STOP plus one pause or resume).
    [inFlight, setInFlight] = useState<Action[]>([]),
    [outcome, setOutcome] = useState<Record<Lane, Outcome>>({ stop: NONE, control: NONE });
  const ready = r.state.kind === "ok" ? r.state.data : null;
  const unconfirmed = outcome.stop.pending !== null || outcome.control.pending !== null;
  const sending = (a: Action) => inFlight.includes(a);
  /** The one gate for every control that sends. A STOP is blocked only by a STOP in flight; a pause or resume by no current read,
   *  anything in flight or anything unconfirmed. `retry` resends a lane's unconfirmed command as it was: its own reason, no state
   *  precondition. Closing a dialog or dropping an unconfirmed result sends nothing, so it waits only for its own command (`sending`). */
  function blocked(a: Action, retry = false) {
    if (!manage) return true;
    if (a === "emergency_stop") return sending(a) || (!retry && !reason.trim());
    if (inFlight.length) return true;
    if (retry) return false;
    return !reason.trim() || !ready || unconfirmed ||
      (a === "pause" ? !ready.accountControl.enabled : ready.accountControl.enabled || !ready.readyToEnable);
  }
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  async function send(command: Command) {
    setInFlight((f) => [...f, command.action]);
    const q = await bFetch(base, { method: "POST", body: command });
    if (!mounted.current) return;
    setInFlight((f) => f.filter((a) => a !== command.action));
    setAction((a) => (a === command.action ? null : a));
    r.reload();
    onChanged();
    const recorded =
      q.kind === "ok" &&
      object(q.data) &&
      q.data.schemaVersion === "of-launch-b.v1" &&
      q.data.ok === true &&
      q.data.accountId === accountId &&
      object(q.data.command) &&
      q.data.command.recorded === true;
    setOutcome((o) => ({
      ...o,
      [laneOf(command.action)]: {
        pending: q.kind === "unconfirmed" || (q.kind === "ok" && !recorded) ? command : null,
        notice: `${LABEL[command.action]}: ${
          recorded
            ? "Account command recorded. Reading authoritative current state. Already dispatched or unknown operations retain their status."
            : "error" in q
              ? q.error
              : "The account command outcome is unconfirmed. Read current state before retrying."
        }`,
      },
    }));
  }
  async function submit() {
    if (!action || blocked(action)) return;
    // A STOP is a brake: it never carries the fingerprint this view read, which may be stale. The route pins it to the current one.
    if (action === "emergency_stop") {
      await send({ action, reason: reason.trim() });
      return;
    }
    const expectedFingerprint = ready?.accountControl.fingerprint;
    if (!expectedFingerprint) return;
    await send({ action, expectedFingerprint, reason: reason.trim() });
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
          disabled={!manage || sending("emergency_stop")}
          maxLength={512}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {ready ? (
          <button
            className={buttonClass}
            disabled={blocked("pause")}
            onClick={() => setAction("pause")}
          >
            Pause account
          </button>
        ) : null}
        <button
          data-b-emergency
          className={dangerClass}
          disabled={blocked("emergency_stop")}
          onClick={() => setAction("emergency_stop")}
        >
          Emergency stop
        </button>
        {ready ? (
          <button
            className={buttonClass}
            disabled={blocked("resume")}
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
            disabled={blocked(action)}
            onClick={() => void submit()}
          >
            Confirm {action.replaceAll("_", " ")}
          </button>
          <button
            className={buttonClass}
            disabled={sending(action)}
            onClick={() => setAction(null)}
          >
            Cancel
          </button>
        </div>
      ) : null}
      {(["control", "stop"] as const).map((lane) => {
        const { notice, pending } = outcome[lane];
        return (
          <div key={lane} className="space-y-2">
            <p
              role="status"
              data-b-stop-note={lane === "stop" ? "" : undefined}
              data-b-control-note={lane === "control" ? "" : undefined}
              className="text-sm"
            >
              {notice}
            </p>
            {pending !== null ? (
              <div className="flex flex-wrap gap-2">
                <button
                  className={buttonClass}
                  disabled={blocked(pending.action, true)}
                  onClick={() => void send(pending)}
                >
                  {pending.action === "emergency_stop"
                    ? "Send stop again"
                    : "Retry identical account command"}
                </button>
                <button
                  className={buttonClass}
                  disabled={sending(pending.action)}
                  onClick={() =>
                    setOutcome((o) => ({
                      ...o,
                      [lane]: { pending: null, notice: "Review current account state before another action." },
                    }))
                  }
                >
                  Use current account view
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
