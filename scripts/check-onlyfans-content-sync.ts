import assert from "node:assert/strict";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createContentSyncBackend } from "../lib/onlyfans/content-sync-backend";
import { dispatchSync, isChunkPath, type SyncCall } from "../lib/onlyfans/content-sync-route";
import type { SessionActor } from "../lib/onlyfans/actor";
import { COVERAGE_LABELS, DRAFT_STATE_LABELS, MAX_SYNC_FILE_BYTES, SYNC_CHUNK_BYTES, SYNC_HEADER, SYNC_SCHEMA, UNPUBLISHED_UPLOAD_UNAVAILABLE,
  chunkIndex, parseChunkResponse, parseCommandResponse, parseConflict, parseConflictsResponse, parseDraft, parseDraftResponse, parseDraftsPage,
  parseFailureCode, parseOperation, parseOperationResponse, parseOperationsPage, parseResolveResponse, parseSettingsResponse, parseStatusResponse,
  reasonLabel, syncId, validDraftRequest, validResolveRequest, validRetryRequest, validSettingsRequest, validSyncNowRequest } from "../lib/onlyfans/content-sync";
import ContentSyncDraft from "../components/onlyfans-preview/ContentSyncDraft";

// tsx compiles the repo's preserved JSX to classic createElement calls; Next supplies the runtime in the app.
(globalThis as { React?: unknown }).React = React;
const ACCOUNT = "acc-a", ACTOR = ("op-session:" + "b".repeat(64)) as SessionActor, REQ = "0f0e0d0c-0b0a-4908-8706-050403020100", FILE = "1f0e0d0c-0b0a-4908-8706-050403020100";
const stamp = "2026-10-23T01:02:03Z";
const coverage = (state: string, detail: string | null = null) => ({ state, checkedAt: stamp, detail });
const syncState = { enabled: true, status: "active", revision: 3, blockedReason: null, lastIncrementalAt: stamp, nextIncrementalAt: stamp, lastReconcileAt: stamp,
  nextReconcileAt: stamp, lastFullReconcileAt: null, coveredThroughMessageId: "123", backlog: 0,
  initial: { jobId: "job-1", status: "complete", rowsScanned: 1000, complete: true },
  coverage: { media: coverage("current"), paidMessages: coverage("partial"), paidPosts: { state: "unsupported", checkedAt: null, detail: "Paid-post reading is not verified yet." } },
  openConflicts: 0, uploads: { draft: 0, queued: 1, uploading: 0, verifying: 0, synced: 2, retrying: 0, connectionRequired: 0, needsReview: 0, outcomeUnconfirmed: 0 } };
const operation = { operationId: "op-1", kind: "sync_now", status: "queued", createdAt: stamp, updatedAt: stamp, completedAt: null, coverage: {}, result: {},
  lastError: null, retryable: false, draftId: null, assetId: null };
const terms = { priceCents: 1999, mediaCount: 2, previewCount: 1, sourceAt: stamp };
const conflict = { conflictId: "cf-1", itemId: "7", revision: 2, status: "open", createdAt: stamp, current: terms,
  source: { ...terms, priceCents: 2500, lockedText: false }, itemFingerprint: "c".repeat(64), resolution: null, resolvedAt: null };
const asset = (state: string, extra = {}) => ({ assetId: "as-1", fileId: FILE, name: "Synthetic.png", kind: "photo", order: 0, freePreview: false, state, attempts: 1, lastError: null, ...extra });
const draft = (state: string, extra: Record<string, unknown> = {}, assets = [asset(state)]) => ({ draftId: "dr-1", revision: 1, state, reason: null, label: "Two photos",
  description: "Approved.", priceCents: 1999, pricingMode: "fixed", itemId: null, enabled: false, assets,
  readiness: { mediaSynced: false, canEnable: false, blockers: ["media_not_synced"] }, ...extra });
const envelope = (body: Record<string, unknown>, account = true) => ({ schemaVersion: SYNC_SCHEMA, ok: true, ...(account ? { accountId: ACCOUNT } : {}), ...body });

