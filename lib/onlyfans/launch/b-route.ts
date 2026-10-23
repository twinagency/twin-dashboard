/** Server gate for launch B routes (memory/ and automation/). Contracts that are not delivered answer 501 contract_pending. */
import { NextResponse, type NextRequest } from "next/server";
import { PRIVATE_HEADERS, requireOnlyFansRead, requestId, type ReadContext } from "@/lib/onlyfans/route";
import { B_CONTRACT_SCHEMA } from "./b-common";

export const bAnswer = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json({ schemaVersion: B_CONTRACT_SCHEMA, ...body }, { status, headers: PRIVATE_HEADERS });
export const bRefuse = (status: number, error: string, code = "refused") => bAnswer({ ok: false, code, error }, status);
export const bPending = (contract: string) => bAnswer({ ok: false, code: "contract_pending", contract,
  error: "The backend contract for this feature is not delivered yet. Nothing was changed." }, 501);

/** Authenticate, scope the account id, and for writes require a manager plus same-origin JSON. */
export async function bGate(request: NextRequest, rawAccountId: string, write: boolean):
  Promise<{ ctx: ReadContext; accountId: string } | NextResponse> {
  const ctx = await requireOnlyFansRead({ agency: true, write });
  if (ctx instanceof NextResponse) return ctx;
  const accountId = requestId(rawAccountId);
  if (!accountId) return bRefuse(400, "That account reference is invalid.", "invalid_request");
  if (write) {
    if (!ctx.canManage || !ctx.actor) return bRefuse(403, "Your team access is read-only.", "agency_read_only");
    const origin = `${request.nextUrl.protocol}//${request.headers.get("host")}`;
    if (request.headers.get("origin") !== origin || ![null, "same-origin"].includes(request.headers.get("sec-fetch-site")) ||
        request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
      return bRefuse(403, "This change must be requested from this dashboard.");
  }
  return { ctx, accountId };
}
