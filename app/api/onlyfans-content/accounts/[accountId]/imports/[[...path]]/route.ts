import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireOnlyFansRead, requestId, PRIVATE_HEADERS } from "@/lib/onlyfans/route";
import { readCommandJson } from "@/lib/onlyfans/command-json";
import { canonicalContent } from "@/lib/onlyfans/content";
import { trustedFormOrigin } from "@/lib/form-origin";
import { configuredOfferImportBackend } from "@/lib/onlyfans/offer-import-backend";
import { IMPORT_SCHEMA, candidateId, commandKey, importJobId, validCancelRequest, validDraftRequest, validJobRequest } from "@/lib/onlyfans/offer-import";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ accountId: string; path?: string[] }> };
const answer = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
const refuse = (status: number, error: string) => answer({ schemaVersion: IMPORT_SCHEMA, ok: false, outcome: "refused", error }, status);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export async function GET(request: NextRequest, context: Context) {
  const ctx = await requireOnlyFansRead({ agency: true }); if (ctx instanceof NextResponse) return ctx;
  const { accountId: rawAccount, path = [] } = await context.params;
  const accountId = requestId(rawAccount); if (!accountId) return refuse(400, "That account reference is invalid.");
  const backend = configuredOfferImportBackend(ctx.fetch); if (!backend) return refuse(503, "Offer import is not configured.");
  let result;
  if (path.length === 2 && path[0] === "jobs" && importJobId(path[1])) result = await backend.job(accountId, path[1]);
  else if (path.length === 3 && path[0] === "jobs" && importJobId(path[1]) && path[2] === "candidates") {
    const after = request.nextUrl.searchParams.get("after");
    if (after !== null && !candidateId(after)) return refuse(400, "That page cursor is invalid.");
    result = await backend.candidates(accountId, path[1], after);
  } else if (path.length === 4 && path[0] === "jobs" && importJobId(path[1]) && path[2] === "candidates" && candidateId(path[3]))
    result = await backend.candidate(accountId, path[1], path[3]);
  else if (path.length === 2 && path[0] === "commands" && commandKey(path[1])) result = await backend.command(accountId, path[1]);
  else return refuse(404, "That import resource is not available.");
  return result.ok ? answer({ schemaVersion: IMPORT_SCHEMA, ok: true, accountId, data: result.data }) : refuse(result.status, result.error);
}

export async function POST(request: NextRequest, context: Context) {
  const ctx = await requireOnlyFansRead({ agency: true, write: true }); if (ctx instanceof NextResponse) return ctx;
  if (!ctx.canManage || !ctx.actor) return refuse(403, "Your team access is read-only.");
  if (!trustedFormOrigin(request) || ![null, "same-origin"].includes(request.headers.get("sec-fetch-site")) ||
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return refuse(403, "Manage imports from this dashboard.");
  const { accountId: rawAccount, path = [] } = await context.params;
  const accountId = requestId(rawAccount); if (!accountId) return refuse(400, "That account reference is invalid.");
  let body: unknown;
  try { body = await readCommandJson(request, 131_072); }
  catch (error) { return refuse(error instanceof Error && error.message === "Command is too large" ? 413 : 400, "That import request is invalid."); }
  const backend = configuredOfferImportBackend(ctx.fetch); if (!backend) return refuse(503, "Offer import is not configured.");
  const actor = ctx.actor;
  // Command keys are derived server-side from the actor and the exact body, so a
  // retry of the same request after a lost reply resolves to the same command.
  const key = (...parts: unknown[]) => digest(canonicalContent([actor, accountId, ...parts]));
  let result;
  if (path.length === 1 && path[0] === "jobs") {
    if (!validJobRequest(body)) return refuse(400, "That import job request is invalid.");
    result = await backend.startJob(accountId, { mode: body.mode, sources: body.sources, commandKey: key("job", body), actor });
  } else if (path.length === 3 && path[0] === "jobs" && importJobId(path[1]) && path[2] === "cancel") {
    if (!validCancelRequest(body)) return refuse(400, "That cancel request is invalid.");
    result = await backend.cancel(accountId, path[1], { expectedRevision: body.expectedRevision, actor });
  } else if (path.length === 1 && path[0] === "drafts") {
    if (!validDraftRequest(body)) return refuse(400, "Each draft needs an exact source, a reviewed description and both confirmations.");
    result = await backend.drafts(accountId, body.drafts.map(draft => ({ ...draft, commandKey: key("draft", draft) })), actor);
  } else return refuse(404, "That import resource is not available.");
  return result.ok ? answer({ schemaVersion: IMPORT_SCHEMA, ok: true, accountId, data: result.data })
    : answer({ schemaVersion: IMPORT_SCHEMA, ...result }, result.status);
}
