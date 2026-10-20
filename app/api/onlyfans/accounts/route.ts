import { NextResponse } from "next/server";
import { readAccounts } from "@/lib/onlyfans/reads";
import { badRequest, readResponse, requestId, requireOnlyFansRead } from "@/lib/onlyfans/route";

// GET /api/onlyfans/accounts?creator=<id>&account=<id>
//
// The authorized accounts and their connection health. `creator` and `account`
// are requests: the backend owns the creator/account bindings and answers with
// what this operator may read. With no backend configured the answer is an
// explicit `unavailable`, never fixtures.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const context = await requireOnlyFansRead({ agency: true });
  if (context instanceof NextResponse) return context;

  const url = new URL(request.url);
  const rawCreator = url.searchParams.get("creator");
  const rawAccount = url.searchParams.get("account");
  const creatorId = rawCreator ? requestId(rawCreator) : null;
  const accountId = rawAccount ? requestId(rawAccount) : null;
  if (rawCreator !== null && creatorId === null) return badRequest("That creator reference is not valid.");
  if (rawAccount !== null && accountId === null) return badRequest("That account reference is not valid.");

  const result = await readAccounts(context, { creatorId, accountId });
  return readResponse(result);
}
