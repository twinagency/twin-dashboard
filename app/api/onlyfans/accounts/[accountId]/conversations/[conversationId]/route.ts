import { NextResponse } from "next/server";
import { readConversation } from "@/lib/onlyfans/reads";
import { badRequest, readResponse, requestId, requireOnlyFansRead } from "@/lib/onlyfans/route";

// GET /api/onlyfans/accounts/<accountId>/conversations/<conversationId>
//
// One conversation and its messages. Because a conversation id is only unique
// within an account, both halves are required, and the read service refuses an
// answer whose conversation does not belong to the account that was asked for.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ accountId: string; conversationId: string }> },
) {
  const context = await requireOnlyFansRead();
  if (context instanceof NextResponse) return context;

  const { accountId, conversationId } = await params;
  if (!requestId(accountId)) return badRequest("That account reference is not valid.");
  if (!requestId(conversationId)) return badRequest("That conversation reference is not valid.");

  const result = await readConversation(context, { accountId, conversationId });
  return readResponse(result);
}
