/** Server gate for native memory and automation routes. Purpose transport lives in the route adapters. */
import { NextResponse, type NextRequest } from "next/server";
import { PRIVATE_HEADERS, requireOnlyFansRead, requestId, type ReadContext } from "@/lib/onlyfans/route";
import { B_CONTRACT_SCHEMA } from "./b-common";
import { trustedFormOrigin } from "@/lib/form-origin";

export const bAnswer = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json({ ...body, schemaVersion: B_CONTRACT_SCHEMA }, { status, headers: PRIVATE_HEADERS });
export const bRefuse = (status: number, error: string, code = "refused") => bAnswer({ ok: false, code, error }, status);
export const bPending = (contract: string) => bAnswer({ ok: false, code: "contract_pending", contract,
  error: "The backend contract for this feature is not delivered yet. Nothing was changed." }, 501);

/** Authenticate, scope the account id, and for writes require a manager plus same-origin JSON. */
export async function bGate(request: NextRequest, rawAccountId: string, write: boolean, capability: "chat" | "manage" = "manage"):
  Promise<{ ctx: ReadContext; accountId: string } | NextResponse> {
  const ctx = await requireOnlyFansRead({ agency: true, write, capability });
  if (ctx instanceof NextResponse) return ctx;
  const accountId = requestId(rawAccountId);
  if (!accountId) return bRefuse(400, "That account reference is invalid.", "invalid_request");
  if (write) {
    if (!(capability === "chat" ? ctx.canChat : ctx.canManage) || !ctx.actor) return bRefuse(403, "Your team access is read-only.", "agency_read_only");
    if (!trustedFormOrigin(request) || ![null, "same-origin"].includes(request.headers.get("sec-fetch-site")) ||
        request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
      return bRefuse(403, "This change must be requested from this dashboard.");
  }
  return { ctx, accountId };
}
