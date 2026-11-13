// G30b (W5 db-migrations F5, route half): a failed/expired shared-media receipt blocked the same file forever. The POST looked the
// receipt up by (account, source) with maybeSingle and returned a non-active one as-is, so no retry could ever start.
// R1: retry only a receipt whose stored state PROVES the provider never received the file (lib/shared-media.ts
// RETRYABLE_SHARED_OUTCOMES). Every other terminal receipt stays live: a review hold answers from the row with zero backend
// calls, a cleanup hold continues into the job flow. A retry mints a new file_id and commandKey, so a wrong "retryable" is a
// duplicate vault upload.
// Drives the real POST app/api/onlyfans-content/accounts/[accountId]/shared-media/route.ts through the G05 harness
// (tests/helpers/W3-api-onlyfans-plus7-harness.ts). Real: the route, lib/shared-media.ts, vault-media-backend over the fake wire.
// Bypasses declared: `state.db` is tests/support/G30b-shared-route-fakes.ts sharedFakeDb, an in-memory serviceClient whose shared_media_transfers insert is unique per (account, source)
// among LIVE rows only (an independent copy of the partial unique index in 20261113100300; the index itself is proven against
// real PostgreSQL in G30b-shared-media-retry-index.test.mjs), and whose `.or()` evaluates the PostgREST logic tree itself
// (`and()`/`or()` nesting, `eq`/`neq`/`in`/`is` with an optional `not.`, SQL null semantics). `lib/onlyfans/vault-backend.ts` is
// mocked (connectionRevision 3). Synthetic values only.
import assert from "node:assert/strict";
import test, { beforeEach, mock } from "node:test";
import { CONTENT_SCHEMA } from "../../lib/onlyfans/content";
import { MAX_CHUNK_BYTES, MEDIA_SCHEMA } from "../../lib/onlyfans/vault-media";
import { LIVE_SHARED_FILTER } from "../../lib/shared-media";
import { call, ensureModuleMocks, ready, reset, servicePath, state, upstream } from "../helpers/W3-api-onlyfans-plus7-harness";
import { SHARED_LIVE_CASES } from "../support/G30b-shared-live-cases";
import { ACTOR, C, FILE, JOB, ROUTE, S, answer, createdFile, creates, orTerm, receipt, sharedFakeDb, work, type Row } from "../support/G30b-shared-route-fakes";

let rows: Row[] = [];
let racer: Row | null = null; // inserted by a "concurrent" request just before the route's own insert
const fakeDb = () => sharedFakeDb({ get rows() { return rows; }, get racer() { return racer; }, set racer(value) { racer = value; } });
const share = () => call(ROUTE, { accountId: "of-a" }, { body: { kind: "photo", sourceId: S }, query: `?creator=${C}` });

