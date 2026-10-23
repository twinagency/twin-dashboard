import type { NextRequest } from "next/server";
import { memoryFans } from "@/lib/onlyfans/launch/b-native-routes";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ accountId: string }> }) {
  const p = await context.params;
  return memoryFans(request, p.accountId);
}
