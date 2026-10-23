/** Server gate for launch routes under memory/, automation/ and personality/. Every route here answers from a delivered backend contract. */
import { NextResponse, type NextRequest } from "next/server";
import { PRIVATE_HEADERS, requireOnlyFansRead, requestId } from "@/lib/onlyfans/route";
import { readCommandJson } from "@/lib/onlyfans/command-json";
import { B_CONTRACT_SCHEMA } from "./b-common";
import { fail, type Ans, type Env } from "./live/upstream";

export const bAnswer = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json({ schemaVersion: B_CONTRACT_SCHEMA, ...body }, { status, headers: PRIVATE_HEADERS });
export const bRefuse = (status: number, error: string, code = "refused") => bAnswer({ ok: false, code, error }, status);
const send = (a: Ans) => bAnswer(a.body, a.status);

/** Authenticate, scope the account id, and for writes require a manager plus same-origin JSON. */
export async function bGate(request: NextRequest, rawAccountId: string, write: boolean) {
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
  const env: Env = { fetch: ctx.fetch, accountId, actor: ctx.actor, canManage: ctx.canManage, agency: !!ctx.auth.agencyGrant };
  return { ctx, accountId, env };
}

/** Runs one live handler behind the gate. The actor and permission come from the server session, never from the body. */
export async function liveRoute(request: NextRequest, rawAccountId: string, write: boolean,
  run: (env: Env, body: unknown, ctx: Exclude<Awaited<ReturnType<typeof bGate>>, NextResponse>["ctx"]) => Promise<Ans>) {
  const gate = await bGate(request, rawAccountId, write);
  if (gate instanceof NextResponse) return gate;
  let body: unknown;
  if (write) { try { body = await readCommandJson(request, 65_536); } catch { return send(fail(400, "That request is invalid.", "invalid_request")); } }
  return send(await run(gate.env, body, gate.ctx));
}
