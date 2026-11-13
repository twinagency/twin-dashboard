// G30b (W5 db-migrations F5, index half): `unique (account_id, source_kind, source_id)` allowed one shared-media receipt per
// account+file forever. 20261113100300 narrows it to a partial unique index over LIVE receipts, defined once in lib/shared-media.ts
// (RETRYABLE_SHARED_STATUSES, SHARED_CLEANUP_HOLD). The predicate checks parse the migration file (no DB needed); the rest apply the
// REAL migrations in a throwaway initdb cluster (tests/support/W5-db-migrations-pg.mjs) and skip locally without PG binaries.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { before, after } from "node:test";
import { skipReason as skip, freshDb, migration } from "../support/W5-db-migrations-pg.mjs";
import { LIVE_SHARED_FILTER, RETRYABLE_SHARED_STATUSES, SHARED_CLEANUP_HOLD } from "../../lib/shared-media.ts";

const FILE = "20261113100300_shared_media_retry_after_failure.sql";
const read = (name) => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
const CLONE = "10000000-0000-4000-8000-000000000001", ACCOUNT = "fixture-account";
const src = (n) => `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const expected = `status not in (${RETRYABLE_SHARED_STATUSES.map(s => `'${s}'`).join(",")}) or error_code = '${SHARED_CLEANUP_HOLD}'`;
let db;

test("the migration's index predicate is exactly the TS live set", () => {
  const sql = read(FILE).replace(/--.*$/gm, "").replace(/\s+/g, " ");
  const where = /create unique index if not exists shared_media_transfers_live_source on public\.shared_media_transfers ?\(account_id, ?source_kind, ?source_id\) where (.*?);/i.exec(sql);
  assert.ok(where, "partial unique index not found");
  assert.equal(where[1].replace(/,\s+/g, ",").trim(), expected);
  assert.equal(LIVE_SHARED_FILTER, `status.not.in.(${RETRYABLE_SHARED_STATUSES.join(",")}),error_code.eq.${SHARED_CLEANUP_HOLD}`, "route filter drifted from the live set");
});

test("every retryable status is a real terminal status of the table", () => {
  const check = /check \(status in \(([^)]*)\)\)/.exec(read("20261021200512_staff_creator_scope_and_shared_media.sql"));
  const statuses = check[1].split(",").map(s => s.trim().replace(/'/g, ""));
  for (const s of RETRYABLE_SHARED_STATUSES) assert.ok(statuses.includes(s), `${s} is not a table status`);
  for (const s of ["prepared", "receiving", "pending", "running", "complete"]) assert.ok(!RETRYABLE_SHARED_STATUSES.includes(s), `${s} must stay live`);
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

const receipt = (source, status = "prepared", error = null) => db.run(`set role service_role;
  insert into public.shared_media_transfers(clone_id,source_kind,source_id,account_id,storage_path,file_name,size_bytes,source_sha256,chunk_sha256,connection_revision,actor,status,error_code)
  values('${CLONE}','photo','${source}','${ACCOUNT}','private-source','photo.jpg',8,repeat('a',64),array[repeat('a',64)],1,'synthetic-user','${status}',${error ? `'${error}'` : "null"});`);
const statuses = (source) => db.query(`select status from public.shared_media_transfers where source_id='${source}' order by created_at`).map(r => r.status);
const raised = (fn) => { try { fn(); return null; } catch (e) { return String(e.message).split("\n")[0]; } };

test("two failed receipts plus one live receipt for the same file are allowed", { skip }, () => {
  receipt(src(1), "failed"); receipt(src(1), "expired");
  assert.equal(raised(() => receipt(src(1))), null);
  assert.deepEqual(statuses(src(1)).sort(), ["expired", "failed", "prepared"]);
});

for (const second of ["prepared", "complete"]) {
  test(`two live receipts for the same file are refused (second '${second}')`, { skip }, () => {
    const s = src(second === "prepared" ? 2 : 3);
    receipt(s, "receiving");
    assert.match(raised(() => receipt(s, second)) ?? "", /duplicate key value violates unique constraint/);
  });
}

test("a cleanup-held failed receipt is live and blocks a new one", { skip }, () => {
  receipt(src(4), "failed", SHARED_CLEANUP_HOLD);
  assert.match(raised(() => receipt(src(4))) ?? "", /duplicate key value violates unique constraint/);
});

test("the applied index predicate names exactly the TS retryable set; rerun is idempotent", { skip }, () => {
  const def = db.query(`select pg_get_indexdef('public.shared_media_transfers_live_source'::regclass) as d`)[0].d;
  const listed = [...def.matchAll(/'(\w+)'::text/g)].map(m => m[1]);
  assert.deepEqual(listed.sort(), [...RETRYABLE_SHARED_STATUSES, SHARED_CLEANUP_HOLD].sort());
  assert.equal(raised(() => db.run(migration(FILE))), null, "second apply failed");
  assert.equal(db.query(`select count(*)::int as n from pg_constraint where conrelid='public.shared_media_transfers'::regclass and contype='u'`)[0].n, 0);
});
