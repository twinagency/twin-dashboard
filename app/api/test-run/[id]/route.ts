import { NextRequest, NextResponse } from "next/server";
import { getTestRun } from "@/lib/test-runs";

export const dynamic = "force-dynamic";

// GET /api/test-run/[id] — a single run's current row (status, summary, and
// once finished the full transcript). Used for the non-streaming fallback
// and by the history view. Live runs are better watched via .../stream.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await getTestRun(id);
  if (!run) return NextResponse.json({ error: "run not found" }, { status: 404 });
  return NextResponse.json({ run });
}