async function main() {
  // Strict, account-bound envelopes. Unknown keys and the wrong schema are refused everywhere.
  assert(parseStatusResponse(envelope({ sync: syncState }), ACCOUNT));
  assert.equal(parseStatusResponse(envelope({ sync: syncState }, false), ACCOUNT), null, "status binds the account explicitly");
  assert.equal(parseStatusResponse(envelope({ sync: syncState }), "acc-b"), null);
  assert.equal(parseStatusResponse({ ...envelope({ sync: syncState }), schemaVersion: "of-content-sync.v2" }, ACCOUNT), null);
  assert.equal(parseStatusResponse({ ...envelope({ sync: syncState }), extra: 1 }, ACCOUNT), null);
  assert.equal(parseStatusResponse({ ...envelope({ sync: syncState }), ok: false }, ACCOUNT), null);
  for (const change of [{ status: "running" }, { revision: -1 }, { backlog: 1.5 }, { extra: true }, { enabled: "yes" }, { lastIncrementalAt: "yesterday" },
    { coverage: { ...syncState.coverage, paidPosts: { state: "complete", checkedAt: null, detail: null } } },
    { coverage: { media: syncState.coverage.media, paidMessages: syncState.coverage.paidMessages } },
    { coverage: { ...syncState.coverage, media: { ...syncState.coverage.media, extra: 1 } } },
    { uploads: { ...syncState.uploads, synced: -1 } }, { uploads: { draft: 0 } }, { initial: { jobId: "x", status: "complete", rowsScanned: 1 } }])
    assert.equal(parseStatusResponse(envelope({ sync: { ...syncState, ...change } }), ACCOUNT), null, JSON.stringify(change));
  assert(parseStatusResponse(envelope({ sync: { ...syncState, initial: null, status: "off", enabled: false, blockedReason: "auth_required" } }), ACCOUNT));
  assert(parseSettingsResponse(envelope({ sync: syncState }, false), ACCOUNT) && parseSettingsResponse(envelope({ sync: syncState }), ACCOUNT));
  assert.equal(parseSettingsResponse(envelope({ sync: syncState }, false), "acc-b") !== null, true, "an envelope without accountId is accepted; the account is bound by the request path");
  assert.equal(parseSettingsResponse({ ...envelope({ sync: syncState }), accountId: "acc-b" }, ACCOUNT), null);

  assert(parseOperation(operation) && parseOperationResponse(envelope({ operation }, false), ACCOUNT));
  for (const change of [{ kind: "full" }, { status: "done" }, { retryable: 1 }, { extra: 1 }, { createdAt: "2026-10-23 01:02:03" }, { operationId: "../x" }, { coverage: "no" }])
    assert.equal(parseOperation({ ...operation, ...change }), null, JSON.stringify(change));
  assert(parseOperationsPage(envelope({ items: [operation], nextCursor: null }, false), ACCOUNT));
  assert.equal(parseOperationsPage(envelope({ items: [operation, { ...operation, kind: "x" }], nextCursor: null }, false), ACCOUNT), null);
  assert.equal(parseOperationsPage(envelope({ items: Array(51).fill(operation), nextCursor: null }, false), ACCOUNT), null);

  assert(parseConflict(conflict) && parseConflictsResponse(envelope({ items: [conflict] }, false), ACCOUNT));
  for (const [kind, sourceIssue] of [["source_changed", null], ["source_unusable", "source_terms_unusable"], ["post_deleted", "post_deleted"], ["post_free", "post_no_longer_paid"], ["source_retracted", "source_retracted"]])
    assert(parseConflict({ ...conflict, kind, sourceIssue }), `${kind} remains visible for operator review`);
  for (const change of [{ kind: "post_deleted" }, { sourceIssue: "post_deleted" }, { kind: "deleted", sourceIssue: null }, { kind: "post_free", sourceIssue: "unknown" }])
    assert.equal(parseConflict({ ...conflict, ...change }), null, "new conflict metadata must be a supported complete pair");
  for (const change of [{ status: "pending" }, { itemFingerprint: "bad" }, { resolution: "merge" }, { itemId: "07" }, { current: { ...terms, lockedText: true } }, { source: terms }, { extra: 1 }])
    assert.equal(parseConflict({ ...conflict, ...change }), null, JSON.stringify(change));
  assert(parseResolveResponse(envelope({ conflict: { ...conflict, status: "resolved", resolution: "keep_crm", resolvedAt: stamp }, itemId: "7" }, false), ACCOUNT));
  assert.equal(parseResolveResponse(envelope({ conflict, itemId: "8" }, false), ACCOUNT), null, "resolve must name the same item");

  // Drafts: states, readiness and the unpublished-upload block remain representable; a partially synced item can never claim canEnable.
  assert(parseDraft(draft("draft")));
  assert(parseDraftResponse(envelope({ draft: draft("needs_review", { reason: "unpublished_upload_unavailable" }) }, false), ACCOUNT));
  const synced = draft("synced", { itemId: "7", readiness: { mediaSynced: true, canEnable: true, blockers: [] } }, [asset("synced")]);
  assert(parseDraft(synced));
  assert.equal(parseDraft({ ...synced, assets: [asset("uploading")] }), null, "canEnable with an unsynced asset is refused");
  assert.equal(parseDraft({ ...synced, itemId: null }), null, "canEnable without an item is refused");
  for (const change of [{ state: "published" }, { pricingMode: "dynamic" }, { priceCents: 19.99 }, { extra: 1 }, { readiness: { mediaSynced: true, canEnable: false } },
    { assets: [asset("synced", { kind: "audio" })] }, { assets: [asset("synced"), asset("synced")] }, { assets: [asset("synced", { sourceUrl: "https://signed.invalid/x" })] }])
    assert.equal(parseDraft({ ...draft("queued"), ...change }), null, JSON.stringify(change));
  assert(parseDraftsPage(envelope({ items: [draft("queued")], nextCursor: "dr-1" }, false), ACCOUNT));
  assert.equal(parseDraftsPage(envelope({ items: [draft("queued")], nextCursor: "../x" }, false), ACCOUNT), null);
  assert(parseChunkResponse(envelope({ received: 1, complete: false }, false), ACCOUNT));
  assert.equal(parseChunkResponse(envelope({ received: -1, complete: false }, false), ACCOUNT), null);
  assert.equal(parseChunkResponse(envelope({ received: 1 }, false), ACCOUNT), null);
  assert.equal(parseCommandResponse(envelope({ command: { commandKey: "a".repeat(64), recorded: true, action: "resolve" } }, false), ACCOUNT)?.recorded, true);
  assert.equal(parseCommandResponse(envelope({ command: { commandKey: "bad", recorded: true } }, false), ACCOUNT), null);
  assert.equal(parseFailureCode({ ok: false, code: "revision_conflict", error: "anything" }), "revision_conflict");
  assert.equal(parseFailureCode({ ok: false, code: "made_up", error: "x" }), null);
  assert.equal(syncId("dr-1"), true); for (const bad of ["", ".", "..", "a/b", "a b", "x".repeat(65)]) assert.equal(syncId(bad), false, bad);

  // Browser request bodies carry only a request id, never an actor, tenant, price override or command key.
  assert(validSettingsRequest({ requestId: REQ, enabled: true, expectedRevision: 0 }));
  for (const body of [{ requestId: REQ, enabled: true }, { requestId: REQ, enabled: 1, expectedRevision: 0 }, { requestId: REQ, enabled: true, expectedRevision: 0, actor: "x" }, { enabled: true, expectedRevision: 0 }])
    assert.equal(validSettingsRequest(body), false);
  assert(validSyncNowRequest({ requestId: REQ, kind: "incremental" }) && validSyncNowRequest({ requestId: REQ, kind: "reconcile" }) && !validSyncNowRequest({ requestId: REQ, kind: "full" }));
  assert(validRetryRequest({ requestId: REQ }) && !validRetryRequest({ requestId: REQ, commandKey: "a".repeat(64) }));
  const resolve = { requestId: REQ, resolution: "keep_crm", expectedRevision: 2, expectedItemFingerprint: "c".repeat(64) };
  assert(validResolveRequest(resolve));
  for (const change of [{ resolution: "merge" }, { expectedItemFingerprint: "c" }, { expectedRevision: -1 }, { actor: "x" }]) assert.equal(validResolveRequest({ ...resolve, ...change }), false);
  const file = { fileId: FILE, name: "a.png", size: 100, sha256: "d".repeat(64) };
  const request = { requestId: REQ, label: "Two photos", description: "Approved.", priceCents: 1999, files: [file, { ...file, fileId: REQ, name: "b.png" }], previewFileIds: [FILE] };
  assert(validDraftRequest(request));
  for (const change of [{ priceCents: 299 }, { priceCents: 20001 }, { label: " " }, { description: "" }, { files: [] }, { previewFileIds: [FILE, REQ] }, { previewFileIds: ["8f0e0d0c-0b0a-4908-8706-050403020100"] },
    { files: [file, file] }, { files: [{ ...file, name: "../a.png" }, { ...file, fileId: REQ }] }, { files: [{ ...file, sha256: "x" }, { ...file, fileId: REQ }] }, { files: [{ ...file, size: MAX_SYNC_FILE_BYTES + 1 }, { ...file, fileId: REQ }] },
    { files: Array(21).fill(0).map((_v, i) => ({ ...file, fileId: `1f0e0d0c-0b0a-4908-8706-0504030201${String(i).padStart(2, "0")}` })), previewFileIds: [] }, { actor: "x" }, { enabled: true }])
    assert.equal(validDraftRequest({ ...request, ...change }), false, JSON.stringify(change).slice(0, 80));
  assert.equal(validDraftRequest({ ...request, previewFileIds: [FILE, REQ] }), false, "at least one file stays paid");
  assert.equal(chunkIndex("0"), 0); assert.equal(chunkIndex("499"), 499); for (const bad of ["01", "-1", "1.5", "50000", "x"]) assert.equal(chunkIndex(bad), null);
  assert(isChunkPath(["drafts", "dr-1", "files", FILE, "chunks", "0"]) && !isChunkPath(["drafts", "dr-1", "commit"]));

  // Plain-word labels required by the product text.
  assert.equal(DRAFT_STATE_LABELS.synced, "Media synced to OnlyFans"); assert.equal(DRAFT_STATE_LABELS.needs_review, "Needs review");
  assert.equal(DRAFT_STATE_LABELS.connection_required, "Connection required"); assert.equal(DRAFT_STATE_LABELS.outcome_unconfirmed, "Outcome not confirmed");
  assert.equal(COVERAGE_LABELS.unsupported, "Unsupported");
  assert.equal(UNPUBLISHED_UPLOAD_UNAVAILABLE, "OnlyFans upload without posting isn't available yet. Nothing was posted or sent.");
  assert.equal(reasonLabel("unpublished_upload_unavailable"), UNPUBLISHED_UPLOAD_UNAVAILABLE);
  assert.equal(reasonLabel("some_new_code"), "Needs review.", "unknown codes never leak raw");
  const rendered = renderToStaticMarkup(createElement(ContentSyncDraft, { accountId: ACCOUNT, draft: parseDraft(draft("needs_review", { reason: "unpublished_upload_unavailable" }, [asset("needs_review", { lastError: "weird_internal_code" })]))!, onChanged: () => {} }));
  for (const text of ["Needs review", "Price for future messages", "USD 19.99", "(fixed)", UNPUBLISHED_UPLOAD_UNAVAILABLE, "does not switch the item on, message a fan or publish a post", "cannot be switched on yet"])
    assert(rendered.replaceAll("&#x27;", "'").includes(text), text);
  assert(!/[a-f0-9]{64}/.test(rendered) && !rendered.includes("weird_internal_code") && !/https?:\/\//.test(rendered), "no hashes, raw codes or URLs in the UI");
  const syncedHtml = renderToStaticMarkup(createElement(ContentSyncDraft, { accountId: ACCOUNT, draft: parseDraft(synced)!, onChanged: () => {} }));
  assert(syncedHtml.includes("Media synced to OnlyFans") && syncedHtml.includes("can be switched on from its editor") && syncedHtml.includes("switched off"));

  // Backend client: content credential, version header, exact paths, one attempt, honest uncertainty.
  const calls: { url: string; init: RequestInit }[] = [];
  let reply: () => Response = () => Response.json(envelope({ sync: syncState }));
  const fetchImpl = (async (url: string, init: RequestInit) => { calls.push({ url: String(url), init }); return reply(); }) as typeof fetch;
  const backend = createContentSyncBackend({ baseUrl: "http://backend.invalid/", token: "content-token", fetchImpl });
  const identity = { commandKey: "e".repeat(64), actor: ACTOR };
  assert((await backend.status(ACCOUNT)).ok);
  assert.equal(calls[0].url, "http://backend.invalid/onlyfans/content-sync/v1/accounts/acc-a/status");
  const headers = new Headers(calls[0].init.headers);
  assert.equal(headers.get("authorization"), "Bearer content-token"); assert.equal(headers.get(SYNC_HEADER), "of-content-sync.v1"); assert.equal(headers.get("cookie"), null);
  assert.equal(calls[0].init.credentials, "omit"); assert.equal(calls[0].init.redirect, "error"); assert.equal(calls[0].init.cache, "no-store");
  reply = () => { throw new Error("network"); };
  const lost = await backend.settings(ACCOUNT, { enabled: true, expectedRevision: 3, ...identity });
  assert(!lost.ok && lost.outcome === "unconfirmed" && lost.status === 502 && lost.code === "outcome_unconfirmed", "a lost reply is never a failure");
  assert.equal(calls.length, 2, "no automatic retry");
  assert.equal((await backend.status(ACCOUNT)).ok, false);
  for (const [status, code, outcome, expectStatus, expectCode] of [[400, "invalid_sync_request", "refused", 400, "invalid_sync_request"], [409, "revision_conflict", "refused", 409, "revision_conflict"],
    [409, "sync_conflict", "refused", 409, "sync_conflict"], [409, "connection_unavailable", "refused", 409, "connection_unavailable"], [409, "idempotency_conflict", "refused", 409, "idempotency_conflict"],
    [404, "not_available", "refused", 404, "not_available"], [503, "sync_unavailable", "refused", 503, "sync_unavailable"], [500, "outcome_unconfirmed", "unconfirmed", 502, "outcome_unconfirmed"],
    [401, "unauthorized", "refused", 503, "sync_unavailable"], [502, "x", "unconfirmed", 502, "outcome_unconfirmed"]] as const) {
    reply = () => Response.json({ schemaVersion: SYNC_SCHEMA, ok: false, code, error: "Backend prose is not shown." }, { status });
    const result = await backend.resolve(ACCOUNT, "cf-1", { resolution: "keep_crm", expectedRevision: 2, expectedItemFingerprint: "c".repeat(64), ...identity });
    assert(!result.ok && result.outcome === outcome && result.status === expectStatus && result.code === expectCode, `${status} ${code}`);
    assert(!result.error.includes("Backend prose"));
  }
  reply = () => Response.json({ ok: true, schemaVersion: SYNC_SCHEMA, accountId: "acc-b", conflict, itemId: "7" });
  const foreign = await backend.resolve(ACCOUNT, "cf-1", { ...identity }); assert(!foreign.ok && foreign.outcome === "unconfirmed", "a reply for another account is never accepted");
  const before = calls.length;
  const big = await backend.putChunk(ACCOUNT, "dr-1", FILE, 0, new Uint8Array(SYNC_CHUNK_BYTES + 1), ACTOR); assert(!big.ok && big.status === 413);
  const empty = await backend.putChunk(ACCOUNT, "dr-1", FILE, 0, new Uint8Array(0), ACTOR); assert(!empty.ok && empty.status === 413);
  assert.equal(calls.length, before, "oversized or empty chunks never reach the backend");

  // Route dispatch: exact backend commands, server-derived identity, read-only refusal, bounded chunks.
  const sent: { method: string; url: string; body: string | null; headers: Headers }[] = [];
  let answer: () => Response = () => Response.json(envelope({ sync: syncState }));
  const routeBackend = createContentSyncBackend({ baseUrl: "http://backend.invalid", token: "t", fetchImpl: (async (url: string, init: RequestInit) => {
    sent.push({ method: String(init.method), url: String(url), body: typeof init.body === "string" ? init.body : init.body ? `bytes:${(init.body as Buffer).length}` : null, headers: new Headers(init.headers) });
    return answer(); }) as typeof fetch });
  const base: Omit<SyncCall, "method" | "path"> = { accountId: ACCOUNT, search: new URLSearchParams(), actor: ACTOR, canManage: true };
  const manager = (method: SyncCall["method"], path: string[], extra: Partial<SyncCall> = {}) => dispatchSync({ ...base, method, path, ...extra }, routeBackend);

  const read = await manager("GET", ["status"]); assert.equal(read.status, 200);
  assert.deepEqual((read.body as { data: unknown }).data, syncState);
  const readOnly = { canManage: false };
  assert.equal((await manager("GET", ["status"], readOnly)).status, 200, "read-only sessions can read");
  const count = sent.length;
  for (const [path, body] of [[["settings"], { requestId: REQ, enabled: true, expectedRevision: 0 }], [["sync"], { requestId: REQ, kind: "incremental" }], [["drafts"], request],
    [["drafts", "dr-1", "commit"], { requestId: REQ }], [["operations", "op-1", "retry"], { requestId: REQ }], [["conflicts", "cf-1", "resolve"], resolve]] as const) {
    assert.equal((await manager("POST", [...path], { ...readOnly, body })).status, 403, path.join("/"));
    assert.equal((await manager("POST", [...path], { actor: null, body })).status, 403);
  }
  assert.equal((await manager("PUT", ["drafts", "dr-1", "files", FILE, "chunks", "0"], { ...readOnly, bytes: new Uint8Array(4) })).status, 403);
  assert.equal(sent.length, count, "a read-only POST or chunk never reaches the backend");

  answer = () => Response.json(envelope({ sync: syncState }, false));
  assert.equal((await manager("POST", ["settings"], { body: { requestId: REQ, enabled: true, expectedRevision: 3 } })).status, 200);
  const settings = sent.at(-1)!;
  assert.equal(settings.method, "POST"); assert.equal(settings.url, "http://backend.invalid/onlyfans/content-sync/v1/accounts/acc-a/settings");
  const parsedSettings = JSON.parse(settings.body!);
  assert.deepEqual(Object.keys(parsedSettings).sort(), ["actor", "commandKey", "enabled", "expectedRevision"]);
  assert.equal(parsedSettings.actor, ACTOR); assert.match(parsedSettings.commandKey, /^[a-f0-9]{64}$/);
  await manager("POST", ["settings"], { body: { requestId: REQ, enabled: true, expectedRevision: 3 } });
  assert.equal(JSON.parse(sent.at(-1)!.body!).commandKey, parsedSettings.commandKey, "an exact retry is the same command");
  await manager("POST", ["settings"], { body: { requestId: FILE, enabled: true, expectedRevision: 3 } });
  assert.notEqual(JSON.parse(sent.at(-1)!.body!).commandKey, parsedSettings.commandKey, "a new request id is a new command");
  await manager("POST", ["settings"], { actor: ("op-session:" + "c".repeat(64)) as SessionActor, body: { requestId: REQ, enabled: true, expectedRevision: 3 } });
  assert.notEqual(JSON.parse(sent.at(-1)!.body!).commandKey, parsedSettings.commandKey, "commands are scoped to the actor");
  const n = sent.length;
  for (const body of [{ requestId: REQ, enabled: true, expectedRevision: 3, actor: "browser-actor" }, { requestId: REQ, enabled: true, expectedRevision: 3, commandKey: "a".repeat(64) }, { enabled: true }])
    assert.equal((await manager("POST", ["settings"], { body })).status, 400);
  assert.equal((await manager("POST", ["status"], { body: {} })).status, 404);
  assert.equal((await manager("POST", ["settings"], { body: { requestId: REQ, enabled: true, expectedRevision: 3 }, search: new URLSearchParams("x=1") })).status, 404);
  assert.equal(sent.length, n, "invalid commands never reach the backend");

  answer = () => Response.json(envelope({ operation }, false));
  await manager("POST", ["sync"], { body: { requestId: REQ, kind: "incremental" } });
  assert.deepEqual(Object.keys(JSON.parse(sent.at(-1)!.body!)).sort(), ["actor", "commandKey", "kind"]); assert.equal(sent.at(-1)!.url.endsWith("/sync"), true);
  await manager("POST", ["operations", "op-1", "retry"], { body: { requestId: REQ } });
  assert.deepEqual(Object.keys(JSON.parse(sent.at(-1)!.body!)).sort(), ["actor", "commandKey"]); assert.equal(sent.at(-1)!.url.endsWith("/operations/op-1/retry"), true);
  answer = () => Response.json(envelope({ conflict: { ...conflict, status: "resolved", resolution: "keep_crm", resolvedAt: stamp }, itemId: "7" }, false));
  assert.equal((await manager("POST", ["conflicts", "cf-1", "resolve"], { body: resolve })).status, 200);
  assert.deepEqual(JSON.parse(sent.at(-1)!.body!), { resolution: "keep_crm", expectedRevision: 2, expectedItemFingerprint: "c".repeat(64), commandKey: JSON.parse(sent.at(-1)!.body!).commandKey, actor: ACTOR });
  answer = () => Response.json(envelope({ draft: draft("draft") }, false));
  assert.equal((await manager("POST", ["drafts"], { body: request })).status, 200);
  const created = JSON.parse(sent.at(-1)!.body!);
  assert.deepEqual(Object.keys(created).sort(), ["actor", "commandKey", "description", "files", "label", "previewFileIds", "priceCents"]);
  assert.deepEqual(created.files[0], file); assert.equal(created.actor, ACTOR);
  answer = () => Response.json(envelope({ draft: draft("queued") }, false));
  assert.equal((await manager("POST", ["drafts", "dr-1", "commit"], { body: { requestId: REQ } })).status, 200);
  assert.equal(sent.at(-1)!.url.endsWith("/drafts/dr-1/commit"), true);

  // Chunks: PUT passthrough with an actor header, strict bounds, and never JSON.
  answer = () => Response.json(envelope({ received: 4, complete: true }, false));
  const chunkPath = ["drafts", "dr-1", "files", FILE, "chunks", "2"];
  assert.equal((await manager("POST", chunkPath, { bytes: new Uint8Array(4) })).status, 200);
  const chunk = sent.at(-1)!;
  assert.equal(chunk.method, "PUT"); assert.equal(chunk.url, `http://backend.invalid/onlyfans/content-sync/v1/accounts/acc-a/drafts/dr-1/files/${FILE}/chunks/2`);
  assert.equal(chunk.headers.get("content-type"), "application/octet-stream"); assert.equal(chunk.headers.get("x-onlyfans-actor"), ACTOR); assert.equal(chunk.body, "bytes:4");
  assert.equal((await manager("PUT", chunkPath, { bytes: new Uint8Array(SYNC_CHUNK_BYTES) })).status, 200, "exactly one chunk is allowed");
  const m = sent.length;
  assert.equal((await manager("PUT", chunkPath, { bytes: new Uint8Array(SYNC_CHUNK_BYTES + 1) })).status, 413);
  assert.equal((await manager("PUT", chunkPath, { bytes: new Uint8Array(0) })).status, 400);
  assert.equal((await manager("PUT", chunkPath)).status, 400);
  assert.equal((await manager("PUT", ["drafts", "dr-1", "files", "not-a-uuid", "chunks", "0"], { bytes: new Uint8Array(1) })).status, 400);
  assert.equal((await manager("PUT", ["drafts", "dr-1", "files", FILE, "chunks", "-1"], { bytes: new Uint8Array(1) })).status, 400);
  assert.equal((await manager("PUT", ["drafts", "..", "files", FILE, "chunks", "0"], { bytes: new Uint8Array(1) })).status, 400);
  assert.equal((await manager("PUT", chunkPath, { bytes: new Uint8Array(1), search: new URLSearchParams("offset=0") })).status, 400);
  assert.equal((await manager("PUT", ["settings"], { body: {} })).status, 404);
  assert.equal(sent.length, m, "rejected chunks never reach the backend");

  // Reads: paging and resource names are validated before any backend call.
  answer = () => Response.json(envelope({ items: [draft("queued")], nextCursor: null }, false));
  assert.equal((await manager("GET", ["drafts"], { search: new URLSearchParams("limit=50&after=dr-1") })).status, 200);
  assert.equal(sent.at(-1)!.url, "http://backend.invalid/onlyfans/content-sync/v1/accounts/acc-a/drafts?limit=50&after=dr-1");
  const r = sent.length;
  for (const query of ["limit=0", "limit=51", "limit=x", "after=../x", "extra=1", "limit=1&limit=2"]) assert.equal((await manager("GET", ["drafts"], { search: new URLSearchParams(query) })).status, 400, query);
  assert.equal((await manager("GET", ["drafts", ".."])).status, 404);
  assert.equal((await manager("GET", ["conflicts"], { search: new URLSearchParams("status=everything") })).status, 400);
  assert.equal((await manager("GET", ["commands", "short"])).status, 404);
  assert.equal(sent.length, r);
  answer = () => { throw new Error("down"); };
  const down = await manager("GET", ["status"]); assert.equal(down.status, 503);
  assert.equal((down.body as { code: string }).code, "sync_unavailable");
  console.log("PASS content sync: strict versioned envelopes, no unsynced canEnable, browser bodies without identities, server-derived exact retry keys, read-only writes refused, bounded chunks, one-attempt uncertain writes, plain-word labels without hashes");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
