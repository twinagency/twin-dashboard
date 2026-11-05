import type { NextRequest } from "next/server";
import { activationStatus } from "@/lib/onlyfans/activation-route";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ accountId: string }> }) {
  return activationStatus(request, (await context.params).accountId);
}
