import type { NextRequest } from "next/server";
import { liveRoute } from "@/lib/onlyfans/launch/b-route";
import { recoveryRead } from "@/lib/onlyfans/launch/live/memory";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Ctx = { params: Promise<{ accountId: string }> };
/** History recovery progress for the account (observed counts only). */
export async function GET(request: NextRequest, context: Ctx) {
  return liveRoute(request, (await context.params).accountId, false, env => recoveryRead(env));
}
