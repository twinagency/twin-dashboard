import type { NextRequest } from "next/server";
import { liveRoute } from "@/lib/onlyfans/launch/b-route";
import { fanCorrect, fanRead } from "@/lib/onlyfans/launch/live/memory";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Ctx = { params: Promise<{ accountId: string; fanId: string }> };
export async function GET(request: NextRequest, context: Ctx) {
  const { accountId, fanId } = await context.params;
  return liveRoute(request, accountId, false, env => fanRead(env, fanId));
}
export async function PATCH(request: NextRequest, context: Ctx) {
  const { accountId, fanId } = await context.params;
  return liveRoute(request, accountId, true, (env, body) => fanCorrect(env, fanId, body));
}
