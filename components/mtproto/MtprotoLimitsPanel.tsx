"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/clone/fields";
import { setMtprotoLimitsAction } from "@/app/mtproto-campaign/actions";
import {
  HARD_MAX_DAILY_CAP,
  HARD_MAX_FIRST_DAY_MAX_SENDS,
  HARD_MAX_FLOOD_WAIT_MULTIPLIER,
  HARD_MAX_HOURLY_CAP,
  HARD_MAX_JITTER_MS,
  HARD_MAX_MIN_SEND_GAP_MINUTES,
  HARD_MAX_MIN_SILENCE_HOURS,
  HARD_MAX_WARMUP_HOURS,
  HARD_MIN_DAILY_CAP,
  HARD_MIN_FIRST_DAY_MAX_SENDS,
  HARD_MIN_FLOOD_WAIT_MULTIPLIER,
  HARD_MIN_HOURLY_CAP,
  HARD_MIN_MIN_SEND_GAP_MINUTES,
  HARD_MIN_MIN_SILENCE_HOURS,
  HARD_MIN_WARMUP_HOURS,
  MIN_SEND_SPACING_MS,
  type MtprotoLimits,
} from "@/lib/mtproto/types";

const inputCls = "h-9 w-full min-w-0 rounded-lg border border-line bg-panel px-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-accent-2 focus:ring-2 focus:ring-accent-2/20";

type Field = {
  key: keyof MtprotoLimits;
  label: string;
  hint: string;
  min: number;
  max: number;
  step?: number;
};

const FIELDS: Field[] = [
  { key: "hourlyCap", label: "Hourly cap", hint: `Sends per creator per rolling hour, fleet wide. Safe max ${HARD_MAX_HOURLY_CAP}.`, min: HARD_MIN_HOURLY_CAP, max: HARD_MAX_HOURLY_CAP },
  { key: "defaultDailyCap", label: "Default daily cap", hint: `The daily cap a new run or creator starts with. Safe max ${HARD_MAX_DAILY_CAP} (each run or creator can still be set lower or higher up to that ceiling).`, min: HARD_MIN_DAILY_CAP, max: HARD_MAX_DAILY_CAP },
  { key: "jitterMinMs", label: "Pacing, minimum (ms)", hint: `The shortest pause between two sends from the same creator. Floor ${MIN_SEND_SPACING_MS}ms.`, min: MIN_SEND_SPACING_MS, max: HARD_MAX_JITTER_MS, step: 500 },
  { key: "jitterMaxMs", label: "Pacing, maximum (ms)", hint: `The longest pause between two sends. Safe max ${HARD_MAX_JITTER_MS}ms (5 minutes).`, min: MIN_SEND_SPACING_MS, max: HARD_MAX_JITTER_MS, step: 500 },
  { key: "minSilenceHours", label: "Silent for at least (hours)", hint: `How long a fan must have gone quiet before she is eligible. Range ${HARD_MIN_MIN_SILENCE_HOURS} to ${HARD_MAX_MIN_SILENCE_HOURS} hours.`, min: HARD_MIN_MIN_SILENCE_HOURS, max: HARD_MAX_MIN_SILENCE_HOURS },
  { key: "floodWaitMultiplier", label: "Flood-wait multiplier", hint: `Telegram's own wait time is multiplied by this before the girl auto-resumes. Range ${HARD_MIN_FLOOD_WAIT_MULTIPLIER} to ${HARD_MAX_FLOOD_WAIT_MULTIPLIER}.`, min: HARD_MIN_FLOOD_WAIT_MULTIPLIER, max: HARD_MAX_FLOOD_WAIT_MULTIPLIER },
  { key: "warmupHours", label: "Warm-up after login (hours, 0 = off)", hint: `Blocks every live send for this many hours after a fresh QR login. Not a Telegram rule, an optional precaution. Off by default. Range ${HARD_MIN_WARMUP_HOURS} to ${HARD_MAX_WARMUP_HOURS}.`, min: HARD_MIN_WARMUP_HOURS, max: HARD_MAX_WARMUP_HOURS },
  { key: "minSendGapMinutes", label: "Min gap between sends (minutes, 0 = off)", hint: `Minimum minutes between any two live sends from the same girl, on top of pacing and the hourly cap. Off by default. Range ${HARD_MIN_MIN_SEND_GAP_MINUTES} to ${HARD_MAX_MIN_SEND_GAP_MINUTES}.`, min: HARD_MIN_MIN_SEND_GAP_MINUTES, max: HARD_MAX_MIN_SEND_GAP_MINUTES },
  { key: "firstDayMaxSends", label: "Day-one send cap (0 = off)", hint: `Max live sends in the first 24 hours after a fresh login, regardless of the hourly or daily cap. Off by default. Range ${HARD_MIN_FIRST_DAY_MAX_SENDS} to ${HARD_MAX_FIRST_DAY_MAX_SENDS}.`, min: HARD_MIN_FIRST_DAY_MAX_SENDS, max: HARD_MAX_FIRST_DAY_MAX_SENDS },
];

// Settings tab's limits editor (migration 169/171): the six values that used
// to be hardcoded constants on the worker's own box, now one app_settings
// row the worker re-reads on every pass. Every field is clamped to the same
// hard safe-max range the worker itself enforces (lib/mtproto/types.ts), so
// nothing typed here can push a value past what the worker would clamp back
// down anyway; the save just fails with the range instead of silently
// clamping, so the operator isn't left thinking they set something they did
// not.
export default function MtprotoLimitsPanel({ limits }: { limits: MtprotoLimits }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<keyof MtprotoLimits, string>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, String(limits[f.key])])) as Record<keyof MtprotoLimits, string>,
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = FIELDS.some((f) => values[f.key] !== String(limits[f.key]));

  const save = () => {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    for (const f of FIELDS) fd.set(f.key, values[f.key]);
    startTransition(async () => {
      try {
        const result = await setMtprotoLimitsAction(fd);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setValues(Object.fromEntries(FIELDS.map((f) => [f.key, String(result.limits[f.key])])) as Record<keyof MtprotoLimits, string>);
        setSaved(true);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "save failed");
      }
    });
  };

  const reset = () => setValues(Object.fromEntries(FIELDS.map((f) => [f.key, String(limits[f.key])])) as Record<keyof MtprotoLimits, string>);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <FieldLabel label={f.label} hint={f.hint} />
            <input
              type="number"
              min={f.min}
              max={f.max}
              step={f.step ?? 1}
              value={values[f.key]}
              onChange={(e) => {
                setSaved(false);
                setValues((prev) => ({ ...prev, [f.key]: e.target.value }));
              }}
              className={inputCls}
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" className="h-9 rounded-lg" onClick={save} disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save limits"}
        </Button>
        {dirty && (
          <Button size="sm" variant="ghost" className="h-9 rounded-lg" onClick={reset} disabled={pending}>
            Reset
          </Button>
        )}
        {saved && !dirty && <span className="text-xs font-semibold text-good">Saved.</span>}
      </div>
      {error && (
        <div role="alert" className="rounded-lg border border-crit/40 bg-crit/10 px-3 py-2 text-xs font-medium text-crit">
          {error}
        </div>
      )}
    </div>
  );
}
