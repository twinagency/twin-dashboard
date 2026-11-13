// G30b (W5 db-migrations F5, route half): a failed/expired shared-media receipt blocked the same file forever. The POST looked the
// receipt up by (account, source) with maybeSingle and returned a non-active one as-is, so no retry could ever start.
// R1: retry only a receipt whose stored state PROVES the provider never received the file (lib/shared-media.ts
// RETRYABLE_SHARED_OUTCOMES). Every other terminal receipt stays live: a review hold answers from the row with zero backend
// calls, a cleanup hold continues into the job flow. A retry mints a new file_id and commandKey, so a wrong "retryable" is a
// duplicate vault upload.
// Drives the real POST app/api/onlyfans-content/accounts/[accountId]/shared-media/route.ts through the G05 harness
// (tests/helpers/W3-api-onlyfans-plus7-harness.ts). Real: the route, lib/shared-media.ts, vault-media-backend over the fake wire.
// Bypasses declared: `state.db` is an in-memory serviceClient whose shared_media_transfers insert is unique per (account, source)
// among LIVE rows only (an independent copy of the partial unique index in 20261113100300; the index itself is proven against
// real PostgreSQL in G30b-shared-media-retry-index.test.mjs), and whose `.or()` evaluates the PostgREST logic tree itself
// (`and()`/`or()` nesting, `eq`/`neq`/`in`/`is` with an optional `not.`, SQL null semantics). `lib/onlyfans/vault-backend.ts` is
// mocked (connectionRevision 3). Synthetic values only.
import assert from "node:assert/strict";
import test, { beforeEach, mock } from "node:test";
import { CONTENT_SCHEMA } from "../../lib/onlyfans/content";
import { MAX_CHUNK_BYTES, MEDIA_SCHEMA } from "../../lib/onlyfans/vault-media";
import { LIVE_SHARED_FILTER } from "../../lib/shared-media";
import { PREFLIGHT, SUPABASE, call, calls, ensureModuleMocks, ready, reset, servicePath, state, upstream, type Call } from "../helpers/W3-api-onlyfans-plus7-harness";
import { SHARED_LIVE_CASES } from "../support/G30b-shared-live-cases";

type Row = Record<string, unknown>;
const ROUTE = "onlyfans-content/accounts/[accountId]/shared-media";
const C = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", S = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", FILE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const JOB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd", ACTOR = "agency-user:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee:ffffffff-ffff-4fff-8fff-ffffffffffff";
// Independent of lib/shared-media.ts: retryable only for these exact (status, error_code) pairs with no vault media id.
const live = (r: Row) => r.media_id != null || !(r.status === "expired" && r.error_code === "media_request_expired" || r.status === "superseded" && r.error_code === "media_connection_changed");
const sameKey = (a: Row, b: Row) => ["account_id", "source_kind", "source_id"].every(k => a[k] === b[k]);
let rows: Row[] = [];
let racer: Row | null = null; // inserted by a "concurrent" request just before the route's own insert
const SOURCE = new Uint8Array(1024).fill(7); SOURCE.set([255, 216, 255, 224]);

