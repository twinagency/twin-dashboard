import { NextResponse } from "next/server";
import { getRun } from "@/lib/mtproto/runs";
import { listEpisodesForRun } from "@/lib/mtproto/episodes";
import { buildSendRows, sendsToCsv } from "@/lib/mtproto/sends";
import { listCreators } from "@/lib/mtproto/clones";

export const dynamic = "force-dynamic";

// CSV export for the sends table (N2.4). Not under app/api/admin/v1/ or
// app/api/v1/, so it inherits the ordinary session-cookie gate from
// middleware.ts, exactly like the JSON events poll route.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await getRun(id);
  if (!run) return NextResponse.json({ error: "run not found" }, { status: 404 });
  const [{ episodes }, creators] = await Promise.all([listEpisodesForRun(id), listCreators()]);
  const rows = await buildSendRows(episodes, creators);
  const csv = sendsToCsv(rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mtproto-run-${id}-sends.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
