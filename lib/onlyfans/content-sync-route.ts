import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireOnlyFansRead, requestId, PRIVATE_HEADERS } from "./route";
import type { SessionActor } from "./upload-permission";
import { readCommandJson } from "./command-json";
import { canonicalContent } from "./content";
import { configuredContentSyncBackend, type ContentSyncBackend, type SyncFailure } from "./content-sync-backend";
import { MAX_SYNC_JSON_BYTES, MAX_SYNC_PAGE, SYNC_CHUNK_BYTES, SYNC_SCHEMA, chunkIndex, commitCommand, draftCommand, resolveCommand, retryCommand,
  settingsCommand, syncCommandKey, syncFileId, syncId, syncNowCommand, validCommitRequest, validDraftRequest, validResolveRequest,
  validRetryRequest, validSettingsRequest, validSyncNowRequest } from "./content-sync";
import { trustedFormOrigin } from "@/lib/form-origin";

export type SyncCall = { method: "GET" | "POST" | "PUT"; accountId: string; path: string[]; search: URLSearchParams;
  actor: SessionActor | null; canManage: boolean; body?: unknown; bytes?: Uint8Array };
export type SyncAnswer = { status: number; body: unknown };
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const refuse = (status: number, error: string, code = "invalid_syncrequest"): SyncAnswer => ({ status, body: { schemaVersion: SYNC_SCHEMA, ok: false, outcome: "refused", code, error } });
const done = (accountId: string, result: { ok: true; data: unknown } | SyncFailure): SyncAnswer => result.ok
  ? { status: 200, body: { schemaVersion: SYNC_SCHEMA, ok: true, accountId, data: result.data } }
  : { status: result.status, body: { schemaVersion: SYNC_SCHEMA, ok: false, outcome: result.outcome, code: result.code, error: result.error } };
/** The only browser-visible chunk shape: drafts/{draft}/files/{file}/chunks/{index}. */
export const isChunkPath = (path: string[]) => path.length === 6 && path[0] === "drafts" && path[2] === "files" && path[4] === "chunks";

function pageQuery(search: URLSearchParams): { after: string | null; limit: number } | null {
  const keys = [...search.keys()];
  if (keys.some(key => !["after", "limit"].includes(key)) || new Set(keys).size !== keys.length) return null;
  const after = search.get("after"), limit = search.get("limit");
  if (after !== null && !syncId(after)) return null;
  if (limit !== null && !(/^[0-9]{1,2}$/.test(limit) && Number(limit) >= 1 && Number(limit) <= MAX_SYNC_PAGE)) return null;
  return { after, limit: limit === null ? 25 : Number(limit) };
}

/** Pure request routing: validates path, query and body, derives identity and builds the exact backend command. */
export async function dispatchSync(call: SyncCall, backend: ContentSyncBackend): Promise<SyncAnswer> {
  const { accountId, path, search, method } = call;
  if (method === "GET") {
    if (path.length === 1 && path[0] === "status" && !search.size) return done(accountId, await backend.status(accountId));
    if (path.length === 1 && path[0] === "operations") { const page = pageQuery(search); return page ? done(accountId, await backend.operations(accountId, page.after, page.limit)) : refuse(400, "That page request is invalid."); }
    if (path.length === 2 && path[0] === "operations" && syncId(path[1]) && !search.size) return done(accountId, await backend.operation(accountId, path[1]));
    if (path.length === 1 && path[0] === "conflicts") {
      const status = search.get("status") ?? "open";
      return [...search.keys()].every(key => key === "status") && search.getAll("status").length <= 1 && (status === "open" || status === "all")
        ? done(accountId, await backend.conflicts(accountId, status)) : refuse(400, "That conflict request is invalid.");
    }
    if (path.length === 1 && path[0] === "drafts") { const page = pageQuery(search); return page ? done(accountId, await backend.drafts(accountId, page.after, page.limit)) : refuse(400, "That page request is invalid."); }
    if (path.length === 2 && path[0] === "drafts" && syncId(path[1]) && !search.size) return done(accountId, await backend.draft(accountId, path[1]));
    if (path.length === 2 && path[0] === "commands" && syncCommandKey(path[1]) && !search.size) return done(accountId, await backend.command(accountId, path[1]));
    return refuse(404, "That sync resource is not available.", "not_available");
  }
  // Every write needs a signed-in manager. Read-only sessions can only read.
  if (!call.canManage || !call.actor) return refuse(403, "Your team access is read-only.");
  const actor = call.actor;
  if (isChunkPath(call.path)) {
    const index = chunkIndex(path[5]);
    if (!syncId(path[1]) || !syncFileId(path[3]) || index === null || search.size) return refuse(400, "That upload chunk is invalid.");
    if (!call.bytes?.length) return refuse(400, "Choose a file chunk to upload.");
    if (call.bytes.length > SYNC_CHUNK_BYTES) return refuse(413, "That upload chunk is too large.");
    return done(accountId, await backend.putChunk(accountId, path[1], path[3], index, call.bytes, actor));
  }
  if (method !== "POST" || search.size) return refuse(404, "That sync resource is not available.", "not_available");
  const body = call.body;
  // Command keys are derived from actor, account, action and the exact body, so a retry after a lost reply is the same command.
  const identity = (...parts: string[]) => ({ actor, commandKey: digest(canonicalContent([actor, accountId, ...parts, body])) });
  if (path.length === 1 && path[0] === "settings") return validSettingsRequest(body) ? done(accountId, await backend.settings(accountId, settingsCommand(body, identity("settings")))) : refuse(400, "That sync setting is invalid.");
  if (path.length === 1 && path[0] === "sync") return validSyncNowRequest(body) ? done(accountId, await backend.syncNow(accountId, syncNowCommand(body, identity("sync")))) : refuse(400, "That sync request is invalid.");
  if (path.length === 3 && path[0] === "operations" && syncId(path[1]) && path[2] === "retry")
    return validRetryRequest(body) ? done(accountId, await backend.retry(accountId, path[1], retryCommand(identity("retry", path[1])))) : refuse(400, "That retry request is invalid.");
  if (path.length === 3 && path[0] === "conflicts" && syncId(path[1]) && path[2] === "resolve")
    return validResolveRequest(body) ? done(accountId, await backend.resolve(accountId, path[1], resolveCommand(body, identity("resolve", path[1])))) : refuse(400, "That decision is invalid.");
  if (path.length === 1 && path[0] === "drafts")
    return validDraftRequest(body) ? done(accountId, await backend.createDraft(accountId, draftCommand(body, identity("draft")))) : refuse(400, "Check the files, label, description and price, then save again.");
  if (path.length === 3 && path[0] === "drafts" && syncId(path[1]) && path[2] === "commit")
    return validCommitRequest(body) ? done(accountId, await backend.commit(accountId, path[1], commitCommand(identity("commit", path[1])))) : refuse(400, "That save request is invalid.");
  return refuse(404, "That sync resource is not available.", "not_available");
}

