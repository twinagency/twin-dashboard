// KNOWN RED (W5 db-migrations F3; docs/review/W5/db-migrations.md). Applies the REAL
// 20260927154552_agency_revenue_query_plans.sql on stub users/chat_history in a throwaway database with
// Supabase-like default grants (tests/support/W5-db-migrations-pg.mjs), i.e. this repo's tree alone,
// without twin-bot 146's REVOKEs. Control green; F3 red until the file carries its own REVOKE/GRANT.
// Run: W5_MIGRATIONS_PGPORT=<throwaway port> node --test --test-concurrency=1 tests/known-red/W5-db-migrations-revenue-grants.test.mjs
import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { skipReason as skip, freshDb, migration } from "../support/W5-db-migrations-pg.mjs";

const A = "a0000000-0000-4000-8000-000000000001", B = "b0000000-0000-4000-8000-000000000001", C = "c0000000-0000-4000-8000-000000000001";
const START = "2026-10-01T00:00:00Z", END = "2026-10-31T23:59:59Z";
const STATS = "public.agency_revenue_clone_user_stats_window(uuid[],timestamptz,timestamptz,uuid)";
const MESSAGED = "public.agency_revenue_messaged_fans(uuid[],timestamptz,timestamptz,uuid)";
let db;

before(() => {
  if (skip) return;
  db = freshDb();
  db.run(`
    create table public.users(clone_id uuid, legacy_id text, first_seen_at timestamptz, last_message_received timestamptz);
    create table public.chat_history(clone_id uuid, telegram_id bigint, role text, created_at timestamptz);
    insert into users values
      ('${A}', null,  '2026-10-10', '2026-10-11'),  -- new arrival, messaged: fans+1 active+1
      ('${A}', 'l1',  '2026-10-10', '2026-10-12'),  -- imported (legacy): not a fan arrival; stamp after import counts active
      ('${A}', 'l2',  '2026-10-20', '2026-10-05'),  -- imported with carried-over stamp (< first_seen): not active
      ('${A}', null,  '2026-09-01', '2026-09-02'),  -- outside window
      ('${B}', null,  '2026-10-15', null),          -- B arrival, never messaged
      ('${C}', null,  '2026-10-15', '2026-10-15');  -- C, never in p_clones
    insert into chat_history values
      ('${A}', 1, 'human', '2026-10-02'), ('${A}', 1, 'human', '2026-10-03'), ('${A}', 1, 'ai', '2026-10-03'),
      ('${A}', 2, 'human', '2026-10-04'), ('${A}', 3, 'human', '2026-09-30'),
      ('${B}', 9, 'human', '2026-10-05'), ('${C}', 7, 'human', '2026-10-05');`);
  db.run(migration("20260927154552_agency_revenue_query_plans.sql"));
});
after(() => { if (db) db.drop(); });

const stats = (clones, clone) => db.query(`select clone_id::text, fans, active, messages from agency_revenue_clone_user_stats_window(array[${clones.map(c => `'${c}'`).join(",")}]::uuid[], '${START}', '${END}', ${clone ? `'${clone}'` : "null"}) order by clone_id`);
const messaged = (clones, clone) => db.query(`select agency_revenue_messaged_fans(array[${clones.map(c => `'${c}'`).join(",")}]::uuid[], '${START}', '${END}', ${clone ? `'${clone}'` : "null"}) as n`)[0].n;

test("control: revenue functions count arrivals, active fans, messages and distinct human senders", { skip }, () => {
  assert.deepEqual(stats([A, B]), [
    { clone_id: A, fans: 1, active: 2, messages: 4 },
    { clone_id: B, fans: 1, active: 0, messages: 1 },
  ]);
  assert.deepEqual(stats([A, B], A), [{ clone_id: A, fans: 1, active: 2, messages: 4 }], "p_clone narrows to one clone");
  assert.deepEqual(stats([B], A), [], "p_clone outside p_clones returns nothing");
  assert.equal(messaged([A, B]), 3, "distinct human senders 1,2,9 in window");
  assert.equal(messaged([A, B], A), 2);
  assert.equal(messaged([A]), 2);
});

test("F3: anon and authenticated must not have EXECUTE on the revenue functions", { skip }, () => {
  const [grants] = db.query(`select
    has_function_privilege('anon','${STATS}','execute') as anon_stats,
    has_function_privilege('authenticated','${STATS}','execute') as authenticated_stats,
    has_function_privilege('anon','${MESSAGED}','execute') as anon_messaged,
    has_function_privilege('authenticated','${MESSAGED}','execute') as authenticated_messaged`);
  assert.deepEqual(grants, { anon_stats: false, authenticated_stats: false, anon_messaged: false, authenticated_messaged: false },
    "applied from this repo alone, the functions are executable by anon/authenticated");
});
