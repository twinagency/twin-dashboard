// G05 (promoted from tests/known-red/W3-api-onlyfans-plus7-shared-media.test.ts, B-C3 only; B-C2 stays in the corpus).
// Was KNOWN RED (W3 api-onlyfans-plus7 findings B-C3 data-risk and B-C2 bug; REVIEW.md inv 7 "Isolation", "Stale work").
// Drives the real POST app/api/onlyfans-content/accounts/[accountId]/shared-media/route.ts (tests/helpers/W3-api-onlyfans-plus7-harness.ts:
// route.ts, next/headers, server-only, supabase-service mocked). Real: the route, lib/shared-media.ts, vault-media-backend over the fake
// wire at https://backend.invalid (uploads read, create write; agency sessions go through the harness's REAL agencyScopedFetch, so their
// calls are a preflight plus /onlyfans/agency/v1/content/v1/...). Bypasses declared (same technique as scripts/check-shared-media.cjs):
//  - `state.db`: an in-memory serviceClient: one saved photo, and shared_media_transfers rows with working select/insert/update/upsert,
//    unique on (account_id, source_kind, source_id) (insert of a taken key answers 23505); each scenario starts from one receipt
//    (status prepared, no job). Delete is refused 42501 and removes nothing, like the real grant (service_role has select, insert,
//    update only: supabase/migrations/20261021201045_restrict_shared_media_receipt_grants.sql:3, asserted no delete by
//    scripts/check-staff-media-schema.sql:33). Upsert stays allowed: PostgREST runs it as insert ... on conflict do update, which
//    needs only the insert and update grants. The photo's signed storage URL is on https://supabase.invalid, where the fake wire
//    serves a 1024-byte synthetic JPEG, so a fix that refreshes the receipt can re-read the source.
//  - `state.backend`: the read backend's listAccounts only (binds account of-a to the creator, connected, manageContent available).
//  - `lib/onlyfans/vault-backend.ts` (mock.module): configuredVaultBackend().get answers `{ connectionRevision: vaultRevision }`.
// B-C3: shared-media/route.ts:93 checks the receipt's actor only when the session has an agency grant. The internal operator resuming a
//       receipt an agency user started relays `identity()` = `{ actor: row.actor }` (:95; create :104, chunk :119) on the operator's transport, so the
//       upstream write is attributed to an agency user who did not make it. Fixed looks like either a refusal before any upstream write, or
//       the session's own actor relayed (the commandKey already derives from the receipt id, not the actor).
// B-C2: the receipt's connection_revision is frozen at insert (:85) and every create relays it (:104). After a reconnect bumps the vault's
//       connectionRevision the create is refused 409 forever; the receipt is unique per (account, source) and has no DELETE path, so the
//       file can never be shared again. Fixed looks like the next create after a 409 relaying the vault's current connectionRevision for
//       the same source (the receipt refreshed in place via update/upsert; delete is refused 42501 like the real grant; the receipt id
//       and fileId are not asserted).
//       Declared limit: the new revision (4) is offered ONLY by the mocked configuredVaultBackend().get; the 409 body, the read backend's
//       account list and the uploads read carry none. A fix that learns the revision anywhere else stays red here and needs a TEST-CHANGE.
// F8 (Flash R1): an agency session whose grant does not name ?creator= is refused 403 before the backend is consulted (no agency
//       preflight, no account list): the real read backend over the wire is used for that test, so any upstream call shows.
// F11 (Flash final): ?creator= in upper case and an upper-cased backend binding are the same creator as the lower-case grant;
//       the route normalizes the id once, so the starter's own resume is not falsely refused.
// Green since G05 (the B-C3 tests; B-C2 is not covered here). Runs in npm run test:rules.
// Synthetic values only.
import assert from "node:assert/strict";
import test, { beforeEach, mock } from "node:test";
import { CONTENT_SCHEMA } from "../../lib/onlyfans/content";
import { MAX_CHUNK_BYTES, MEDIA_SCHEMA } from "../../lib/onlyfans/vault-media";
import { BACKEND, PREFLIGHT, SUPABASE, call, calls, ensureModuleMocks, operatorActor, ready, reset, servicePath, state, upstream, type Call } from "../helpers/W3-api-onlyfans-plus7-harness";

