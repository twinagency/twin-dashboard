// KNOWN RED (REVIEW.md inv 7 "Unconfirmed is not refused (D7)", docs/RISKS.md D7; W3 lib-onlyfans-4-plus2 F1, F2, F9, F10).
// Lib layer only: lib/onlyfans/vault-backend.ts and lib/onlyfans/vault-media-backend.ts over a synthetic wire (https://backend.invalid).
// F1  vault-backend.ts:15 lists upstream 503 as "refused" for every vault write (sync, create, asset/folder edit, category price,
//     category drafts). VaultManager.tsx:146, VaultMetadataEditor.tsx:63, VaultOrganization.tsx:53 drop the kept requestId on 503 and the
//     next click mints a new commandKey: a possibly applied create/folder/draft write can be applied twice. Orchestrator handoff (W3 STATE
//     04:30Z, lane 6 F1): red = outcome "unconfirmed" and status not 503; control = 409 refused.
// F2  vault-media-backend.ts:6,15,32,40: media write failures carry no outcome; upstream 503 is passed through, and a prepare whose 200
//     body fails parseVideo returns the default 503. (Route-level half: api-onlyfans-plus7 vault-upload-d7 test, create + video only.)
// F9  vault-media-backend.ts:47-49: a 416 forwards Content-Range without the account/media/video identity checks :50-51 apply to 200/206.
// F10 vault-media.ts:50-52 (used :22): an upload-create ack is any valid job of the account; it is not bound to the files requested.
// Fixed looks like: one D7 classifier (refused only for 400/401/403/404/405/409/410/413/422, else 502 unconfirmed) used by both backends,
// media results carrying outcome; identity checks before the 416 branch; create ack's fileIds equal the requested ones.
// Team's Claude owns the fix. Not wired into npm scripts or init.sh. Run:
//   node --import tsx --test --test-name-pattern='^control' tests/known-red/W3-lib-onlyfans-4-plus2-vault.test.ts   (green)
//   node --import tsx --test --test-skip-pattern='^control' tests/known-red/W3-lib-onlyfans-4-plus2-vault.test.ts   (red, ERR_ASSERTION)
// Synthetic values only.
import assert from "node:assert/strict";
import test from "node:test";
import { createVaultBackend } from "../../lib/onlyfans/vault-backend";
import { createVaultMediaBackend } from "../../lib/onlyfans/vault-media-backend";
import { CONTENT_SCHEMA } from "../../lib/onlyfans/content";

const BASE = "https://backend.invalid";
const TOKEN = "synthetic-token";
const ACCOUNT = "of-1001";
const ID = { actor: "op-session:" + "a".repeat(64), commandKey: "b".repeat(64) };
const FP = "c".repeat(64);
type Wire = { url: string; method: string; status: number };

function wire(answer: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Wire[] = [];
  const fetchImpl = (async (url: string | URL, init: RequestInit = {}) => {
    const response = await answer(String(url), init);
    calls.push({ url: String(url), method: init.method ?? "GET", status: response.status });
    return response;
  }) as typeof fetch;
  return { calls, fetchImpl };
}
const status = (code: number) => wire(() => new Response(code === 204 ? null : "{}", { status: code }));

const vaultWrites: Array<[string, (b: ReturnType<typeof createVaultBackend>) => Promise<{ ok: boolean; status?: number; outcome?: string }>]> = [
  ["sync", b => b.sync(ACCOUNT, { expectedConnectionRevision: 3, ...ID })],
  ["create product", b => b.create(ACCOUNT, { product: { label: "Set", description: "Desc", priceCents: 1200, enabled: true, mediaIds: ["11", "12"], previewMediaIds: ["11"] }, ...ID })],
  ["asset edit", b => b.editResource(ACCOUNT, "assets/11", { patch: { description: "x" }, expectedFingerprint: FP, ...ID })],
  ["folder create", b => b.editResource(ACCOUNT, "folders", { action: "create", name: "New", mediaIds: null, expectedFingerprint: null, ...ID })],
  ["category price", b => b.setCategoryPrice(ACCOUNT, "7", { priceCents: 1500, expectedFingerprint: FP, ...ID })],
  ["category drafts", b => b.categoryDrafts(ACCOUNT, { category: {} as never, ...ID })],
];

for (const [name, run] of vaultWrites) {
  test(`control: vault ${name} answered 409 is refused after one POST`, async () => {
    const w = status(409);
    const r = await run(createVaultBackend({ baseUrl: BASE, token: TOKEN, fetchImpl: w.fetchImpl }));
    assert.equal(w.calls.length, 1); assert.equal(w.calls[0].method, "POST");
    assert.equal(r.ok, false); assert.equal(r.status, 409); assert.equal(r.outcome, "refused");
  });
  test(`control: vault ${name} answered 502 is unconfirmed`, async () => {
    const w = status(502);
    const r = await run(createVaultBackend({ baseUrl: BASE, token: TOKEN, fetchImpl: w.fetchImpl }));
    assert.equal(r.ok, false); assert.equal(r.outcome, "unconfirmed");
  });
  test(`F1: vault ${name} answered 503 is unconfirmed (not refused, not relayed as 503)`, async () => {
    const w = status(503);
    const r = await run(createVaultBackend({ baseUrl: BASE, token: TOKEN, fetchImpl: w.fetchImpl }));
    assert.equal(w.calls.length, 1, "attempted once");
    assert.equal(r.ok, false);
    assert.deepEqual({ outcome: r.outcome, not503: r.status !== 503 }, { outcome: "unconfirmed", not503: true });
  });
}

