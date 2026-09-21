"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { globalStopAction } from "@/app/mtproto-campaign/actions";

// Kill-switch layer 4 of 4 (plan section G). Lifting it is the one action
// here with an actual typed confirmation — everything else is a click plus a
// native confirm(), this one asks for the word because it is the one button
// that re-arms sending across the whole fleet.
export default function GlobalStopControl({ stopped }: { stopped: boolean }) {
  const [pending, startTransition] = useTransition();
  const [confirmingResume, setConfirmingResume] = useState(false);
  const [typed, setTyped] = useState("");
  const router = useRouter();

  const stop = () => {
    if (!window.confirm("GLOBAL STOP: halt every creator's MTProto sending immediately?")) return;
    const fd = new FormData();
    fd.set("stopped", "true");
    startTransition(async () => {
      await globalStopAction(fd);
      router.refresh();
    });
  };

  const resume = () => {
    if (typed.trim().toUpperCase() !== "RESUME") return;
    const fd = new FormData();
    fd.set("stopped", "false");
    startTransition(async () => {
      await globalStopAction(fd);
      setConfirmingResume(false);
      setTyped("");
      router.refresh();
    });
  };

  if (!stopped) {
    return (
      <Button variant="destructive" onClick={stop} disabled={pending}>
        {pending ? "Stopping…" : "GLOBAL STOP"}
      </Button>
    );
  }

  if (!confirmingResume) {
    return (
      <Button variant="outline" onClick={() => setConfirmingResume(true)} disabled={pending}>
        Lift global stop
      </Button>
    );
  }

  return (
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
  );
}
