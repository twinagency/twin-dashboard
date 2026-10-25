import { NextResponse } from "next/server";
import { readConversations } from "@/lib/onlyfans/reads";
import { badRequest, readResponse, requestId, requireOnlyFansRead } from "@/lib/onlyfans/route";

// GET /api/onlyfans/accounts/<accountId>/conversations?cursor=<cursor>
//
// One cursor-paged page of conversations for one account. The account id is a
// request: the backend decides whether this operator may read it, and the read
// service refuses an answer that carries rows belonging to a different account.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  const context = await requireOnlyFansRead({ agency: true });
  if (context instanceof NextResponse) return context;

  const { accountId } = await params;
  if (!requestId(accountId)) return badRequest("That account reference is not valid.");

  const url = new URL(request.url);
  const rawCursor = url.searchParams.get("cursor");
  const cursor = rawCursor ? requestId(rawCursor) : null;
  if (rawCursor !== null && cursor === null) return badRequest("That page reference is not valid.");

  const result = await readConversations(context, { accountId, cursor });
  return readResponse(result);
}
