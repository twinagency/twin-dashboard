"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { ReengageEvent } from "@/lib/mtproto/types";

const POLL_MS = 4_000;

// Polling live feed (N2.3). "Polling that pauses when the tab is hidden is
// fine" — same idea as app/logs/AutoRefresh.tsx, inlined here rather than
// imported since this component also needs to ACCUMULATE events across
// ticks (an id cursor), not just trigger a server-component refresh.
export default function LiveFeed({ runId }: { runId: string }) {
  const [events, setEvents] = useState<ReengageEvent[]>([]);
  const cursorRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (document.hidden) return;
      const params = new URLSearchParams({ runId });
      if (cursorRef.current != null) params.set("afterId", String(cursorRef.current));
      try {
        const res = await fetch(`/mtproto-campaign/live?${params}`, { cache: "no-store" });
        if (!res.ok) return;
        const { events: batch } = (await res.json()) as { events: ReengageEvent[] };
        if (cancelled || batch.length === 0) return;
        cursorRef.current = batch[batch.length - 1].id;
        setEvents((prev) => [...prev, ...batch].slice(-200));
      } catch {
        // A transient fetch failure just means this tick is skipped; the next
        // one retries. Never throw out of a poll loop.
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
        {events.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No events yet.</div>
        ) : (
          <ul className="max-h-96 space-y-1 overflow-y-auto text-xs">
            {[...events]
              .slice()
              .reverse()
              .map((e) => (
                <li key={e.id} className="flex items-center gap-2 rounded px-2 py-1 odd:bg-muted/20">
                  <span className="w-20 shrink-0 text-muted-foreground">{new Date(e.ts).toLocaleTimeString()}</span>
                  <span className="w-40 shrink-0 font-medium">{e.eventType}</span>
                  <span className="truncate text-muted-foreground">{JSON.stringify(e.detail)}</span>
                </li>
              ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
