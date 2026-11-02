"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Info } from "@/components/clone/fields";
import { globalLiveArmAction } from "@/app/mtproto-campaign/actions";
import { StatusPill } from "./kit";

// The fleet-wide LIVE ARM (migration 165), gate 2's database half. It used to
// be an env var on the worker's own server, so arming meant getting onto the
// box. It lives here now.
//
// ARMING is the one direction that costs something: a typed phrase, re-checked
// server-side in lib/mtproto/global-live-arm.ts (this component only collects
// it, and its own disabled-button check is a courtesy, never the gate).
// DISARMING is one click, always, with no confirm dialog in the way: the safe
// direction must never be slower than the dangerous one.
//
// Arming alone sends nothing. Each creator still needs its own LIVE switch and
// the run still needs its own live confirmation. That is what the ⓘ says, per
// the dashboard's UI conventions (no grey paragraphs under controls).
const ARM_PHRASE = "ARM LIVE";

const ARMED_TIP =
  "Live sending is armed for the whole fleet. This alone sends nothing. A real message still needs a run confirmed LIVE and the creator switched to LIVE on the connections page, and a worker that is not forced dry on its host. Disarming is one click and stops the next send within a minute, with no redeploy.";
const DISARMED_TIP =
  "Live sending is disarmed for the whole fleet. Runs still scan, write and record, and nothing leaves any Telegram account, whatever a run or a creator says. Arming needs a typed confirmation. This is the control that used to be an environment variable on the worker's server.";

export default function GlobalLiveArmControl({ armed }: { armed: boolean | null }) {
  const [pending, startTransition] = useTransition();
  const [confirmingArm, setConfirmingArm] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const submit = (next: boolean, confirmText?: string, done?: () => void) => {
    const fd = new FormData();
    fd.set("armed", String(next));
    if (confirmText) fd.set("confirmText", confirmText);
    setError(null);
    startTransition(async () => {
      try {
        const result = await globalLiveArmAction(fd);
        if (!result.ok) {
          setError(next ? result.error : `DISARM FAILED: ${result.error}`);
          return;
        }
        done?.();
      } catch (e) {
        const message = e instanceof Error ? e.message : "unknown error";
        setError(next ? message : `DISARM FAILED: ${message}`);
      } finally {
        router.refresh();
      }
    });
  };

  const disarm = () => submit(false);
  const arm = () => {
    if (typed.trim().toUpperCase().replace(/\s+/g, " ") !== ARM_PHRASE) return;
    submit(true, typed, () => {
      setConfirmingArm(false);
      setTyped("");
    });
  };

  const errorBox = error ? (
    <div role="alert" className="mt-2 w-full rounded-lg border border-crit/40 bg-crit/10 px-3 py-2 text-xs font-medium text-crit">
      {error}
    </div>
  ) : null;

  // ARMED, or unreadable (treat unknown as possibly armed): offer the SAFE
  // action, one click, no dialog.
  if (armed !== false) {
    return (
      <div className="flex w-full flex-col items-stretch md:w-auto">
        <div className="flex items-center gap-2 rounded-xl border border-crit/50 bg-crit/10 px-3 py-2">
          <span className="flex items-center gap-1.5">
            {armed === null ? (
              <StatusPill tone="warn" dot>Unreadable</StatusPill>
            ) : (
              <StatusPill solid dot>LIVE ARM ON</StatusPill>
            )}
            <Info text={armed === null ? `${ARMED_TIP} This flag could not be read just now, so treat the fleet as armed until it can be.` : ARMED_TIP} />
          </span>
          <Button variant="outline" size="lg" className="h-9 rounded-xl border-crit/50 px-4 font-semibold text-crit" onClick={disarm} disabled={pending}>
            {pending ? "Disarming…" : "Disarm"}
          </Button>
        </div>
        {errorBox}
      </div>
    );
  }

  if (!confirmingArm) {
    return (
      <div className="flex w-full flex-col items-stretch md:w-auto">
        <div className="flex items-center gap-2 rounded-xl border border-line bg-muted/5 px-3 py-2">
          <span className="flex items-center gap-1.5">
            <StatusPill tone="neutral" dot>LIVE ARM OFF</StatusPill>
            <Info text={DISARMED_TIP} />
          </span>
          <Button variant="outline" size="lg" className="h-9 rounded-xl px-4" onClick={() => setConfirmingArm(true)} disabled={pending}>
            Arm live sending
          </Button>
        </div>
        {errorBox}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-stretch md:w-80">
      <div className="rounded-xl border border-crit/40 bg-panel p-3">
        <div className="flex items-center gap-1 text-xs font-semibold text-crit">
          Arming lets the whole fleet send for real.
          <Info text={ARMED_TIP} />
        </div>
        <div className="mt-0.5 text-[11px] text-muted">
          Type {ARM_PHRASE} to confirm. Nothing starts by itself: each creator still needs its own LIVE switch and each run its own live confirmation.
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={`type "${ARM_PHRASE}"`}
            aria-label={`Type ${ARM_PHRASE} to arm live sending for the whole fleet`}
            className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-panel px-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-accent-2 focus:ring-2 focus:ring-accent-2/20"
          />
          <Button size="lg" className="h-9" onClick={arm} disabled={pending || typed.trim().toUpperCase().replace(/\s+/g, " ") !== ARM_PHRASE}>
            Confirm
          </Button>
          <Button size="lg" variant="ghost" className="h-9" onClick={() => setConfirmingArm(false)} disabled={pending}>
            Cancel
          </Button>
        </div>
      </div>
      {errorBox}
    </div>
  );
}
