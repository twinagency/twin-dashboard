// KNOWN RED (W5 db-migrations F5; docs/review/W5/db-migrations.md). Applies the REAL
// 20261021200512 + 20261021201045 on the fixture shape of scripts/check-staff-media-schema.sql in a throwaway
// database (tests/support/W5-db-migrations-pg.mjs). `unique (account_id, source_kind, source_id)` allows one
// receipt per account+file forever, so a failed/expired transfer can never be retried. Controls green; F5 red.
// Run: W5_MIGRATIONS_PGPORT=<throwaway port> node --test --test-concurrency=1 tests/known-red/W5-db-migrations-shared-media.test.mjs
import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { skipReason as skip, freshDb, migration } from "../support/W5-db-migrations-pg.mjs";

const CLONE = "10000000-0000-4000-8000-000000000001", ACCOUNT = "fixture-account";
const src = (n) => `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let db;

before(() => {
  if (skip) return;
  db = freshDb();
  db.run(`
    create table public.clones(id uuid primary key);
    create table public.agency_memberships(user_id uuid primary key, agency_id uuid not null);
    insert into public.clones values ('${CLONE}');`);
  db.run(migration("20261021200512_staff_creator_scope_and_shared_media.sql"));
  db.run(migration("20261021201045_restrict_shared_media_receipt_grants.sql"));
});
after(() => { if (db) db.drop(); });

// One receipt, written as the dashboard route does (service_role).
const receipt = (source, status = "prepared") => db.run(`set role service_role;
  insert into public.shared_media_transfers(clone_id,source_kind,source_id,account_id,storage_path,file_name,size_bytes,source_sha256,chunk_sha256,connection_revision,actor,status)
  values('${CLONE}','photo','${source}','${ACCOUNT}','private-source','photo.jpg',8,repeat('a',64),array[repeat('a',64)],1,'synthetic-user','${status}');`);
const rows = (source) => db.query(`select status from public.shared_media_transfers where account_id='${ACCOUNT}' and source_id='${source}' order by created_at`, { role: "service_role" });
const raised = (fn) => { try { fn(); return null; } catch (e) { return String(e.message).split("\n")[0]; } };

test("control: a receipt for a different source_id inserts", { skip }, () => {
  receipt(src(1));
  receipt(src(2));
  assert.equal(rows(src(1)).length, 1);
  assert.equal(rows(src(2)).length, 1);
});

test("control: a duplicate while the first receipt is still 'receiving' stays refused", { skip }, () => {
  receipt(src(3), "receiving");
  assert.match(raised(() => receipt(src(3))) ?? "", /duplicate key value violates unique constraint/);
  assert.deepEqual(rows(src(3)), [{ status: "receiving" }]);
});

for (const [n, terminal] of [[4, "failed"], [5, "expired"]]) {
  test(`F5: after a '${terminal}' receipt a new attempt for the same file is insertable, old receipt kept`, { skip }, () => {
    receipt(src(n), terminal);
    const err = raised(() => receipt(src(n)));
    assert.equal(err, null, `retry after '${terminal}' refused: ${err}`);
    assert.ok(rows(src(n)).some(r => r.status === terminal), `old '${terminal}' receipt must be kept`);
  });
}
