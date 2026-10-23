import type { NextRequest } from "next/server";
import { engagementActions } from "@/lib/onlyfans/launch/b-native-routes";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ accountId: string }> }) {
  const p = await context.params;
  return engagementActions(request, p.accountId);
}
export async function POST(request: NextRequest, context: { params: Promise<{ accountId: string }> }) {
  const p = await context.params;
  return engagementActions(request, p.accountId, true);
}
