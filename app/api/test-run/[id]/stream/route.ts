import { NextRequest } from "next/server";
import { readEvents, safeRunId, getTestRun } from "@/lib/test-runs";

export const dynamic = "force-dynamic";

// GET /api/test-run/[id]/stream — Server-Sent Events tail of a run's
// events.ndjson. Reconnect-safe: replays every event seen so far on connect,
// then polls the file for new lines. Closes once the run's "done" event
// lands, at which point the row is also finalized in the DB (see
// reconcileRun in lib/test-runs.ts) so history no longer depends on this
// stream ever having been opened.
//
// The run itself is a detached child process that keeps going whether or not
// anything is listening here — closing this tab, or never opening it, does
// not stop or lose the run. Re-opening the Test page and re-subscribing picks
// up wherever the transcript is.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const safeId = safeRunId(id);
  if (!safeId) return new Response("invalid run id", { status: 400 });

  const encoder = new TextEncoder();
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          closed = true;
        }
      };

      let sentCount = 0;
      const tick = async () => {
        if (closed) return;
        const events = readEvents(safeId);
        for (; sentCount < events.length; sentCount++) send({ type: "event", event: events[sentCount] });

        const done = events.some((e) => e.t === "done");
        if (done) {
          const row = await getTestRun(safeId); // finalizes the DB row as a side effect
          send({ type: "status", status: row?.status ?? "done" });
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed client-side
          }
          return;
        }
        timer = setTimeout(tick, 1200);
      };
      void tick();
    },
    cancel() {
      closed = true;
      if (timer) clearTimeout(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
