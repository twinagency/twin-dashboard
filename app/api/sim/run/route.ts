import { NextRequest, NextResponse } from "next/server";
import { runSim } from "@/lib/sim";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const cloneId = body?.cloneId as string | undefined;
  const personaKey = body?.personaKey as string | undefined;
  const turns = Number(body?.turns ?? 6);
  if (!cloneId || !personaKey) return NextResponse.json({ error: "cloneId and personaKey are required" }, { status: 400 });

  try {
    const transcript = await runSim({ cloneId, personaKey, turns });
    return NextResponse.json({ transcript });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "sim failed" }, { status: 500 });
  }
}
