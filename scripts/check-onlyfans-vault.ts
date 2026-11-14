import assert from "node:assert/strict";
import { createVaultBackend } from "../lib/onlyfans/vault-backend";
import { CONTENT_SCHEMA } from "../lib/onlyfans/content";
import { vaultAvailability, vaultDuration, parseVault, parseVaultSyncAck, parseVaultCreateAck, validVaultProduct, validVaultCreateRequest, validVaultSyncRequest, vaultMediaId } from "../lib/onlyfans/vault";

async function main() {
  const key = "a".repeat(64), requestId = "fd2e6b88-4edb-43db-a654-e2025d57eece";
  const job = { jobId: "af6b5c1e-79d0-4510-a5e2-535661d46a9f", commandKey: key, status: "complete", pagesRead: 1, itemsSeen: 3,
    lastError: null, requestedAt: "2026-10-18T00:00:00Z", updatedAt: "2026-10-18T00:00:01Z", completedAt: "2026-10-18T00:00:01Z" };
  const photo = { mediaId: "11", kind: "photo", durationSeconds: null, width: 100, height: 100, ready: true, reason: null, description: "Synthetic landscape" };
  const read = { schemaVersion: CONTENT_SCHEMA, ok: true, accountId: "acc-a", vault: { items: [photo, { ...photo, mediaId: "12", kind: "video", durationSeconds: 12 }], nextCursor: null, sync: job, connectionRevision: 3 } };
  const summary = {total: 50, photos: 34, videos: 16, other: 0, matching: 50, folders: 2};
  assert(parseVault({...read, vault: {...read.vault, summary}}, "acc-a"));
  for (const patch of [{total: 49}, {matching: 51}, {photos: -1}, {folders: "2"}, {secretUrl: "private"}])
    assert.equal(parseVault({...read, vault: {...read.vault, summary: {...summary, ...patch}}}, "acc-a"), null);
  assert.equal(vaultDuration(630), "10:30"); assert.equal(vaultDuration(3661), "1:01:01");
  assert.equal(vaultAvailability({ready: false, reason: "readiness_unknown"}).label, "Availability unconfirmed");
  assert.equal(vaultAvailability({ready: false, reason: "not_ready"}).label, "Full access unconfirmed");
  assert(parseVault(read, "acc-a")); assert.equal(parseVault(read, "acc-b"), null);
  assert(vaultMediaId("9007199254740993")); assert.equal(vaultMediaId("9223372036854775808"), false);
  for (const changed of [{ mediaId: "0" }, { kind: "audio" }, { durationSeconds: -1 }, { width: 0 }, { description: "é".repeat(1001) },
    { thumbUrl: "https://provider-secret.invalid/file" }, { reason: "https://provider-secret.invalid" }])
    assert.equal(parseVault({ ...read, vault: { ...read.vault, items: [{ ...photo, ...changed }] } }, "acc-a"), null);
  assert(parseVault({ ...read, vault: { ...read.vault, items: [{ ...photo, kind: "image", ready: false, reason: "unsupported_kind" }] } }, "acc-a"));
  assert.equal(parseVault({ ...read, vault: { ...read.vault, items: [photo, photo] } }, "acc-a"), null);
  const product = { label: "Scenic collection", description: "One scenic video with a still preview.", priceCents: 1007, enabled: true,
    mediaIds: ["11", "12"], previewMediaIds: ["11"] };
  assert(validVaultProduct(product)); assert(validVaultCreateRequest({ requestId, product })); assert(validVaultSyncRequest({ requestId, expectedConnectionRevision: 3 }));
  for (const changed of [{ mediaIds: [] }, { mediaIds: ["11", "11"] }, { previewMediaIds: ["11", "12"] }, { previewMediaIds: ["13"] },
    { mediaIds: [11, 12] }, { priceCents: 0 }, { priceCents: 20001 }, { label: " " }, { description: "" }, { fullUrl: "https://arbitrary.invalid/file" }])
    assert.equal(validVaultProduct({ ...product, ...changed }), false);
  assert.equal(validVaultSyncRequest({ requestId, expectedConnectionRevision: 3, actor: "browser-supplied" }), false);
  assert.equal(validVaultCreateRequest({ requestId: "bad", product }), false);
  const syncAck = { schemaVersion: CONTENT_SCHEMA, ok: true, applied: true, accountId: "acc-a", commandKey: key, sync: job };
  assert(parseVaultSyncAck(syncAck, { accountId: "acc-a", commandKey: key }));
  assert.equal(parseVaultSyncAck({ ...syncAck, commandKey: "b".repeat(64) }, { accountId: "acc-a" }), null);
  const item = { revision: 0, fingerprint: "b".repeat(64), label: product.label, labelTruncated: false, description: product.description,
    descriptionTruncated: false, priceCents: product.priceCents, enabled: product.enabled, currency: "USD", isFreeTeaser: false };
  const createAck = { schemaVersion: CONTENT_SCHEMA, ok: true, applied: true, accountId: "acc-a", commandKey: key, itemId: "7", item };
  assert(parseVaultCreateAck(createAck, { accountId: "acc-a", commandKey: key, product }));
  for (const changed of [{ accountId: "acc-b" }, { commandKey: "c".repeat(64) }, { item: { ...item, priceCents: 1000 } }, { item: { ...item, enabled: false } }, { item: { ...item, revision: 1 } }])
    assert.equal(parseVaultCreateAck({ ...createAck, ...changed }, { accountId: "acc-a", commandKey: key, product }), null);
  const posted: string[] = [];
  const identity = { actor: "op-session:" + "c".repeat(64), commandKey: key };
  const backend = createVaultBackend({ baseUrl: "http://127.0.0.1:1", token: "synthetic-content-only", fetchImpl: async (url, init) => {
    assert.equal(init?.credentials, "omit"); assert.equal(init?.redirect, "error"); assert.equal(init?.cache, "no-store");
    const headers = new Headers(init?.headers); assert.equal(headers.get("authorization"), "Bearer synthetic-content-only"); assert.equal(headers.get("X-OnlyFans-Content-Version"), CONTENT_SCHEMA); assert.equal(headers.get("cookie"), null);
    if (init?.method === "GET") { assert.equal(String(url), "http://127.0.0.1:1/onlyfans/content/v1/accounts/acc-a/vault?limit=24&includeSummary=1&progress=1"); return Response.json(read); }
    posted.push(String(init?.body)); if (posted.length === 1) throw new Error("Synthetic lost reply");
    return Response.json(String(url).endsWith("/vault/sync?progress=1") ? syncAck : createAck);
  } });
  assert((await backend.get("acc-a")).ok);
  const filtered = createVaultBackend({ baseUrl: "http://127.0.0.1:1", token: "synthetic", fetchImpl: async (url, init) => {
    assert.equal(String(url), "http://127.0.0.1:1/onlyfans/content/v1/accounts/acc-a/vault?limit=24&includeSummary=1&progress=1&afterMediaId=12&q=100%25%20coast&kind=photo");
    assert.equal(init?.method, "GET"); return Response.json(read);
  } });
  assert((await filtered.get("acc-a", "12", { query: "100% coast", kind: "photo" })).ok);
  const lost = await backend.create("acc-a", { product, ...identity }); assert(!lost.ok && lost.outcome === "unconfirmed"); assert.equal(posted.length, 1);
  assert((await backend.create("acc-a", { product, ...identity })).ok); assert.equal(posted[0], posted[1]);
  assert((await backend.sync("acc-a", { expectedConnectionRevision: 3, ...identity })).ok);
  // Full-vault (v4) sync: explicit selectionVersion reaches the backend, the v4 job view parses, and a window job never gains full coverage.
  const fullJob = { ...job, status: "running", completedAt: null, pagesRead: 400, itemsSeen: 9600, retryAt: null, pageOffset: 0, refreshMode: "full", pageBudget: 2500, kindOffsets: { photo: 9000, video: 600 },
    scope: { selection: "full_vault", version: 4, scope: "full", order: "created_at_desc_id_desc" },
    coverage: { scope: "full", state: "in_progress", reason: null, established_by: null, providerTotal: { photo: null, video: null }, seen: { photo: 9000, video: 600 }, uniqueImported: { photo: 9000, video: 600 } } };
  assert(parseVault({ ...read, vault: { ...read.vault, sync: fullJob } }, "acc-a")); assert(validVaultSyncRequest({ requestId, expectedConnectionRevision: 3, selectionVersion: 4 }));
  assert.equal(validVaultSyncRequest({ requestId, expectedConnectionRevision: 3, selectionVersion: 5 }), false);
  const sentSync: unknown[] = [];
  const fullBackend = createVaultBackend({ baseUrl: "http://127.0.0.1:1", token: "synthetic-content-only", fetchImpl: async (url, init) => {
    sentSync.push(JSON.parse(String(init?.body))); return Response.json({ schemaVersion: CONTENT_SCHEMA, ok: true, applied: true, accountId: "acc-a", commandKey: key, sync: fullJob });
  } });
  const fullResult = await fullBackend.sync("acc-a", { expectedConnectionRevision: 3, selectionVersion: 4, ...identity });
  assert(fullResult.ok && fullResult.sync.coverage?.scope === "full" && fullResult.sync.coverage.state === "in_progress");
  assert.deepEqual(sentSync[0], { expectedConnectionRevision: 3, selectionVersion: 4, ...identity });
  // Processing status and commands: account-scoped reads, exact command body, refusal and lost-reply semantics.
  const processingStatus = { account: "acc-a", paused: false, pauseReason: null, import: fullJob.coverage,
    analysis: { eligible: 3, queued: 1, processing: 1, completed: 1, unresolved: 0, skippedOperator: 0, byKind: {}, unresolvedReasons: {} }, credential: { state: "ok" }, updatedAt: "2026-11-15T00:00:00Z" };
  const seen: { url: string; method: string; body: unknown }[] = [];
  let mode: "ok" | "lost" | "other" = "ok";
  const proc = createVaultBackend({ baseUrl: "http://127.0.0.1:1", token: "synthetic-content-only", fetchImpl: async (url, init) => {
    seen.push({ url: String(url), method: String(init?.method), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (mode === "lost") throw new Error("Synthetic lost reply");
    const account = mode === "other" ? "acc-b" : "acc-a";
    return Response.json(init?.method === "GET" ? { ok: true, processing: { ...processingStatus, account } } : { schemaVersion: CONTENT_SCHEMA, ok: true, applied: true, accountId: account, commandKey: key, processing: processingStatus });
  } });
  const status = await proc.processing("acc-a");
  assert(status.ok && status.data.analysis?.queued === 1 && status.data.import?.scope === "full");
  assert.deepEqual(seen[0], { url: "http://127.0.0.1:1/onlyfans/content/v1/accounts/acc-a/vault/processing", method: "GET", body: undefined });
  assert.equal((await proc.processing("acc-a/../acc-b")).ok, false, "a status naming another account is refused"); assert.match(seen[1].url, /accounts\/acc-a%2F..%2Facc-b\/vault\/processing$/);
  const command = { action: "redescribe" as const, mediaIds: ["11", "12"], ...identity };
  const commandResult = await proc.processingCommand("acc-a", command);
  assert(commandResult.ok && commandResult.processing?.paused === false); assert.deepEqual(seen.at(-1), { url: "http://127.0.0.1:1/onlyfans/content/v1/accounts/acc-a/vault/processing", method: "POST", body: command });
  mode = "other"; assert.equal((await proc.processing("acc-a")).ok, false);
  const wrongAccount = await proc.processingCommand("acc-a", command); assert(!wrongAccount.ok && wrongAccount.outcome === "unconfirmed");
  mode = "lost"; const lostCommand = await proc.processingCommand("acc-a", command); assert(!lostCommand.ok && lostCommand.outcome === "unconfirmed" && lostCommand.status === 502);
  assert.equal((await proc.processing("acc-a")).ok, false);
  console.log("PASS vault: account-scoped bounded reads, exact large media IDs, no URLs, curated paid terms, preview subset, nonce-scoped commands, immutable ACK and exact lost-reply retry, full-vault v4 sync and processing status/commands");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
