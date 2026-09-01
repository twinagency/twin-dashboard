import { NextRequest } from "next/server";
import { runSim } from "@/lib/sim";

// NDJSON stream, one line per turn as it finishes generating — so the UI can
// tick messages in as they arrive instead of showing nothing until the whole
// run is done.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const cloneId = body?.cloneId as string | undefined;
  const personaKey = body?.personaKey as string | undefined;
  const turns = Number(body?.turns ?? 6);
  if (!cloneId || !personaKey) {
    return new Response(JSON.stringify({ error: "cloneId and personaKey are required" }), { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const turn of runSim({ cloneId, personaKey, turns })) {
          controller.enqueue(encoder.encode(JSON.stringify({ type: "turn", turn }) + "\n"));
        }
        controller.enqueue(encoder.encode(JSON.stringify({ type: "done" }) + "\n"));
      } catch (e) {
        controller.enqueue(
          encoder.encode(JSON.stringify({ type: "error", message: e instanceof Error ? e.message : "sim failed" }) + "\n"),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "content-type": "application/x-ndjson" } });
}