// PostgREST logic tree: comma list at depth 0, `and(..)`/`or(..)` groups, `col.[not.]op.value` leaves. A comparison with a SQL
// null is unknown, which this two-valued fake treats as false (sound here: no group is negated).
function splitTop(list: string) {
  const parts: string[] = []; let depth = 0, start = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i] === "(") depth++; else if (list[i] === ")") depth--;
    else if (list[i] === "," && depth === 0) { parts.push(list.slice(start, i)); start = i + 1; }
  }
  return [...parts, list.slice(start)];
}
function orTerm(term: string): (r: Row) => boolean {
  const group = /^(and|or)\((.*)\)$/.exec(term);
  if (group) { const terms = splitTop(group[2]).map(orTerm); return group[1] === "and" ? r => terms.every(t => t(r)) : r => terms.some(t => t(r)); }
  const m = /^(\w+)\.(not\.)?(eq|neq|in|is)\.(.*)$/.exec(term); if (!m) throw Error(`unsupported or term ${term}`);
  const [, col, not, op, raw] = m;
  if (op === "is") { if (raw !== "null") throw Error(`unsupported is ${raw}`); return r => (r[col] == null) !== !!not; }
  const list = op === "in" ? raw.replace(/^\(|\)$/g, "").split(",") : [raw];
  return r => r[col] != null && (list.includes(r[col] as string) !== (op === "neq")) !== !!not;
}
function fakeDb() {
  return {
    storage: { from: () => ({ createSignedUrl: async (path: string) => ({ data: { signedUrl: `${SUPABASE}/storage/v1/object/sign/media/${path}?sig=synthetic` }, error: null }) }) },
    from(table: string) {
      const preds: Array<(r: Row) => boolean> = [];
      let op: { kind: "select" } | { kind: "update"; patch: Row } | { kind: "insert"; value: Row } = { kind: "select" };
      const result = (): { data: Row[] | null; error: { code: string } | null } => {
        if (table === "photos") return { data: [{ id: S, clone_id: C, storage_path: `${C}/photos/saved.jpg` }].filter(r => preds.every(p => p(r))), error: null };
        if (op.kind === "insert") {
          if (racer) { rows.push(racer); racer = null; }
          const row = { job_id: null, media_id: null, status: "prepared", processing: false, received_bytes: 0, error_code: null, ...op.value };
          if (rows.some(r => sameKey(r, row) && live(r))) return { data: null, error: { code: "23505" } };
          rows.push(row); return { data: [{ ...row }], error: null };
        }
        const hit = rows.filter(r => preds.every(p => p(r)));
        if (op.kind === "update") { const patch = op.patch; hit.forEach(r => Object.assign(r, patch)); }
        return { data: hit.map(r => ({ ...r })), error: null };
      };
      const q: Record<string, unknown> = {
        select: () => q, order: () => q, limit: () => q,
        eq: (k: string, v: unknown) => { preds.push(r => r[k] === v); return q; },
        or: (filter: string) => { preds.push(orTerm(`or(${filter})`)); return q; },
        insert: (value: Row) => { op = { kind: "insert", value }; return q; },
        update: (patch: Row) => { op = { kind: "update", patch }; return q; },
        maybeSingle: async () => { const r = result(); if (r.error) return r; return (r.data?.length ?? 0) > 1 ? { data: null, error: { code: "PGRST116" } } : { ...r, data: r.data?.[0] ?? null }; },
        then: (a: (v: unknown) => unknown, b: (e: unknown) => unknown) => Promise.resolve(result()).then(a, b),
      };
      return q;
    },
  };
}
const receipt = (over: Row = {}): Row => ({ id: "receipt-1", clone_id: C, source_kind: "photo", source_id: S, account_id: "of-a", storage_path: `${C}/photos/saved.jpg`,
  file_name: `${S}.jpg`, size_bytes: 1024, source_sha256: "1".repeat(64), chunk_sha256: ["2".repeat(64)], file_id: FILE, connection_revision: 3, actor: ACTOR,
  job_id: null, media_id: null, status: "prepared", processing: false, received_bytes: 0, error_code: null, ...over });

const answer = (c: Call) => {
  if (c.method === "GET" && c.url.startsWith(`${SUPABASE}/storage/v1/object/sign/media/${C}/photos/saved.jpg?`))
    return new Response(SOURCE, { status: 200, headers: { "content-type": "image/jpeg", "content-length": String(SOURCE.length) } });
  const path = servicePath(c);
  if (c.method === "GET" && path === "/onlyfans/content/v1/accounts/of-a/vault/uploads") return Response.json({ schemaVersion: CONTENT_SCHEMA, ok: true, accountId: "of-a",
    uploads: { schemaVersion: MEDIA_SCHEMA, accountId: "of-a", maxFiles: 20, maxFileBytes: 1024 ** 3, chunkBytes: MAX_CHUNK_BYTES, enabled: true, jobs: [] } });
  if (c.method === "POST" && path === "/onlyfans/content/v1/accounts/of-a/vault/uploads") {
    const f = (c.body as { files: Array<{ fileId: string; name: string; size: number }> }).files[0], now = new Date().toISOString();
    return Response.json({ schemaVersion: CONTENT_SCHEMA, ok: true, accountId: "of-a", upload: { jobId: JOB, kind: "upload", status: "pending", lastError: null, cleanupRequired: false,
      requestedAt: now, updatedAt: now, files: [{ ...f, receivedBytes: f.size, prefixDigest: null, status: "staged", mediaId: null, processing: false, error: null }] } });
  }
  return Response.json({ ok: false }, { status: 404 });
};
const creates = () => calls.filter(c => c.method === "POST" && servicePath(c) === "/onlyfans/content/v1/accounts/of-a/vault/uploads");
const createdFile = () => (creates()[0]?.body as { files: Array<{ fileId: string }> } | undefined)?.files[0].fileId;
const work = () => calls.filter(c => c.path !== PREFLIGHT); // every upstream call but the agency transport's auth preflight
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