if (ensureModuleMocks(import.meta.url, { controls: 2, rest: 5 }, () => {
  mock.module(new URL("../../lib/onlyfans/vault-backend.ts", import.meta.url).href, { namedExports: {
    configuredVaultBackend: () => ({ get: async () => ({ ok: true, data: { connectionRevision: 3 } }) }),
  } });
})) {
  beforeEach(async () => {
    await ready(); reset(); state.db = fakeDb(); racer = null; upstream(answer);
    state.backend = { listAccounts: async () => ({ ok: true, data: [{ accountId: "of-a", binding: { creatorId: C }, health: "connected", capabilities: { manageContent: "available" } }] }) };
    state.identity = { grant: { creatorIds: [C], actor: ACTOR, canManage: true, canChat: true } };
  });

  test("control: an active receipt resumes, no new receipt", async () => {
    rows = [receipt()];
    const response = await share();
    assert.equal(response.status, 200);
    assert.equal(rows.length, 1);
    assert.equal(createdFile(), FILE, "the create carries the existing receipt's file");
    assert.equal(((await response.json()) as { transfer: { id: string } }).transfer.id, "receipt-1");
  });

  test("control: a failed receipt held for provider cleanup still blocks a new attempt", async () => {
    rows = [receipt({ status: "failed", error_code: "provider_cleanup_required", job_id: JOB })];
    const response = await share();
    assert.equal(response.status, 409);
    assert.equal(rows.length, 1, "no new receipt");
    assert.equal(creates().length, 0, "no upstream create");
  });

  test("the route's live filter matches the literal live table", () => {
    const where = orTerm(`or(${LIVE_SHARED_FILTER})`);
    for (const [status, error_code, media_id, expected] of SHARED_LIVE_CASES)
      assert.equal(where(receipt({ status, error_code, media_id })), expected, `${status}/${error_code}/${media_id}`);
  });

  for (const [status, error_code] of SHARED_LIVE_CASES.filter(c => !c[3])) {
    test(`F5: after a '${status}/${error_code}' receipt a new POST creates a fresh receipt and proceeds`, async () => {
      rows = [receipt({ status, error_code, job_id: JOB })];
      const response = await share();
      assert.equal(response.status, 200, `retry after '${status}' did not proceed`);
      assert.equal(rows.length, 2, "the old receipt is kept and a fresh one added");
      assert.equal(rows[0].status, status, "history unchanged");
      const fresh = rows[1], body = (await response.json()) as { transfer: { id: string; status: string } };
      assert.notEqual(fresh.id, "receipt-1");
      assert.notEqual(fresh.file_id, FILE);
      assert.equal(createdFile(), fresh.file_id, "the upstream create carries the fresh receipt's file");
      assert.deepEqual([body.transfer.id, body.transfer.status], [fresh.id, "pending"]);
    });
  }

  const ACTIVE = ["prepared", "receiving", "pending", "running"];
  for (const [status, error_code, media_id] of SHARED_LIVE_CASES.filter(c => c[3] && !ACTIVE.includes(c[0]) && c[1] !== "provider_cleanup_required")) {
    test(`R1 F3: a held '${status}/${error_code}/${media_id}' receipt is answered from the row, zero backend calls`, async () => {
      rows = [receipt({ status, error_code, media_id, job_id: JOB })];
      const response = await share();
      assert.equal(response.status, 200);
      assert.equal(rows.length, 1, "no new receipt");
      assert.deepEqual(work().map(c => `${c.method} ${c.url}`), [], "no source read, no upload status, no create");
      assert.equal(((await response.json()) as { transfer: { id: string } }).transfer.id, "receipt-1");
    });
  }

  test("R1 1b: an old failed receipt whose provider job finished with a mediaId is not retried", async () => {
    rows = [receipt({ status: "failed", error_code: "provider_review_required", job_id: JOB, received_bytes: 1024 })];
    upstream(c => servicePath(c) === "/onlyfans/content/v1/accounts/of-a/vault/uploads" && c.method === "GET"
      ? Response.json({ schemaVersion: CONTENT_SCHEMA, ok: true, accountId: "of-a", uploads: { schemaVersion: MEDIA_SCHEMA, accountId: "of-a", maxFiles: 20, maxFileBytes: 1024 ** 3,
        chunkBytes: MAX_CHUNK_BYTES, enabled: true, jobs: [{ jobId: JOB, kind: "upload", status: "complete", lastError: null, cleanupRequired: false, requestedAt: "2026-11-12T00:00:00Z",
          updatedAt: "2026-11-12T00:00:00Z", files: [{ fileId: FILE, name: `${S}.jpg`, size: 1024, receivedBytes: 1024, prefixDigest: null, status: "done", mediaId: "777", processing: false, error: null }] }] } })
      : answer(c));
    const response = await share();
    assert.equal(response.status, 200);
    assert.equal(rows.length, 1, "no second receipt");
    assert.equal(creates().length, 0, "no second upstream job");
    assert.deepEqual(work().map(c => `${c.method} ${c.url}`), []);
  });

  test("F5: a concurrent insert (23505) falls back to the live receipt, not the retryable one", async () => {
    rows = [receipt({ status: "expired", error_code: "media_request_expired", job_id: JOB })];
    racer = receipt({ id: "receipt-2", file_id: "cccccccc-cccc-4ccc-8ccc-000000000002" });
    const response = await share();
    assert.equal(response.status, 200);
    assert.equal(rows.length, 2, "only the racer's live receipt was added");
    assert.equal(createdFile(), "cccccccc-cccc-4ccc-8ccc-000000000002", "resumed the racer's live receipt");
  });
}
