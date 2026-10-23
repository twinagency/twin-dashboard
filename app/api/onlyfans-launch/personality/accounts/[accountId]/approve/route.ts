import type { NextRequest } from "next/server";
import { liveRoute } from "@/lib/onlyfans/launch/b-route";
import { personalityCommand, personalityRead, type PersonalityAction } from "@/lib/onlyfans/launch/live/personality";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Ctx = { params: Promise<{ accountId: string }> };
export async function POST(request: NextRequest, context: Ctx) {
  return liveRoute(request, (await context.params).accountId, true, (env, body) => personalityCommand(env, "approve" satisfies PersonalityAction, body));
}
