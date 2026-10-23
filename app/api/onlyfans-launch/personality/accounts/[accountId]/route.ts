import type { NextRequest } from "next/server";
import { liveRoute } from "@/lib/onlyfans/launch/b-route";
import { personalityCommand, personalityRead, type PersonalityAction } from "@/lib/onlyfans/launch/live/personality";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Ctx = { params: Promise<{ accountId: string }> };
export async function GET(request: NextRequest, context: Ctx) {
  return liveRoute(request, (await context.params).accountId, false, env => personalityRead(env, {}));
}
