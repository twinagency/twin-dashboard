import type { NextRequest } from "next/server";
import { memoryFan } from "@/lib/onlyfans/launch/b-native-routes";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ accountId: string; fanId: string }> }) {
  const p = await context.params;
  return memoryFan(request, p.accountId, p.fanId);
}
export async function PATCH(request: NextRequest, context: { params: Promise<{ accountId: string; fanId: string }> }) {
  const p = await context.params;
  return memoryFan(request, p.accountId, p.fanId, true);
}
