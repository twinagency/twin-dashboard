// G04c1 (G30b F6 deferral): a held shared-media receipt answered from the row with zero backend calls, so the operator could never
// learn that its provider job later completed (adopt it), and the source was stuck.
// Fix: POST `{ kind, sourceId, action: "refresh" }` on the same route and gate re-reads the held receipt's provider job via the
// backend's uploads read (read only, zero upstream writes; the one exception to G30b F3) and persists it through sharedUploadProgress
// ONLY when the projection is adopted (complete with a vault media id) or still held and terminal. Any projection that would leave
// the hold (a retryable pair, or an active status) is refused 503 with the row unchanged (R1 O1: a backend claim race can write a
// transient expired, D5; a hold is better than a duplicate upload). A job missing upstream is not proof (it may have aged out of
// history): the row stays held. Refresh covers both holds (a review hold and a cleanup hold). An active receipt (resume it instead),
// a receipt with no job id, and a file with no live receipt are refused 409 with zero upstream calls and no new receipt: refresh
// never starts, resumes or retries an upload. GET emits `held` from the STORED row, before its provider overlay (R1 O2).
// Drives the real POST/GET app/api/onlyfans-content/accounts/[accountId]/shared-media/route.ts through the G05 harness
// (tests/helpers/W3-api-onlyfans-plus7-harness.ts). Real: the route, lib/shared-media.ts, vault-media-backend over the fake wire.
// Bypasses declared: `state.db` is tests/support/G30b-shared-route-fakes.ts sharedFakeDb (see its header);
// `lib/onlyfans/vault-backend.ts` is mocked (connectionRevision 3). Synthetic values only.
import assert from "node:assert/strict";
import test, { beforeEach, mock } from "node:test";
import { call, ensureModuleMocks, ready, reset, servicePath, state, upstream, type Call } from "../helpers/W3-api-onlyfans-plus7-harness";
import { SHARED_LIVE_CASES } from "../support/G30b-shared-live-cases";
import { ACTOR, C, FILE, JOB, ROUTE, S, UPLOADS, answer, createdFile, creates, receipt, sharedFakeDb, uploadsList, work, type Row } from "../support/G30b-shared-route-fakes";

const store: { rows: Row[]; racer: Row | null } = { rows: [], racer: null };
const ACTIVE = ["prepared", "receiving", "pending", "running"];
const REVIEW = { status: "failed", error_code: "provider_review_required", job_id: JOB, received_bytes: 1024 };
const job = (status: string, file: Row = {}, over: Row = {}) => ({ jobId: JOB, kind: "upload", status, lastError: null, cleanupRequired: false,
  requestedAt: "2026-11-12T00:00:00Z", updatedAt: "2026-11-12T00:00:00Z",
  files: [{ fileId: FILE, name: `${S}.jpg`, size: 1024, receivedBytes: 1024, prefixDigest: null, status: "staged", mediaId: null, processing: false, error: null, ...file }], ...over });
/** The wire with the uploads read answering `jobs` (or `read` for a raw answer). */
const withJobs = (jobs: unknown[], read?: () => Response) => upstream(c => c.method === "GET" && servicePath(c) === UPLOADS ? (read ? read() : uploadsList(jobs)) : answer(c));
const share = (headers?: Record<string, string>) => call(ROUTE, { accountId: "of-a" }, { body: { kind: "photo", sourceId: S }, query: `?creator=${C}`, headers });
const check = (headers?: Record<string, string>) => call(ROUTE, { accountId: "of-a" }, { body: { kind: "photo", sourceId: S, action: "refresh" }, query: `?creator=${C}`, headers });
const wire = () => work().map((c: Call) => `${c.method} ${servicePath(c)}`);
const transferOf = async (response: Response) => ((await response.json()) as { transfer: { id: string; status: string; mediaId: string | null } }).transfer;

