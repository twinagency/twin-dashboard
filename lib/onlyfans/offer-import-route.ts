import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireOnlyFansRead, requestId, PRIVATE_HEADERS } from "./route";
import { readCommandJson } from "./command-json";
import { canonicalContent } from "./content";
import { trustedFormOrigin } from "@/lib/form-origin";
import { configuredOfferImportBackend } from "./offer-import-backend";
import { IMPORT_SCHEMA, candidateId, commandKey, importJobId, validCancelRequest, validDraftRequest, validJobRequest } from "./offer-import";

export type ImportContext = { params: Promise<{ accountId: string; path?: string[] }> };
export type ImportBackend = NonNullable<ReturnType<typeof configuredOfferImportBackend>>;
export type ImportCall = { method: "GET" | "POST"; accountId: string; path: string[]; after: string | null; actor: string | null; canManage: boolean; body?: unknown };
export type ImportAnswer = { status: number; body: unknown };
const answer = (result: ImportAnswer) => NextResponse.json(result.body, { status: result.status, headers: PRIVATE_HEADERS });
const refuse = (status: number, error: string): ImportAnswer => ({ status, body: { schemaVersion: IMPORT_SCHEMA, ok: false, outcome: "refused", error } });
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

/** Pure routing: validates the path and body, derives identity and builds the exact backend command. */
export async function dispatchImport(call: ImportCall, backend: ImportBackend): Promise<ImportAnswer> {
  const { accountId, path } = call;
  let result;
  if (call.method === "GET") {
    if (path.length === 2 && path[0] === "jobs" && importJobId(path[1])) result = await backend.job(accountId, path[1]);
    else if (path.length === 3 && path[0] === "jobs" && importJobId(path[1]) && path[2] === "candidates") {
      if (call.after !== null && !candidateId(call.after)) return refuse(400, "That page cursor is invalid.");
      result = await backend.candidates(accountId, path[1], call.after);
    } else if (path.length === 4 && path[0] === "jobs" && importJobId(path[1]) && path[2] === "candidates" && candidateId(path[3]))
      result = await backend.candidate(accountId, path[1], path[3]);
    else if (path.length === 2 && path[0] === "commands" && commandKey(path[1])) result = await backend.command(accountId, path[1]);
    else return refuse(404, "That import resource is not available.");
    return result.ok ? { status: 200, body: { schemaVersion: IMPORT_SCHEMA, ok: true, accountId, data: result.data } } : refuse(result.status, result.error);
  }
  if (!call.canManage || !call.actor) return refuse(403, "Your team access is read-only.");
  const actor = call.actor, body = call.body;
  // Command keys are derived server-side from the actor and the exact body, so a
  // retry of the same request after a lost reply resolves to the same command.
  const key = (...parts: unknown[]) => digest(canonicalContent([actor, accountId, ...parts]));
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
  return result.ok ? { status: 200, body: { schemaVersion: IMPORT_SCHEMA, ok: true, accountId, data: result.data } }
    : { status: result.status, body: { schemaVersion: IMPORT_SCHEMA, ...result } };
}

export async function handleImportRead(request: NextRequest, context: ImportContext) {
  const ctx = await requireOnlyFansRead({ agency: true }); if (ctx instanceof NextResponse) return ctx;
  const { accountId: rawAccount, path = [] } = await context.params;
  const accountId = requestId(rawAccount); if (!accountId) return answer(refuse(400, "That account reference is invalid."));
  const backend = configuredOfferImportBackend(ctx.fetch); if (!backend) return answer(refuse(503, "Offer import is not configured."));
  return answer(await dispatchImport({ method: "GET", accountId, path, after: request.nextUrl.searchParams.get("after"), actor: ctx.actor, canManage: ctx.canManage }, backend));
}

export async function handleImportWrite(request: NextRequest, context: ImportContext) {
  const ctx = await requireOnlyFansRead({ agency: true, write: true }); if (ctx instanceof NextResponse) return ctx;
  if (!ctx.canManage || !ctx.actor) return answer(refuse(403, "Your team access is read-only."));
  if (!trustedFormOrigin(request) || ![null, "same-origin"].includes(request.headers.get("sec-fetch-site")) ||
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return answer(refuse(403, "Manage imports from this dashboard."));
  const { accountId: rawAccount, path = [] } = await context.params;
  const accountId = requestId(rawAccount); if (!accountId) return answer(refuse(400, "That account reference is invalid."));
  let body: unknown;
  try { body = await readCommandJson(request, 131_072); }
  catch (error) { return answer(refuse(error instanceof Error && error.message === "Command is too large" ? 413 : 400, "That import request is invalid.")); }
  const backend = configuredOfferImportBackend(ctx.fetch); if (!backend) return answer(refuse(503, "Offer import is not configured."));
  return answer(await dispatchImport({ method: "POST", accountId, path, after: null, actor: ctx.actor, canManage: ctx.canManage, body }, backend));
}
