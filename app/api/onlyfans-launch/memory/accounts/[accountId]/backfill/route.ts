import type { NextRequest } from "next/server";
import { liveRoute } from "@/lib/onlyfans/launch/b-route";
import { backfillRequest } from "@/lib/onlyfans/launch/live/memory";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Ctx = { params: Promise<{ accountId: string }> };
/** Asks the worker to resume history recovery. Recorded as a request only. */
export async function POST(request: NextRequest, context: Ctx) {
  return liveRoute(request, (await context.params).accountId, true, (env, body) => backfillRequest(env, body));
}
