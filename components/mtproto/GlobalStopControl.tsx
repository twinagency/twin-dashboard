"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { globalStopAction } from "@/app/mtproto-campaign/actions";

// Kill-switch layer 4 of 4 (plan section G). Lifting it is the one action
// here with an actual typed confirmation — everything else is a click plus a
// native confirm(), this one asks for the word because it is the one button
// that re-arms sending across the whole fleet.
export default function GlobalStopControl({ stopped }: { stopped: boolean | null }) {
  const [pending, startTransition] = useTransition();
  const [confirmingResume, setConfirmingResume] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const stop = () => {
    if (!window.confirm("GLOBAL STOP: halt every creator's MTProto sending immediately?")) return;
    const fd = new FormData();
    fd.set("stopped", "true");
    setError(null);
    startTransition(async () => {
      try {
        const result = await globalStopAction(fd);
        if (!result.ok) setError(`GLOBAL STOP FAILED: ${result.error}`);
      } catch (e) {
        setError(`GLOBAL STOP FAILED: ${e instanceof Error ? e.message : "unknown error"}`);
      }
      router.refresh();
    });
  };

  const resume = () => {
    if (typed.trim().toUpperCase() !== "RESUME") return;
    const fd = new FormData();
    fd.set("stopped", "false");
    fd.set("confirmText", typed);
    setError(null);
    startTransition(async () => {
      try {
        const result = await globalStopAction(fd);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setConfirmingResume(false);
        setTyped("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "resume failed");
      }
    });
  };

  const errorBox = error ? (
    <div className="mt-1 max-w-sm rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive">{error}</div>
  ) : null;

  // stopped === null means the flag could not be read: offer the SAFE action.
  if (!stopped) {
    return (
      <div className="flex flex-col items-end">
        <Button variant="destructive" onClick={stop} disabled={pending}>
          {pending ? "Stopping…" : "GLOBAL STOP"}
        </Button>
        {errorBox}
      </div>
    );
  }

  if (!confirmingResume) {
    return (
      <div className="flex flex-col items-end">
        <Button variant="outline" onClick={() => setConfirmingResume(true)} disabled={pending}>
          Lift global stop
        </Button>
        {errorBox}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-2">
        <input
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder='type "RESUME"'
          className="h-8 w-32 rounded-md border border-input bg-background px-2 text-xs"
        />
        <Button size="sm" onClick={resume} disabled={pending || typed.trim().toUpperCase() !== "RESUME"}>
          Confirm
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirmingResume(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
      {errorBox}
    </div>
  );
}
