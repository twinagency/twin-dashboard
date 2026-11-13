"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { globalStopAction } from "@/app/mtproto-campaign/actions";

// Kill-switch layer 4 of 4 (plan section G). Stopping is one press plus a
// native confirm(). Lifting it is the one action here with an actual typed
// confirmation, because it is the one button that re-arms sending across the
// whole fleet. Both server-side checks are unchanged; this only draws them.
export default function GlobalStopControl({ stopped }: { stopped: boolean | null }) {
  const [pending, startTransition] = useTransition();
  const [confirmingResume, setConfirmingResume] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  // A failed STOP or lift may still have landed: the state is unknown until an
  // action is verified, and unknown keeps the STOP button up (unknown holds win).
  const [unknown, setUnknown] = useState(false);
  const router = useRouter();

  const stop = () => {
    if (!window.confirm("GLOBAL STOP: halt every creator's MTProto sending immediately?")) return;
    const fd = new FormData();
    fd.set("stopped", "true");
    setError(null);
    startTransition(async () => {
      try {
        const result = await globalStopAction(fd);
        setUnknown(!result.ok);
        if (!result.ok) setError(`GLOBAL STOP FAILED: ${result.error}`);
      } catch (e) {
        setUnknown(true);
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
        setUnknown(!result.ok);
        if (!result.ok) setError(result.error);
        else {
          setConfirmingResume(false);
          setTyped("");
        }
      } catch (e) {
        setUnknown(true);
        setError(e instanceof Error ? e.message : "resume failed");
      }
      router.refresh(); // a failed lift may have landed: re-read the flag either way
    });
  };

  const errorBox = error ? (
    <div role="alert" className="mt-2 w-full rounded-lg border border-crit/40 bg-crit/10 px-3 py-2 text-xs font-medium text-crit">
      {error}
    </div>
  ) : null;

  // stopped === null means the flag could not be read: offer the SAFE action.
  if (!stopped || unknown) {
    return (
      <div className="flex w-full flex-col items-stretch md:w-auto">
        <button
          type="button"
          onClick={stop}
          disabled={pending}
          className="flex min-h-14 items-center justify-center gap-3 rounded-2xl bg-crit px-6 py-2 text-white shadow-[0_8px_22px_color-mix(in_srgb,var(--color-crit)_35%,transparent)] outline-none transition hover:brightness-90 focus-visible:ring-4 focus-visible:ring-crit/30 active:translate-y-px disabled:opacity-60"
        >
          <span aria-hidden className="grid size-6 place-items-center rounded-md bg-white/20 text-sm leading-none">■</span>
          <span className="text-left leading-tight">
            <span className="block text-base font-extrabold tracking-wide">{pending ? "Stopping…" : "GLOBAL STOP"}</span>
            <span className="block text-[11px] font-medium text-white/85">Halts all sending, right now</span>
          </span>
        </button>
        {stopped === null || unknown ? (
          <div role="status" className="mt-2 text-xs font-semibold text-crit">State unknown. Treat sending as possibly active.</div>
        ) : null}
        {errorBox}
      </div>
    );
  }

  if (!confirmingResume) {
    return (
      <div className="flex w-full flex-col items-stretch md:w-auto">
        <Button variant="outline" size="lg" className="h-11 rounded-xl px-4" onClick={() => setConfirmingResume(true)} disabled={pending}>
          Lift global stop
        </Button>
        {errorBox}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-stretch md:w-72">
      <div className="rounded-xl border border-crit/40 bg-panel p-3">
        <div className="text-xs font-semibold text-crit">Lifting this lets every creator send again.</div>
        <div className="mt-0.5 text-[11px] text-muted">Type RESUME to confirm. Nothing restarts by itself: paused creators and runs stay as they were.</div>
        <div className="mt-2 flex items-center gap-2">
          <input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder='type "RESUME"'
            aria-label='Type RESUME to lift the global stop'
            className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-panel px-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-accent-2 focus:ring-2 focus:ring-accent-2/20"
          />
          <Button size="lg" className="h-9" onClick={resume} disabled={pending || typed.trim().toUpperCase() !== "RESUME"}>
            Confirm
          </Button>
          <Button size="lg" variant="ghost" className="h-9" onClick={() => setConfirmingResume(false)} disabled={pending}>
            Cancel
          </Button>
        </div>
      </div>
      {errorBox}
    </div>
  );
}