const media = (fetchImpl: typeof fetch) => createVaultMediaBackend({ baseUrl: BASE, token: TOKEN, fetchImpl });
const JOB = "0a1b2c3d-1111-4222-8333-444455556661";
const FILE_A = "0a1b2c3d-1111-4222-8333-44445555aaaa";
const FILE_B = "0a1b2c3d-1111-4222-8333-44445555bbbb";
const stamp = "2026-11-12T00:00:00Z";
const job = (...fileIds: string[]) => ({ jobId: JOB, kind: "upload", status: "receiving", lastError: null, cleanupRequired: false, requestedAt: stamp, updatedAt: stamp,
  files: fileIds.map(fileId => ({ fileId, name: "a.jpg", size: 10, receivedBytes: 0, prefixDigest: null, status: "receiving", mediaId: null, processing: false, error: null })) });
const uploadAck = (...fileIds: string[]) => ({ schemaVersion: CONTENT_SCHEMA, ok: true, accountId: ACCOUNT, upload: job(...fileIds) });

const mediaWrites: Array<[string, (b: ReturnType<typeof media>) => Promise<{ ok: boolean; status?: number; outcome?: string }>]> = [
  ["upload create", b => b.create(ACCOUNT, { files: [{ fileId: FILE_A, name: "a.jpg", size: 10 }], expectedConnectionRevision: 3, ...ID }) as never],
  ["upload finish", b => b.action(ACCOUNT, JOB, "finish", ID) as never],
  ["upload cancel", b => b.action(ACCOUNT, JOB, "cancel", ID) as never],
  ["chunk", b => b.chunk(ACCOUNT, JOB, FILE_A, 0, "d".repeat(64), new Uint8Array([1, 2, 3]), ID.actor) as never],
  ["video prepare", b => b.video(ACCOUNT, "11", ID) as never],
];
for (const [name, run] of mediaWrites) {
  test(`control: media ${name} answered 409 is not ok after one POST`, async () => {
    const w = status(409);
    const r = await run(media(w.fetchImpl));
    assert.equal(w.calls.length, 1); assert.equal(w.calls[0].method, "POST"); assert.equal(r.ok, false); assert.equal(r.status, 409);
    assert.notEqual(r.outcome, "unconfirmed", "a 409 proves not applied");
  });
  for (const code of [429, 503]) test(`F2: media ${name} answered ${code} is unconfirmed (not relayed as ${code})`, async () => {
    const w = status(code);
    const r = await run(media(w.fetchImpl));
    assert.equal(r.ok, false);
    assert.deepEqual({ outcome: r.outcome, relayed: r.status === code }, { outcome: "unconfirmed", relayed: false });
  });
}
test("F2: a video prepare whose 200 body fails the contract is unconfirmed, never 503", async () => {
  const w = wire(() => Response.json({ schemaVersion: CONTENT_SCHEMA, ok: true, accountId: ACCOUNT, video: { mediaId: "11" } }));
  const r = await media(w.fetchImpl).video(ACCOUNT, "11", ID) as { ok: boolean; status?: number; outcome?: string };
  assert.equal(r.ok, false);
  assert.deepEqual({ outcome: r.outcome, not503: r.status !== 503 }, { outcome: "unconfirmed", not503: true });
});

const streamHeaders = (account: string, media: string) => ({ "X-OnlyFans-Account-Id": account, "X-OnlyFans-Media-Id": media, "X-OnlyFans-Video": "vault-video.v1" });
test("control: a 206 stream for another account is refused", async () => {
  const w = wire(() => new Response(new Uint8Array(4), { status: 206, headers: { ...streamHeaders("of-2002", "11"), "Content-Type": "video/mp4", "Content-Length": "4", "Content-Range": "bytes 0-3/100" } }));
  const r = await media(w.fetchImpl).stream(ACCOUNT, "11", "bytes=0-3");
  assert.equal(r.ok, false);
});
test("control: a 416 carrying this account's identity headers forwards its Content-Range", async () => {
  const w = wire(() => new Response(null, { status: 416, headers: { ...streamHeaders(ACCOUNT, "11"), "Content-Range": "bytes */100" } }));
  const r = await media(w.fetchImpl).stream(ACCOUNT, "11", "bytes=500-");
  assert.equal(r.ok, true);
});
test("F9: a 416 for another account/media is refused, not forwarded with its Content-Range", async () => {
  const w = wire(() => new Response(null, { status: 416, headers: { ...streamHeaders("of-2002", "99"), "Content-Range": "bytes */123456" } }));
  const r = await media(w.fetchImpl).stream(ACCOUNT, "11", "bytes=500-");
  assert.equal(r.ok, false, "416 must pass the same identity checks as 200/206 (vault-media-backend.ts:50-51)");
});

test("control: an upload-create ack whose job holds the requested file is ok", async () => {
  const w = wire(() => Response.json(uploadAck(FILE_A)));
  const r = await media(w.fetchImpl).create(ACCOUNT, { files: [{ fileId: FILE_A, name: "a.jpg", size: 10 }], expectedConnectionRevision: 3, ...ID });
  assert.equal(r.ok, true);
});
test("F10: an upload-create ack for a job holding other files is not this command's success", async () => {
  const w = wire(() => Response.json(uploadAck(FILE_B)));
  const r = await media(w.fetchImpl).create(ACCOUNT, { files: [{ fileId: FILE_A, name: "a.jpg", size: 10 }], expectedConnectionRevision: 3, ...ID });
  assert.equal(r.ok, false);
});
test("F10: an upload-create ack whose job holds the requested file plus another is not an exact match", async () => {
  const w = wire(() => Response.json(uploadAck(FILE_A, FILE_B)));
  const r = await media(w.fetchImpl).create(ACCOUNT, { files: [{ fileId: FILE_A, name: "a.jpg", size: 10 }], expectedConnectionRevision: 3, ...ID });
  assert.equal(r.ok, false, "ack fileIds must equal the requested set");
});
