"use client";

import { useEffect, useState } from "react";
import { onLive, lastDrip } from "@/lib/live-bus";
import { untilLabel } from "@/lib/drip";

const STEP_EMOJI: Record<string, string> = {
  text: "💬",
  voice: "🎙️",
  photo: "📷",
  video: "🎥",
  bundle: "🎁",
};

type State = {
  step: number;
  total: number;
  enabled: boolean;
  nextType: string | null;
  nextDueAt: string | null;
};

// The at-a-glance strip for the selected fan: what the campaign has already
// sent, what is next, and when it fires. Server props are the truth until the
// feed says otherwise.
//
// The due time is COMPUTED, never read: users.next_send_at exists but is dead,
// and campaign.ts measures every step from the fan's last inbound message at
// tick time. lib/drip.ts holds that arithmetic once so this strip and the feed
// cannot disagree about it.
export default function DripStrip({
  fanId,
  initial,
  labels,
}: {
  fanId: string;
  initial: State;
  // The step type names, in fired order, for the "done" pips. Server rendered
  // because the feed only carries counts, not the clone's whole step list.
  labels: string[];
}) {
  const [state, setState] = useState<State>(initial);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const seen = lastDrip(fanId);
    if (seen)
      setState({
        step: seen.step,
        total: seen.total,
        enabled: seen.enabled,
        nextType: seen.nextType,
        nextDueAt: seen.nextDueAt,
      });
    return onLive((event) => {
      if (event.t !== "drip" || event.fanId !== fanId) return;
      setState({
        step: event.step,
        total: event.total,
        enabled: event.enabled,
        nextType: event.nextType,
        nextDueAt: event.nextDueAt,
      });
    });
  }, [fanId]);

  useEffect(() => {
    // Only starts ticking after mount, so the countdown text is identical on
    // server and client for the first paint. Rendering a relative time straight
    // from Date.now() during SSR is a hydration mismatch waiting to happen.
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (state.total === 0) return null;

  const done = state.step;
  const finished = done >= state.total;

  return (
    <div className="rounded-md border border-line bg-bg px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Campaign</span>
        <span className="font-mono text-[10px] tabular-nums text-muted">
          {done}/{state.total} sent
        </span>
      </div>

      {/* One pip per step: filled = already sent this quiet episode. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {labels.map((type, i) => (
          <span
            key={i}
            title={`Step ${i + 1}: ${type}${i < done ? " (sent)" : ""}`}
            className={
              "rounded-full px-1.5 py-px text-[9px] leading-[14px] " +
              (i < done ? "bg-purple-500/20 text-purple-300" : "bg-muted/10 text-muted")
            }
          >
            {STEP_EMOJI[type] ?? "•"} {type}
          </span>
        ))}
      </div>

      <div className="mt-1.5 text-[11px] text-muted">
        {!state.enabled ? (
          <span className="text-warn">Campaign is off for this clone, nothing will send.</span>
        ) : finished ? (
          <span>Episode finished. Resets when he messages.</span>
        ) : state.nextDueAt ? (
          <span>
            Next: <span className="text-ink">{STEP_EMOJI[state.nextType ?? ""] ?? "•"} {state.nextType}</span>{" "}
            <span className="font-mono tabular-nums text-accent">
              {now === null ? "" : untilLabel(state.nextDueAt, now)}
            </span>
          </span>
        ) : (
          <span>Next step fires once he has been quiet long enough.</span>
        )}
      </div>
    </div>
  );
}
