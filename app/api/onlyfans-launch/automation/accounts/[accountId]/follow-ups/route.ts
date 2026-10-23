import type { NextRequest } from "next/server";
import { liveRoute } from "@/lib/onlyfans/launch/b-route";
import { engagementCancel, engagementRead } from "@/lib/onlyfans/launch/live/engagement";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Ctx = { params: Promise<{ accountId: string }> };
export async function GET(request: NextRequest, context: Ctx) {
  return liveRoute(request, (await context.params).accountId, false, env => engagementRead(env));
}
export async function POST(request: NextRequest, context: Ctx) {
  return liveRoute(request, (await context.params).accountId, true, (env, body) => engagementCancel(env, body));
}
