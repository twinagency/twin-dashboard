"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { confirmLiveAction, stopRunAction } from "@/app/mtproto-campaign/actions";
import { CONFIRM_LIVE_PHRASE, type ReengageRun } from "@/lib/mtproto/types";
import type { SendPlan } from "@/lib/mtproto/review";
import { Notice } from "./kit";

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
    if (!window.confirm("Stop this run? Fans already picked up are not rolled back, only new ones are blocked.")) return;
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

  // Why "Go live" is greyed out, in words.
  const lockedReason = !run.dryRun
    ? null
    : run.stopRequested
      ? "This run was stopped."
      : run.status !== "done"
        ? "Wait for the dry run to finish."
        : !reviewed
          ? "Read the dry-run check below and press \"I reviewed this dry run\" first."
          : null;

  return (
    <div className="flex w-full flex-col items-stretch gap-2 md:w-auto md:items-end">
      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        {run.dryRun ? (
          !arming && (
            <Button size="lg" className="h-10 rounded-xl px-4" onClick={() => setArming(true)} disabled={pending || !canConfirmLive} title={!canConfirmLive ? "Press \"I reviewed this dry run\" on the finished dry run first" : undefined}>
              Go live...
            </Button>
          )
        ) : (
          <span className="rounded-full bg-crit px-3 py-1 text-xs font-bold text-white">
            LIVE since {run.confirmLiveAt ? new Date(run.confirmLiveAt).toLocaleString() : ""}
          </span>
        )}
        <Button variant="destructive" size="lg" className="h-10 rounded-xl px-4 font-semibold" onClick={stop} disabled={pending || !canStop}>
          Stop this run
        </Button>
      </div>

      {lockedReason && !arming && <div className="text-xs text-muted md:text-right">{lockedReason}</div>}

      {arming && (
        <div className="w-full rounded-2xl border border-crit/40 bg-panel p-4 shadow-[var(--shadow-card)] md:w-[26rem]">
          <div className="text-sm font-bold text-crit">This sends real messages to real fans.</div>
          <div className="mt-1 text-[13px] leading-relaxed text-ink">
            Sends for real from {run.cloneIds.length} creator account(s)
            {plan ? `: up to ${plan.firstDayTotal} today, up to ${plan.runTotal} over the whole run (min of run cap, daily cap, per-creator cap)` : ""}. Type {CONFIRM_LIVE_PHRASE}.
          </div>
          <div className="mt-1 text-[11px] leading-snug text-muted">
            Needs the fleet live arm and each creator's LIVE switch on, both in Settings. Otherwise this is refused.
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={CONFIRM_LIVE_PHRASE}
              aria-label={`Type ${CONFIRM_LIVE_PHRASE} to confirm`}
              className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 text-sm font-semibold tracking-wide text-ink outline-none placeholder:font-normal placeholder:text-muted focus:border-crit focus:ring-2 focus:ring-crit/20"
            />
            <Button size="lg" variant="destructive" className="h-10 rounded-lg px-4 font-bold" onClick={confirm} disabled={pending || typed.trim() !== CONFIRM_LIVE_PHRASE}>
              Confirm LIVE
            </Button>
            <Button size="lg" variant="ghost" className="h-10" onClick={() => { setArming(false); setTyped(""); }} disabled={pending}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error && <Notice tone="crit">{error}</Notice>}
    </div>
  );
}
