import type { NextRequest } from "next/server";
import { activationCommand } from "@/lib/onlyfans/activation-route";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ accountId: string; operation: string }> }) {
  const { accountId, operation } = await context.params;
  return activationCommand(request, accountId, operation);
}
