/** Authentication and request hygiene shared by the Plan C proxy routes. The backend token is read here and never leaves the server. */
import { NextResponse, type NextRequest } from "next/server";
import { authorizeOnlyFansRead, requestId, PRIVATE_HEADERS } from "./route";
import { readCommandJson, CommandBodyTooLarge } from "./command-json";
import { trustedFormOrigin } from "@/lib/form-origin";
import { configuredPlanCBackend, type PlanCBackend } from "./plan-c-backend";
import { PLAN_C_MAX_BODY_BYTES } from "./plan-c";
import { planCOperatorOnly, planCRefused, type PlanCHttp } from "./plan-c-route";

export const planCJson = (result: PlanCHttp) => NextResponse.json(result.body, { status: result.status, headers: PRIVATE_HEADERS });
const refuse = (status: number, error: string) => planCJson(planCRefused(status, error));

export type PlanCRequestContext = { actor: string; accountId: string; backend: PlanCBackend; body?: unknown };

/**
 * Operator only (not agency, not view-as), a configured backend, a valid account id and, for a write, a same-origin JSON body of at most 8 KB.
 * Returns a response to send when any of that fails, so a route cannot forget a gate.
 */
export async function planCGate(request: NextRequest, rawAccountId: string, write: boolean): Promise<PlanCRequestContext | NextResponse> {
  // `agency: false` keeps every agency identity out; planCOperatorOnly then insists on the internal operator session.
  const ctx = await authorizeOnlyFansRead({ agency: false, write, pilotIdentity: true });
  // Raised before any upstream call, so nothing was applied: tagged as a Plan C refusal, never left to the client to infer.
  if ("ok" in ctx) return refuse(ctx.status, ctx.error);
  const operator = planCOperatorOnly(ctx);
  if (!operator.ok) return refuse(operator.status, operator.error);
  const accountId = requestId(rawAccountId);
  if (!accountId) return refuse(400, "That account reference is invalid.");
  const backend = configuredPlanCBackend();
  if (!backend) return refuse(503, "Plan C approvals are not configured.");
  if (!write) return { actor: operator.actor, accountId, backend };
  if (!trustedFormOrigin(request) || ![null, "same-origin"].includes(request.headers.get("sec-fetch-site")) ||
      request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    return refuse(403, "This change must be requested from this dashboard.");
  let body: unknown;
  try { body = await readCommandJson(request, PLAN_C_MAX_BODY_BYTES); }
  catch (error) { return refuse(error instanceof CommandBodyTooLarge ? 413 : 400, "That request is invalid."); }
  return { actor: operator.actor, accountId, backend, body };
}
