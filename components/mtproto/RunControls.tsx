"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { confirmLiveAction, stopRunAction } from "@/app/mtproto-campaign/actions";
import type { ReengageRun } from "@/lib/mtproto/types";

// Prompt step 5: "a separate clearly-marked 'Confirm LIVE' action". Only
// offered once the dry run has actually finished (status 'done') — see
// lib/mtproto/runs.ts confirmLive() for the same check enforced server-side.
export default function RunControls({ run }: { run: ReengageRun }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const confirm = () => {
    if (!window.confirm(`Send for real from ${run.cloneIds.length} creator account(s)? This is not a dry run.`)) return;
    const fd = new FormData();
    fd.set("runId", run.id);
    startTransition(async () => {
      await confirmLiveAction(fd);
      router.refresh();
    });
  };

  const stop = () => {
    if (!window.confirm("Stop this run? Already-claimed episodes are not rolled back, only future claims are blocked.")) return;
    const fd = new FormData();
    fd.set("runId", run.id);
    startTransition(async () => {
      await stopRunAction(fd);
      router.refresh();
    });
  };

  const canConfirmLive = run.dryRun && run.status === "done";
  const canStop = !["stopped", "done", "failed"].includes(run.status);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {run.dryRun ? (
        <Button onClick={confirm} disabled={pending || !canConfirmLive} title={!canConfirmLive ? "Review the finished dry run before going live" : undefined}>
          Confirm LIVE
        </Button>
      ) : (
        <span className="text-sm font-semibold text-destructive">LIVE since {run.confirmLiveAt ? new Date(run.confirmLiveAt).toLocaleString() : ""}</span>
      )}
      <Button variant="destructive" onClick={stop} disabled={pending || !canStop}>
        Stop this run
      </Button>
    </div>
  );
}
