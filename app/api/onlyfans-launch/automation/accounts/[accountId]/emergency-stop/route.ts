import type { NextRequest } from "next/server";
import { liveRoute } from "@/lib/onlyfans/launch/b-route";
import { stopControl, type ConnectionPort } from "@/lib/onlyfans/launch/live/engagement";
import { configuredConnectionBackend } from "@/lib/onlyfans-connections/backend";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Ctx = { params: Promise<{ accountId: string }> };
/** scope "engagement" stops proactive messages; scope "account" pauses the connection (Twin operator only). Success only when the backend recorded it. */
export async function POST(request: NextRequest, context: Ctx) {
  return liveRoute(request, (await context.params).accountId, true, (env, body) => stopControl(env, body, configuredConnectionBackend() as unknown as ConnectionPort | null));
}
