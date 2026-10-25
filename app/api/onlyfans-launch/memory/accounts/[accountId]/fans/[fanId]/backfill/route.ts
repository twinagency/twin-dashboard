import type { NextRequest } from "next/server";
import { historyBackfill } from "@/lib/onlyfans/launch/b-native-routes";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ accountId: string; fanId: string }> }) {
  const p = await context.params;
  return historyBackfill(request, p.accountId, p.fanId);
}