const ROUTE = "onlyfans-content/accounts/[accountId]/shared-media";
const C = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", S = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", FILE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const AGENCY = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const STARTER = `agency-user:${AGENCY}:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee`, OTHER = `agency-user:${AGENCY}:ffffffff-ffff-4fff-8fff-ffffffffffff`;
let vaultRevision = 3;
let rows: Array<Record<string, unknown>> = [];

type Row = Record<string, unknown>;
const KEY = ["account_id", "source_kind", "source_id"] as const;
const sameKey = (a: Row, b: Row) => KEY.every(k => a[k] === b[k]);
const SOURCE = new Uint8Array(1024).fill(7); SOURCE.set([255, 216, 255, 224]);
function fakeDb() {
  return {
    storage: { from: () => ({ createSignedUrl: async (path: string) => ({ data: { signedUrl: `${SUPABASE}/storage/v1/object/sign/media/${path}?sig=synthetic` }, error: null }) }) },
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      let op: { kind: "select" } | { kind: "update"; patch: Row } | { kind: "delete" } | { kind: "insert" | "upsert"; values: Row[] } = { kind: "select" };
      const result = (): { data: Row[] | null; error: { code: string; message: string } | null } => {
        if (table === "photos") return { data: [{ id: S, clone_id: C, storage_path: `${C}/photos/saved.jpg` }].filter(row => filters.every(([k, v]) => (row as Row)[k] === v)), error: null };
        if (table !== "shared_media_transfers") return { data: [], error: null };
        if (op.kind === "insert" || op.kind === "upsert") {
          const out: Row[] = [];
          for (const value of op.values) {
            const at = rows.findIndex(row => sameKey(row, value));
            if (at >= 0 && op.kind === "insert") return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
            const row = { job_id: null, media_id: null, status: "prepared", processing: false, received_bytes: 0, error_code: null, ...(at >= 0 ? rows[at] : {}), ...value };
            if (at >= 0) rows[at] = row; else rows.push(row);
            out.push({ ...row });
          }
          return { data: out, error: null };
        }
        if (op.kind === "delete") return { data: null, error: { code: "42501", message: "permission denied for table shared_media_transfers" } };
        const hit = rows.filter(row => filters.every(([k, v]) => row[k] === v));
        if (op.kind === "update") { const patch = op.patch; hit.forEach(row => Object.assign(row, patch)); }
        return { data: hit.map(row => ({ ...row })), error: null };
      };
      const q: Record<string, unknown> = {
        select: () => q, eq: (k: string, v: unknown) => { filters.push([k, v]); return q; }, order: () => q, limit: () => q,
        insert: (v: Row | Row[]) => { op = { kind: "insert", values: [v].flat() }; return q; },
        upsert: (v: Row | Row[]) => { op = { kind: "upsert", values: [v].flat() }; return q; },
        update: (patch: Row) => { op = { kind: "update", patch }; return q; },
        delete: () => { op = { kind: "delete" }; return q; },
        single: async () => { const r = result(); return r.error ? r : r.data?.length === 1 ? { ...r, data: r.data[0] } : { data: null, error: { code: "PGRST116", message: "not one row" } }; },
        maybeSingle: async () => { const r = result(); return r.error ? r : { ...r, data: r.data?.[0] ?? null }; },
        then: (a: (v: unknown) => unknown, b: (e: unknown) => unknown) => Promise.resolve(result()).then(a, b),
      };
      return q;
    },
  };
}
const readBackend = { listAccounts: async () => ({ ok: true, data: [{ accountId: "of-a", binding: { creatorId: C }, health: "connected", capabilities: { manageContent: "available" } }] }) };
const receipt = (actor: string) => ({ id: "receipt-1", clone_id: C, source_kind: "photo", source_id: S, account_id: "of-a", storage_path: `${C}/photos/saved.jpg`,
  file_name: `${S}.jpg`, size_bytes: 1024, source_sha256: "1".repeat(64), chunk_sha256: ["2".repeat(64)], file_id: FILE, connection_revision: 3, actor,
  job_id: null, media_id: null, status: "prepared", processing: false, received_bytes: 0, error_code: null });

