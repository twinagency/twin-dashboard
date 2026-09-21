"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { describeEvent } from "@/lib/mtproto/event-format";
import type { ReengageEvent } from "@/lib/mtproto/types";

const POLL_MS = 4_000;

// Polling live feed (N2.3). "Polling that pauses when the tab is hidden is
// fine" — same idea as app/logs/AutoRefresh.tsx, inlined here rather than
// imported since this component also needs to ACCUMULATE events across
// ticks (an id cursor), not just trigger a server-component refresh.
export default function LiveFeed({ runId }: { runId: string }) {
  const [events, setEvents] = useState<ReengageEvent[]>([]);
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
    <Card>
      <CardHeader>
        <CardTitle>Live feed</CardTitle>
        <CardDescription>Newest events as they land — who was hit, replies, purchases.</CardDescription>
      </CardHeader>
      <CardContent>
        {feedError && <div className="mb-2 rounded-md border border-warn/40 bg-warn/10 px-2 py-1 text-xs text-warn">{feedError}</div>}
        {events.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No events yet.</div>
        ) : (
          <ul className="max-h-96 space-y-1 overflow-y-auto text-xs">
            {[...events]
              .slice()
              .reverse()
              .map((e) => {
                const d = describeEvent(e);
                return (
                  <li key={e.id} className={`flex items-center gap-2 rounded px-2 py-1 ${d?.danger ? "bg-destructive/10" : "odd:bg-muted/20"}`}>
                    <span className="w-20 shrink-0 text-muted-foreground">{new Date(e.ts).toLocaleTimeString()}</span>
                    <span className={`w-40 shrink-0 font-medium ${d?.danger ? "text-destructive" : ""}`}>{e.eventType}</span>
                    <span className={d ? (d.danger ? "font-medium text-destructive" : "") : "truncate text-muted-foreground"}>{d ? d.text : JSON.stringify(e.detail)}</span>
                  </li>
                );
              })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