type Context = { params: Promise<{ accountId: string; path?: string[] }> };
const answer = (result: SyncAnswer) => NextResponse.json(result.body, { status: result.status, headers: PRIVATE_HEADERS });

export async function handleSyncRead(request: NextRequest, context: Context) {
  const ctx = await requireOnlyFansRead({ agency: true }); if (ctx instanceof NextResponse) return ctx;
  const { accountId: raw, path = [] } = await context.params, accountId = requestId(raw);
  if (!accountId) return answer(refuse(400, "That account reference is invalid."));
  const backend = configuredContentSyncBackend(ctx.fetch); if (!backend) return answer(refuse(503, "Content sync is not configured.", "sync_unavailable"));
  return answer(await dispatchSync({ method: "GET", accountId, path, search: request.nextUrl.searchParams, actor: ctx.actor, canManage: ctx.canManage }, backend));
}

/** POST for commands and chunks (agency middleware only admits POST), PUT for the documented chunk verb. */
export async function handleSyncWrite(request: NextRequest, context: Context, method: "POST" | "PUT") {
  const ctx = await requireOnlyFansRead({ agency: true, write: true }); if (ctx instanceof NextResponse) return ctx;
  if (!ctx.canManage || !ctx.actor) return answer(refuse(403, "Your team access is read-only."));
  const { accountId: raw, path = [] } = await context.params, accountId = requestId(raw);
  if (!accountId) return answer(refuse(400, "That account reference is invalid."));
  const chunk = isChunkPath(path);
  if (method === "PUT" && !chunk) return answer(refuse(404, "That sync resource is not available.", "not_available"));
  if (!trustedFormOrigin(request) || ![null, "same-origin"].includes(request.headers.get("sec-fetch-site")) ||
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== (chunk ? "application/octet-stream" : "application/json"))
    return answer(refuse(403, "Manage content from this dashboard."));
  let body: unknown, bytes: Uint8Array | undefined;
  if (chunk) {
    if (!request.body) return answer(refuse(400, "Choose a file chunk to upload."));
    const reader = request.body.getReader(), parts: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.byteLength;
        if (size > SYNC_CHUNK_BYTES) { await reader.cancel(); return answer(refuse(413, "That upload chunk is too large.")); }
        parts.push(part.value);
      }
    } catch { return answer(refuse(400, "The file transfer was interrupted. Refresh its recorded progress.")); }
    bytes = new Uint8Array(size); let offset = 0; for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  } else {
    try { body = await readCommandJson(request, MAX_SYNC_JSON_BYTES); }
    catch (error) { return answer(refuse(error instanceof Error && error.message === "Command is too large" ? 413 : 400, "That sync request is invalid.")); }
  }
  const backend = configuredContentSyncBackend(ctx.fetch); if (!backend) return answer(refuse(503, "Content sync is not configured.", "sync_unavailable"));
  return answer(await dispatchSync({ method: chunk ? "PUT" : "POST", accountId, path, search: request.nextUrl.searchParams, actor: ctx.actor, canManage: ctx.canManage, body, bytes }, backend));
}