/** Wire: the uploads read lists no job; a create answers `createStatus`. */
let createStatus = 409;
const answer = (c: Call) => {
  if (c.method === "GET" && c.url.startsWith(`${SUPABASE}/storage/v1/object/sign/media/${C}/photos/saved.jpg?`))
    return new Response(SOURCE, { status: 200, headers: { "content-type": "image/jpeg", "content-length": String(SOURCE.length) } });
  const path = servicePath(c);
  if (c.method === "GET" && path === "/onlyfans/content/v1/accounts/of-a/vault/uploads") return Response.json({ schemaVersion: CONTENT_SCHEMA, ok: true, accountId: "of-a",
    uploads: { schemaVersion: MEDIA_SCHEMA, accountId: "of-a", maxFiles: 20, maxFileBytes: 1024 ** 3, chunkBytes: MAX_CHUNK_BYTES, enabled: true, jobs: [] } });
  if (c.method === "POST" && path === "/onlyfans/content/v1/accounts/of-a/vault/uploads") return Response.json({ ok: false }, { status: createStatus });
  return Response.json({ ok: false }, { status: 404 });
};
const writes = () => calls.filter(c => c.method !== "GET");
const creates = () => calls.filter(c => c.method === "POST" && servicePath(c) === "/onlyfans/content/v1/accounts/of-a/vault/uploads");
const share = () => call(ROUTE, { accountId: "of-a" }, { body: { kind: "photo", sourceId: S }, query: `?creator=${C}` });
const agencySession = (actor: string) => { state.identity = { grant: { creatorIds: [C], actor, canManage: true, canChat: true } }; };

if (ensureModuleMocks(import.meta.url, { controls: 2, rest: 2 }, () => {
  mock.module(new URL("../../lib/onlyfans/vault-backend.ts", import.meta.url).href, { namedExports: {
    configuredVaultBackend: () => ({ get: async () => ({ ok: true, data: { connectionRevision: vaultRevision } }) }),
  } });
})) {
  beforeEach(async () => {
    await ready(); reset(); state.db = fakeDb(); state.backend = readBackend; vaultRevision = 3; createStatus = 409; upstream(answer);
  });

  test("control: an agency member resuming another member's receipt is refused 409 before any upstream write", async () => {
    rows = [receipt(STARTER)]; agencySession(OTHER);
    const response = await share();
    assert.equal(response.status, 409);
    assert.equal(writes().length, 0);
  });

  test("control: the starter's own resume relays one create with the receipt's file, revision and the starter's actor", async () => {
    rows = [receipt(STARTER)]; agencySession(STARTER);
    await share();
    assert.equal(calls.filter(c => c.path === PREFLIGHT).length, 1, "one agency preflight");
    assert.equal(writes().length, 1, "one upstream create");
    assert.equal(writes()[0].url, `${BACKEND}/onlyfans/agency/v1/content/v1/accounts/of-a/vault/uploads`, "the create took the agency-scoped path");
    const body = writes()[0].body as { actor: string; expectedConnectionRevision: number; files: Array<{ fileId: string }> };
    assert.equal(body.actor, STARTER);
    assert.equal(body.expectedConnectionRevision, 3);
    assert.equal(body.files[0].fileId, FILE);
  });

  test("B-C3: the internal operator resuming an agency user's receipt does not write upstream as that agency user", async () => {
    rows = [receipt(STARTER)];
    await share();
    const relayed = writes().map(c => (c.body as { actor?: unknown }).actor);
    for (const actor of relayed) assert.equal(actor, operatorActor(), `an upstream write was attributed to ${String(actor)}, not to the session that made it`);
  });

  test("F8: an agency session not granted ?creator= is refused 403 before any backend call", async () => {
    rows = [receipt(STARTER)]; state.identity = { grant: { creatorIds: [AGENCY], actor: STARTER, canManage: true, canChat: true } };
    state.backend = undefined;
    const response = await share();
    assert.equal(response.status, 403);
    assert.deepEqual(calls.map(c => `${c.method} ${c.path}`), [], "the backend was consulted for a creator outside the grant");
  });

  test("F11: an upper-cased ?creator= and backend binding still reach the granted creator's receipt", async () => {
    rows = [receipt(STARTER)]; agencySession(STARTER);
    state.backend = { listAccounts: async () => ({ ok: true, data: [{ accountId: "of-a", binding: { creatorId: C.toUpperCase() }, health: "connected", capabilities: { manageContent: "available" } }] }) };
    const response = await call(ROUTE, { accountId: "of-a" }, { body: { kind: "photo", sourceId: S }, query: `?creator=${C.toUpperCase()}` });
    assert.notEqual(response.status, 403, "a granted creator was refused for its letter case");
    assert.equal(creates().length, 1, "one upstream create");
  });
}
