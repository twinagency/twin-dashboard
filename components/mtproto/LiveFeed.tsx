"use client";

import { useEffect, useRef, useState } from "react";
import { describeEvent } from "@/lib/mtproto/event-format";
import type { ReengageEvent } from "@/lib/mtproto/types";
import { EmptyBlock, Notice, Panel, Skeleton } from "./kit";
import { eventInfo, type Tone } from "./view";

const POLL_MS = 4_000;

const DOT: Record<Tone, string> = { neutral: "bg-muted/50", good: "bg-good", warn: "bg-warn", crit: "bg-crit", info: "bg-info", accent: "bg-accent" };

// Polling live feed (N2.3). "Polling that pauses when the tab is hidden is
// fine" — same idea as app/logs/AutoRefresh.tsx, inlined here rather than
// imported since this component also needs to ACCUMULATE events across
// ticks (an id cursor), not just trigger a server-component refresh.
export default function LiveFeed({ runId }: { runId: string }) {
  const [events, setEvents] = useState<ReengageEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const cursorRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (document.hidden) return;
      const params = new URLSearchParams({ runId });
      if (cursorRef.current != null) params.set("afterId", String(cursorRef.current));
      try {
        const res = await fetch(`/mtproto-campaign/live?${params}`, { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setFeedError(`live feed unavailable (${res.status})`);
          return;
        }
        const { events: batch } = (await res.json()) as { events: ReengageEvent[] };
        if (cancelled) return;
        setFeedError(null);
        setLoaded(true);
        if (batch.length === 0) return;
        // The first page arrives newest-first, later pages oldest-first: never
        // trust position. Cursor = highest id seen; merge de-duplicated by id.
        cursorRef.current = Math.max(cursorRef.current ?? 0, ...batch.map((b) => b.id));
        setEvents((prev) => {
          const byId = new Map(prev.map((p) => [p.id, p]));
          for (const b of batch) byId.set(b.id, b);
          return [...byId.values()].sort((a, b) => a.id - b.id).slice(-200);
        });
      } catch {
        // A transient fetch failure just means this tick is skipped; the next
        // one retries. Never throw out of a poll loop, but say so on screen.
        if (!cancelled) setFeedError("live feed disconnected, retrying");
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [runId]);

  return (
    <Panel
      title="Live feed"
      tip="Newest events as they land: who was messaged, who replied, who bought. Updates by itself every few seconds while this tab is open."
      actions={
        <span className="flex items-center gap-1.5 text-[11px] text-muted">
          <span aria-hidden className={`size-1.5 rounded-full ${feedError ? "bg-warn" : "animate-pulse bg-good"}`} />
          {feedError ? "reconnecting" : "live"}
        </span>
      }
    >
      {feedError && <Notice tone="warn" className="mb-3">{feedError}</Notice>}
      {!loaded && events.length === 0 && !feedError ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-4/5" />
        </div>
      ) : events.length === 0 ? (
        <EmptyBlock icon="◌" title="No events yet" hint="Events appear here the moment the sender does something for this run." />
      ) : (
        <ul className="max-h-96 space-y-1 overflow-y-auto">
          {[...events]
            .slice()
            .reverse()
            .map((e) => {
              const d = describeEvent(e);
              const info = eventInfo(e.eventType);
              const tone: Tone = d?.danger ? "crit" : info.tone;
              return (
                <li key={e.id} className={`flex gap-2.5 rounded-lg px-2.5 py-2 text-xs ${d?.danger ? "bg-crit/10" : "odd:bg-muted/5"}`}>
                  <span aria-hidden className={`mt-1 size-2 shrink-0 rounded-full ${DOT[tone]}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className={`font-semibold ${d?.danger ? "text-crit" : "text-ink"}`} title={e.eventType}>{info.label}</span>
                      <span className="text-muted" suppressHydrationWarning>{new Date(e.ts).toLocaleTimeString()}</span>
                    </div>
                    <div className={`break-words ${d ? (d.danger ? "font-medium text-crit" : "text-ink") : "truncate font-mono text-[11px] text-muted"}`}>{d ? d.text : JSON.stringify(e.detail)}</div>
                  </div>
                </li>
              );
            })}
        </ul>
      )}
    </Panel>
  );
}
