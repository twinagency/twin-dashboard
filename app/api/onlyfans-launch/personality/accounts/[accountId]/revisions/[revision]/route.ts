import type { NextRequest } from "next/server";
import { liveRoute } from "@/lib/onlyfans/launch/b-route";
import { personalityCommand, personalityRead, type PersonalityAction } from "@/lib/onlyfans/launch/live/personality";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Ctx = { params: Promise<{ accountId: string; revision: string }> };
export async function GET(request: NextRequest, context: Ctx) {
  const { accountId, revision } = await context.params;
  return liveRoute(request, accountId, false, env => personalityRead(env, { revision }));
}