if (ensureModuleMocks(import.meta.url, { controls: 2, rest: 10 }, () => {
  mock.module(new URL("../../lib/onlyfans/vault-backend.ts", import.meta.url).href, { namedExports: {
    configuredVaultBackend: () => ({ get: async () => ({ ok: true, data: { connectionRevision: 3 } }) }),
  } });
})) {
  beforeEach(async () => {
    await ready(); reset(); store.rows = []; store.racer = null; state.db = sharedFakeDb(store); upstream(answer);
    state.backend = { listAccounts: async () => ({ ok: true, data: [{ accountId: "of-a", binding: { creatorId: C }, health: "connected", capabilities: { manageContent: "available" } }] }) };
    state.identity = { grant: { creatorIds: [C], actor: ACTOR, canManage: true, canChat: true } };
  });

  test("control: without refresh a held receipt is still answered from the row, zero backend calls", async () => {
    store.rows = [receipt(REVIEW)];
    withJobs([job("complete", { status: "done", mediaId: "777" })]);
    const response = await share();
    assert.equal(response.status, 200);
    assert.equal((await transferOf(response)).status, "failed");
    assert.deepEqual(wire(), []);
  });

  test("control: an unknown action is refused before any receipt read", async () => {
    store.rows = [receipt(REVIEW)];
    const response = await call(ROUTE, { accountId: "of-a" }, { body: { kind: "photo", sourceId: S, action: "retry" }, query: `?creator=${C}` });
    assert.equal(response.status, 400);
    assert.deepEqual(wire(), []);
  });

  test("held + provider complete with media: adopted, only the uploads read, no create", async () => {
    store.rows = [receipt(REVIEW)];
    withJobs([job("complete", { status: "done", mediaId: "777" })]);
    const response = await check();
    assert.equal(response.status, 200);
    const adopted = await transferOf(response);
    assert.deepEqual([adopted.id, adopted.status, adopted.mediaId], ["receipt-1", "complete", "777"]);
    assert.deepEqual(wire(), [`GET ${UPLOADS}`], "only the uploads read");
    assert.equal(store.rows.length, 1, "no new receipt");
    assert.deepEqual([store.rows[0].status, store.rows[0].media_id, store.rows[0].error_code], ["complete", "777", null], "persisted");
    assert.equal(creates().length, 0, "no upstream create");
    // A later share answers the adopted row: complete, still no create.
    upstream(answer);
    const later = await share();
    assert.equal((await transferOf(later)).status, "complete");
    assert.deepEqual(wire(), []);
  });

  // R1 O1: the projection would leave the hold (D5: a claim race can store a transient expired), so it is refused, never stored.
  const leaving: Array<[string, ReturnType<typeof job>]> = [
    ["expired/media_request_expired pair", job("expired", { receivedBytes: 0, status: "receiving" }, { lastError: "media_request_expired" })],
    ["superseded/media_connection_changed pair", job("superseded", { receivedBytes: 0, status: "receiving" }, { lastError: "media_connection_changed" })],
    ["receiving", job("receiving", { receivedBytes: 0, status: "receiving" })], ["pending", job("pending")], ["running", job("running")],
  ];
  for (const [held, over] of [["operator cancel", { status: "expired", error_code: null, received_bytes: 0 }], ["review hold", REVIEW]] as const) {
    for (const [name, upstreamJob] of leaving) {
      test(`${held} + provider reads ${name}: stays held, 503, row unchanged, a later POST makes no create`, async () => {
        store.rows = [receipt({ ...over, job_id: JOB })];
        const before = structuredClone(store.rows[0]);
        withJobs([upstreamJob]);
        const response = await check();
        assert.equal(response.status, 503);
        assert.equal(((await response.json()) as { ok: boolean }).ok, false);
        assert.deepEqual(store.rows, [before], "row unchanged");
        assert.deepEqual(wire(), [`GET ${UPLOADS}`], "only the uploads read: no chunk, no finish, no source read");
        upstream(answer);
        assert.equal((await share()).status, 200);
        assert.deepEqual([store.rows.length, creates().length], [1, 0], "no fresh receipt, no upstream create");
      });
    }
  }

  test("held + provider still failed: stays held, a later POST makes no create", async () => {
    store.rows = [receipt(REVIEW)];
    withJobs([job("failed", { status: "failed", error: "upload_failed" }, { lastError: "upload_failed" })]);
    assert.equal((await check()).status, 200);
    assert.deepEqual([store.rows[0].status, store.rows[0].error_code], ["failed", "provider_review_required"]);
    upstream(answer);
    await share();
    assert.equal(store.rows.length, 1);
    assert.equal(creates().length, 0);
  });

  test("held + job missing upstream: still held, row unchanged, no create", async () => {
    store.rows = [receipt(REVIEW)];
    const before = structuredClone(store.rows[0]);
    withJobs([]);
    const response = await check();
    assert.equal(response.status, 409);
    assert.equal(((await response.json()) as { ok: boolean }).ok, false);
    assert.deepEqual(store.rows, [before]);
    assert.deepEqual(wire(), [`GET ${UPLOADS}`]);
  });

  test("held receipt with no job id: refused 409 before any upstream read, row unchanged", async () => {
    store.rows = [receipt({ ...REVIEW, job_id: null })];
    const before = structuredClone(store.rows[0]);
    const response = await check();
    assert.equal(response.status, 409);
    assert.deepEqual(wire(), []);
    assert.deepEqual(store.rows, [before]);
  });

  for (const read of [() => Response.json({ ok: false }, { status: 503 }), () => Response.json({ ok: false }, { status: 500 }), () => Response.json({ nonsense: true })]) {
    test(`held + upstream read fails (${read().status}): row unchanged, not success`, async () => {
      store.rows = [receipt(REVIEW)];
      const before = structuredClone(store.rows[0]);
      withJobs([], read);
      const response = await check();
      assert.ok(response.status >= 500, `status ${response.status}`);
      assert.equal(((await response.json()) as { ok: boolean }).ok, false);
      assert.deepEqual(store.rows, [before]);
    });
  }

  test("held + provider job no longer matches the receipt: row unchanged, not success", async () => {
    store.rows = [receipt(REVIEW)];
    const before = structuredClone(store.rows[0]);
    withJobs([job("complete", { status: "done", mediaId: "777", fileId: "cccccccc-cccc-4ccc-8ccc-000000000009" })]);
    const response = await check();
    assert.equal(response.status, 503);
    assert.deepEqual(store.rows, [before]);
  });

  for (const [status, error_code, media_id] of SHARED_LIVE_CASES.filter(c => c[3] && !ACTIVE.includes(c[0]) && c[1] !== "provider_cleanup_required")) {
    test(`refresh of a held '${status}/${error_code}/${media_id}' receipt makes exactly one upstream call, the uploads read`, async () => {
      store.rows = [receipt({ status, error_code, media_id, job_id: JOB })];
      withJobs([job("complete", { status: "done", mediaId: "777" })]);
      await check();
      assert.deepEqual(wire(), [`GET ${UPLOADS}`], "zero upstream writes");
      assert.equal(store.rows.length, 1, "no new receipt");
    });
  }

  test("a cleanup hold is refreshed the same way: only the uploads read, still held while OnlyFans reports cleanup", async () => {
    store.rows = [receipt({ status: "failed", error_code: "provider_cleanup_required", job_id: JOB })];
    withJobs([job("complete", { status: "done", mediaId: "777" }, { cleanupRequired: true })]);
    const response = await check();
    assert.equal(response.status, 200);
    assert.deepEqual([store.rows[0].status, store.rows[0].error_code], ["failed", "provider_cleanup_required"]);
    assert.deepEqual(wire(), [`GET ${UPLOADS}`]);
  });

  for (const status of ACTIVE) {
    test(`an active '${status}' receipt: refresh is refused 409, zero upstream calls (resume it instead)`, async () => {
      const over = { status, job_id: status === "prepared" ? null : JOB };
      store.rows = [receipt(over)];
      const before = structuredClone(store.rows[0]);
      const response = await check();
      assert.equal(response.status, 409);
      assert.deepEqual(wire(), []);
      assert.deepEqual(store.rows, [before]);
    });
  }

  for (const rows of [[], [receipt({ status: "expired", error_code: "media_request_expired", job_id: JOB })]]) {
    test(`no live receipt (${rows.length ? "retryable history only" : "none"}): refresh is refused 409, nothing created`, async () => {
      store.rows = rows;
      const response = await check();
      assert.equal(response.status, 409);
      assert.equal(store.rows.length, rows.length, "no receipt inserted");
      assert.deepEqual(wire(), [], "no source read, no upload status, no create");
    });
  }

  const gates: Array<[string, () => void, Record<string, string>?]> = [
    ["read-only team member", () => { state.identity = { grant: { creatorIds: [C], actor: ACTOR, canManage: false, canChat: true } }; }],
    ["creator outside the grant", () => { state.identity = { grant: { creatorIds: ["99999999-9999-4999-8999-999999999999"], actor: ACTOR, canManage: true } }; }],
    ["another team member's receipt", () => { state.identity = { grant: { creatorIds: [C], actor: ACTOR.replace(/f{12}$/, "0".repeat(12)), canManage: true } }; }],
    ["cross-site request", () => {}, { "sec-fetch-site": "cross-site" }],
    ["disconnected account", () => { state.backend = { listAccounts: async () => ({ ok: true, data: [{ accountId: "of-a", binding: { creatorId: C }, health: "reconnect_required", capabilities: { manageContent: "available" } }] }) }; }],
  ];
  for (const [name, arrange, headers] of gates) {
    test(`the gate matches upload: ${name}`, async () => {
      store.rows = [receipt(REVIEW)];
      arrange();
      withJobs([job("complete", { status: "done", mediaId: "777" })]);
      const upload = await share(headers);
      const refresh = await check(headers);
      assert.ok(refresh.status >= 400, `refresh allowed: ${refresh.status}`);
      assert.equal(refresh.status, upload.status);
      assert.equal(store.rows[0].status, "failed", "row unchanged");
      assert.equal(creates().length, 0);
      assert.deepEqual(wire().filter(c => c === `GET ${UPLOADS}`), [], "no provider read past the gate");
    });
  }

  const list = async () => ((await (await call(ROUTE, { accountId: "of-a" }, { query: `?creator=${C}` })).json()) as { transfers: Array<{ id: string; status: string; held: boolean }> }).transfers;
  test("GET: a held receipt whose provider job reads complete is still held (held is the stored row, before the overlay)", async () => {
    store.rows = [receipt(REVIEW)];
    withJobs([job("complete", { status: "done", mediaId: "777" })]);
    const [row] = await list();
    assert.deepEqual([row.status, row.held], ["complete", true]);
    assert.deepEqual(store.rows[0].status, "failed", "GET persists nothing");
  });

  for (const [name, over, held] of [
    ["retryable history", { status: "expired", error_code: "media_request_expired", job_id: JOB }, false],
    ["adopted", { status: "complete", media_id: "777", job_id: JOB }, false],
    ["active", { status: "pending", job_id: JOB }, false],
    ["cleanup hold", { status: "failed", error_code: "provider_cleanup_required", job_id: JOB }, true],
    ["operator cancel", { status: "expired", error_code: null, job_id: JOB }, true],
  ] as const) {
    test(`GET: a ${name} receipt reads held=${held}`, async () => {
      store.rows = [receipt(over)];
      withJobs([]);
      assert.equal((await list())[0].held, held);
    });
  }

  // R1 O4: share and refresh on the same held row, interleaved at the route's await points (the fake db is in memory; the real
  // row-lock race is the backend's, D5). Neither may create, and a refresh that would leave the hold stores nothing.
  test("race: share and refresh on one held row, provider complete: adopted once, no create, one receipt", async () => {
    store.rows = [receipt(REVIEW)];
    withJobs([job("complete", { status: "done", mediaId: "777" })]);
    const answers = await Promise.all([share(), check(), share(), check()]);
    assert.deepEqual(answers.map(r => r.status), [200, 200, 200, 200]);
    assert.deepEqual([store.rows.length, creates().length, store.rows[0].status, store.rows[0].media_id], [1, 0, "complete", "777"]);
  });

  test("race: share and refresh on one held row, provider reads a retryable pair: still held, no create, one receipt", async () => {
    store.rows = [receipt(REVIEW)];
    const before = structuredClone(store.rows[0]);
    withJobs([job("expired", { receivedBytes: 0, status: "receiving" }, { lastError: "media_request_expired" })]);
    const answers = await Promise.all([check(), share(), check(), share()]);
    assert.deepEqual(answers.map(r => r.status), [503, 200, 503, 200]);
    assert.deepEqual(store.rows, [before]);
    assert.equal(creates().length, 0);
  });
}
