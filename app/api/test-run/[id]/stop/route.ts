import { NextRequest, NextResponse } from "next/server";
import { stopTestRun } from "@/lib/test-runs";

export const dynamic = "force-dynamic";

// POST /api/test-run/[id]/stop — SIGTERMs the run's child process (if still
// alive) and marks it stopped with whatever transcript exists so far. A run
// left completely alone also finishes fine on its own; this is just for an
// operator who wants to cut one short.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await stopTestRun(id);
  return NextResponse.json({ ok: true });
}
