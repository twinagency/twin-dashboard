"use client";

import { useState } from "react";
import { inputCls, Info } from "@/components/clone/fields";
import { Button } from "@/components/ui/button";
import { canTransitionSession, type SessionStatus } from "@/lib/sequence-policy";

type Props = {
  cloneId: string;
  userId: string;
  status: SessionStatus;
  pauseReason: string | null;
  continuationBlock: string | null;
  nextPosition: number | null;
  ownedPositions: number[];
  setStatusAction: (fd: FormData) => Promise<void>;
};

const LABELS: Record<SessionStatus, string> = {
  invited: "Invited",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  stopped: "Ended",
};

/**
 * Operator controls for one fan's sequence.
 *
 * Pausing stops further offers to this fan. It does not pause the bot, and it
 * does not touch anything he has already bought: the parts he owns stay owned
 * and stay supportable.
 */
export default function FanSequenceControls({
  cloneId, userId, status, pauseReason, continuationBlock, nextPosition, ownedPositions, setStatusAction,
}: Props) {
  const [reason, setReason] = useState(pauseReason ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(next: SessionStatus) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("cloneId", cloneId);
      fd.set("userId", userId);
      fd.set("status", next);
      fd.set("reason", reason);
      await setStatusAction(fd);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change this sequence");
    } finally {
      setBusy(false);
    }
  }

  const canPause = canTransitionSession(status, "paused");
  const canResume = canTransitionSession(status, "active");
  const canStop = canTransitionSession(status, "stopped");

  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-ink">Sequence</h3>
        <Info text="Pausing stops new parts being offered to this fan. It does not pause the bot and it never removes what he already paid for." />
        <span className="ml-auto rounded-lg bg-muted/15 px-2 py-1 text-xs text-ink">{LABELS[status]}</span>
      </div>

      <dl className="mb-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-muted">Parts owned</dt>
          <dd className="text-ink">{ownedPositions.length ? [...ownedPositions].sort((a, b) => a - b).join(", ") : "None"}</dd>
        </div>
        <div>
          <dt className="text-muted">Next eligible</dt>
          <dd className="text-ink">{nextPosition === null ? "None" : `Part ${nextPosition}`}</dd>
        </div>
      </dl>

      {continuationBlock && (
        <p className="mb-3 rounded-lg border border-warn/40 bg-warn/10 px-2 py-1 text-xs text-ink">{continuationBlock}</p>
      )}

      <label className="mb-2 block min-w-0">
        <span className="mb-1 block text-xs text-muted">Reason (kept on the record)</span>
        <input type="text" className={inputCls} value={reason} placeholder="creator asked us to hold this one"
          onChange={(e) => setReason(e.target.value)} />
      </label>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy || !canPause} onClick={() => send("paused")}>Pause</Button>
        <Button type="button" variant="outline" size="sm" disabled={busy || !canResume} onClick={() => send("active")}>Resume</Button>
        <Button type="button" variant="outline" size="sm" disabled={busy || !canStop} onClick={() => send("stopped")}>End</Button>
      </div>

      {error && <p className="mt-2 text-xs text-crit">{error}</p>}
    </div>
  );
}
