"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { confirmLiveAction, stopRunAction } from "@/app/mtproto-campaign/actions";
import { CONFIRM_LIVE_PHRASE, type ReengageRun } from "@/lib/mtproto/types";
import type { SendPlan } from "@/lib/mtproto/review";

// Prompt step 5: "a separate clearly-marked 'Confirm LIVE' action". Only
// offered once the dry run has actually finished (status 'done'), and only
// after typing the phrase. Both gates are enforced again server-side in
// lib/mtproto/runs.ts confirmLive(); this component is only where the phrase
// is collected. Every failure is shown, never swallowed.
export default function RunControls({ run, reviewed = false, plan = null }: { run: ReengageRun; reviewed?: boolean; plan?: SendPlan | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [arming, setArming] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  const confirm = () => {
    setError(null);
    const fd = new FormData();
    fd.set("runId", run.id);
    fd.set("confirmText", typed);
    startTransition(async () => {
      try {
        const result = await confirmLiveAction(fd);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setArming(false);
        setTyped("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "confirm live failed");
      }
    });
  };

  const stop = () => {
    if (!window.confirm("Stop this run? Already-claimed episodes are not rolled back, only future claims are blocked.")) return;
    setError(null);
    const fd = new FormData();
    fd.set("runId", run.id);
    startTransition(async () => {
      try {
        const result = await stopRunAction(fd);
        if (!result.ok) setError(`STOP FAILED: ${result.error}`);
        router.refresh();
      } catch (e) {
        setError(`STOP FAILED: ${e instanceof Error ? e.message : "unknown error"}`);
      }
    });
  };

  // The server re-checks the review (and that nothing changed since) in confirmLive().
  const canConfirmLive = run.dryRun && run.status === "done" && !run.stopRequested && reviewed;
  const canStop = ["draft", "queued", "running", "paused"].includes(run.status);

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {run.dryRun ? (
          arming ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-card p-2">
              <span className="text-xs text-destructive">
                Sends for real from {run.cloneIds.length} creator account(s)
                {plan ? `: up to ${plan.firstDayTotal} today, up to ${plan.runTotal} over the whole run (min of run cap, daily cap, per-creator cap)` : ""}. Type {CONFIRM_LIVE_PHRASE}.
              </span>
              <span className="basis-full text-[11px] text-muted-foreground">
                The worker on the laptop additionally needs REENGAGE_ALLOW_LIVE=true, otherwise it stays a dry run even after this.
              </span>
              <input
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={CONFIRM_LIVE_PHRASE}
                className="h-8 w-28 rounded-md border border-input bg-background px-2 text-xs"
              />
              <Button size="sm" variant="destructive" onClick={confirm} disabled={pending || typed.trim() !== CONFIRM_LIVE_PHRASE}>
                Confirm LIVE
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setArming(false); setTyped(""); }} disabled={pending}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button onClick={() => setArming(true)} disabled={pending || !canConfirmLive} title={!canConfirmLive ? "Press \"I reviewed this dry run\" on the finished dry run first" : undefined}>
              Go live...
            </Button>
          )
        ) : (
          <span className="text-sm font-semibold text-destructive">LIVE since {run.confirmLiveAt ? new Date(run.confirmLiveAt).toLocaleString() : ""}</span>
        )}
        <Button variant="destructive" onClick={stop} disabled={pending || !canStop}>
          Stop this run
        </Button>
      </div>
      {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}
    </div>
  );
}
