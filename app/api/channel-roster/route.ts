import { NextResponse } from "next/server";
import { requireOnlyFansRead, PRIVATE_HEADERS } from "@/lib/onlyfans/route";
import { readChannelRoster } from "@/lib/channel-workspace/roster";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const context = await requireOnlyFansRead();
  if (context instanceof NextResponse) return context;
  const channel = new URL(request.url).searchParams.get("channel") ?? "all";
  if (channel !== "all" && channel !== "telegram" && channel !== "onlyfans") return NextResponse.json({ error: "Choose a valid channel." }, { status: 400, headers: PRIVATE_HEADERS });
  return NextResponse.json(await readChannelRoster(context, channel), { headers: PRIVATE_HEADERS });
}
