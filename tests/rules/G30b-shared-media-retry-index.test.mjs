// G30b (W5 db-migrations F5, index half): `unique (account_id, source_kind, source_id)` allowed one shared-media receipt per
// account+file forever. 20261113100300 narrows it to a partial unique index over LIVE receipts, defined once in lib/shared-media.ts
// (RETRYABLE_SHARED_OUTCOMES -> LIVE_SHARED_SQL / LIVE_SHARED_FILTER). R1: retryable only where the row proves nothing reached the
// provider; everything else stays live. The migration text is checked against LIVE_SHARED_SQL (no DB needed); the rest apply the
// REAL migrations in a throwaway initdb cluster (tests/support/W5-db-migrations-pg.mjs) and skip locally without PG binaries: the
// applied index against a fixed pg_get_indexdef literal, and its behaviour against the literal table in
// tests/support/G30b-shared-live-cases.ts (shared with the route test, never derived from the lib).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { before, after } from "node:test";
import { skipReason as skip, freshDb, migration } from "../support/W5-db-migrations-pg.mjs";
import { LIVE_SHARED_SQL, RETRYABLE_SHARED_OUTCOMES } from "../../lib/shared-media.ts";
import { SHARED_LIVE_CASES } from "../support/G30b-shared-live-cases.ts";

const FILE = "20261113100300_shared_media_retry_after_failure.sql";
const read = (name) => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
const CLONE = "10000000-0000-4000-8000-000000000001", ACCOUNT = "fixture-account";
const src = (n) => `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
// What PostgreSQL itself prints for the applied index (pg_get_indexdef). Fixed text: a predicate change must edit this line.
const INDEXDEF = "CREATE UNIQUE INDEX shared_media_transfers_live_source ON public.shared_media_transfers USING btree (account_id, source_kind, source_id) WHERE ((media_id IS NOT NULL) OR (error_code IS NULL) OR (((status <> 'expired'::text) OR (error_code <> 'media_request_expired'::text)) AND ((status <> 'superseded'::text) OR (error_code <> 'media_connection_changed'::text))))";
let db;

test("the migration drops any same-named index, then creates the partial unique index with the lib's live predicate", () => {
  const sql = read(FILE).replace(/--.*$/gm, "").replace(/\s+/g, " ");
  const drop = sql.indexOf("drop index if exists public.shared_media_transfers_live_source;");
  const create = /create unique index shared_media_transfers_live_source on public\.shared_media_transfers ?\(account_id, ?source_kind, ?source_id\) where (.*?);/i.exec(sql);
  assert.ok(create, "partial unique index not found (and never `if not exists`, which would keep a stale same-named index)");
  assert.ok(drop > sql.indexOf("begin;") && drop < create.index && create.index < sql.indexOf("commit;"), "drop then create, inside the transaction");
  assert.equal(create[1].trim(), LIVE_SHARED_SQL);
});

test("every retryable outcome names a real table status that is terminal", () => {
  const check = /check \(status in \(([^)]*)\)\)/.exec(read("20261021200512_staff_creator_scope_and_shared_media.sql"));
  const statuses = check[1].split(",").map(s => s.trim().replace(/'/g, ""));
  for (const [s] of RETRYABLE_SHARED_OUTCOMES) assert.ok(statuses.includes(s), `${s} is not a table status`);
  for (const [s] of RETRYABLE_SHARED_OUTCOMES) assert.ok(!["prepared", "receiving", "pending", "running", "complete", "failed", "interrupted"].includes(s), `${s} must stay live`);
});

before(() => {
  if (skip) return;
  db = freshDb();
  db.run(`create table public.clones(id uuid primary key);
    create table public.agency_memberships(user_id uuid primary key, agency_id uuid not null);
    insert into public.clones values ('${CLONE}');`);
  db.run(migration("20261021200512_staff_creator_scope_and_shared_media.sql"));
  db.run(migration("20261021201045_restrict_shared_media_receipt_grants.sql"));
  db.run(migration(FILE));
});
after(() => { if (db) db.drop(); });

const receipt = (source, status = "prepared", error = null, media = null) => db.run(`set role service_role;
  insert into public.shared_media_transfers(clone_id,source_kind,source_id,account_id,storage_path,file_name,size_bytes,source_sha256,chunk_sha256,connection_revision,actor,status,error_code,media_id)
  values('${CLONE}','photo','${source}','${ACCOUNT}','private-source','photo.jpg',8,repeat('a',64),array[repeat('a',64)],1,'synthetic-user','${status}',${error ? `'${error}'` : "null"},${media ? `'${media}'` : "null"});`);
const statuses = (source) => db.query(`select status from public.shared_media_transfers where source_id='${source}' order by created_at`).map(r => r.status);
const raised = (fn) => { try { fn(); return null; } catch (e) { return String(e.message).split("\n")[0]; } };
const DUP = /duplicate key value violates unique constraint "shared_media_transfers_live_source"/;

test("two retryable receipts plus one live receipt for the same file are allowed", { skip }, () => {
  receipt(src(1), "expired", "media_request_expired"); receipt(src(1), "superseded", "media_connection_changed");
  assert.equal(raised(() => receipt(src(1))), null);
  assert.deepEqual(statuses(src(1)).sort(), ["expired", "prepared", "superseded"]);
});

SHARED_LIVE_CASES.forEach(([status, error, media, live], i) => {
  test(`real index: '${status}/${error}/${media}' is ${live ? "live and blocks" : "history and allows"} a new receipt`, { skip }, () => {
    const s = src(100 + i);
    receipt(s, status, error, media);
    const second = raised(() => receipt(s));
    if (live) assert.match(second ?? "", DUP); else assert.equal(second, null);
  });
});

test("the applied index is unique with exactly the expected predicate; rerun is idempotent", { skip }, () => {
  const def = () => db.query(`select pg_get_indexdef('public.shared_media_transfers_live_source'::regclass) as d`)[0].d;
  assert.equal(def(), INDEXDEF);
  assert.equal(raised(() => db.run(migration(FILE))), null, "second apply failed");
  assert.equal(def(), INDEXDEF);
  assert.equal(db.query(`select count(*)::int as n from pg_constraint where conrelid='public.shared_media_transfers'::regclass and contype='u'`)[0].n, 0);
});

test("a stale same-named index from an abandoned attempt is replaced, not kept", { skip }, () => {
  db.run(`drop index public.shared_media_transfers_live_source;
    create unique index shared_media_transfers_live_source on public.shared_media_transfers (account_id, source_kind, source_id) where status = 'prepared';`);
  assert.equal(raised(() => db.run(migration(FILE))), null);
  assert.equal(db.query(`select pg_get_indexdef('public.shared_media_transfers_live_source'::regclass) as d`)[0].d, INDEXDEF);
});
