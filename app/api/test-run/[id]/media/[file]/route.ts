import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { runDir, safeRunId } from "@/lib/test-runs";

export const dynamic = "force-dynamic";

// GET /api/test-run/[id]/media/[file] — serves a voice note a sim run
// synthesized for real (ElevenLabs bytes written to <run dir>/voice-N.ogg by
// bot/src/dev/test-run.ts). These files only ever exist inside a run's own
// throwaway directory, never in Supabase storage, so this is the only way to
// play one back.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await params;
  const safeId = safeRunId(id);
  if (!safeId || !/^voice-\d+\.ogg$/.test(file)) return new NextResponse("not found", { status: 404 });
  const p = path.join(runDir(safeId), file);
  if (!fs.existsSync(p)) return new NextResponse("not found", { status: 404 });
  const bytes = fs.readFileSync(p);
  return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": "audio/ogg" } });
}
