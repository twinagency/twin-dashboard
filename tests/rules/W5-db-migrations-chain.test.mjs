// Characterization (green), W5 db-migrations F10/F16/F19: applies the REAL migration files in deploy order on a
// throwaway database (tests/support/W5-db-migrations-pg.mjs) and pins what they do today.
// (a) 20261021200512 -> 20261021201045 -> 20261021204833 -> 20261028125157 on the agency fixture.
// (b) 20261024123000 combined content backfill on stub creator_files / creator_onboarding_progress.
// Run: W5_MIGRATIONS_PGPORT=<throwaway port> node --test --test-concurrency=1 tests/rules/W5-db-migrations-chain.test.mjs
// Mutation proofs: tests/rules/mutations/W5-db-migrations/.
import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { skipReason as skip, freshDb, migration, jsonb } from "../support/W5-db-migrations-pg.mjs";

const u = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const c = (n) => `50000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const AGENCY = "20000000-0000-4000-8000-000000000001", CREATOR = "30000000-0000-4000-8000-000000000001";
const OWNER = u(1), STAFF = u(2), NEWCOMER = u(3);
const CONTENT_KINDS = ["content", "content_sfw_image", "content_nsfw_image", "content_sfw_video", "content_nsfw_video"];
const OLD = "2020-01-01T00:00:00+00:00";
const TEAM_RPCS = ["public.agency_team_command(uuid,uuid,jsonb)", "public.agency_team_accept(uuid,text,text)"];
let db;

// n verified/other files of one kind for one creator.
const files = (creator, n, kind, status = "verified") =>
  `insert into creator_files select '${creator}','${kind}','${status}' from generate_series(1,${n});`;

before(() => {
  if (skip) return;
  db = freshDb();
  // (a) base tables as they stood before 20261021200512 (no creator_scope columns yet).
  db.run(`
    create schema auth;
    create table auth.users(id uuid primary key);
    create table public.clones(id uuid primary key);
    create table public.partner_agencies(id uuid primary key,active boolean not null default true);
    create table public.agency_creators(agency_id uuid,clone_id uuid);
    create table public.agency_memberships(user_id uuid primary key references auth.users(id),agency_id uuid not null references partner_agencies(id),email text not null,active boolean not null default true,can_manage boolean not null default false,unique(agency_id,email));
    grant all on public.partner_agencies,public.agency_creators,public.agency_memberships to service_role;
    insert into auth.users values('${OWNER}'),('${STAFF}'),('${NEWCOMER}');
    insert into clones values('${CREATOR}');
    insert into partner_agencies values('${AGENCY}',true);
    insert into agency_creators values('${AGENCY}','${CREATOR}');
    insert into agency_memberships(user_id,agency_id,email,can_manage) values('${OWNER}','${AGENCY}','owner@example.test',true),('${STAFF}','${AGENCY}','staff@example.test',false);`);
  for (const f of ["20261021200512_staff_creator_scope_and_shared_media.sql", "20261021201045_restrict_shared_media_receipt_grants.sql",
    "20261021204833_agency_team_onboarding.sql", "20261028125157_onlyfans_scoped_chatter.sql"]) db.run(migration(f));

  // (b) stubs of the deployment/creator-registration.sql tables 20261024123000 touches.
  db.run(`
    create table public.creator_files(creator_account_id uuid, kind text, storage_transfer_status text);
    create table public.creator_onboarding_progress(creator_account_id uuid primary key, questionnaire_completed bool, content_completed bool, voice_completed bool, updated_at timestamptz);
    ${files(c(49), 49, "content_sfw_image")}
    ${CONTENT_KINDS.map(k => files(c(50), 10, k)).join("\n")}
    ${files(c(51), 50, "content")}
    insert into creator_onboarding_progress values('${c(51)}',true,false,true,'${OLD}');
    ${files(c(52), 49, "content")} ${files(c(52), 10, "content", "pending")} ${files(c(52), 5, "content", "failed")}
    ${files(c(53), 49, "content_nsfw_video")} ${files(c(53), 10, "voice")} ${files(c(53), 10, "id_document")}
    ${files(c(54), 60, "content_sfw_video")}
    insert into creator_onboarding_progress values('${c(54)}',true,true,false,'${OLD}');
    insert into creator_onboarding_progress values('${c(55)}',true,false,false,'${OLD}');`);
  db.run(migration("20261024123000_combined_creator_content_progress.sql"));
});
after(() => { if (db) db.drop(); });

test("(a) chain applies; existing memberships keep full scope and get no chat", { skip }, () => {
  const rows = db.query(`select user_id::text, creator_scope, creator_ids::text[] as ids, can_chat, creator_access_revision::text as rev from agency_memberships where user_id in ('${OWNER}','${STAFF}') order by user_id`);
  assert.equal(rows.length, 2);
  for (const r of rows) {
    assert.equal(r.creator_scope, "all");
    assert.deepEqual(r.ids, []);
    assert.equal(r.can_chat, false);
    assert.match(r.rev, /^[0-9a-f-]{36}$/);
  }
  assert.notEqual(rows[0].rev, rows[1].rev, "revision default is per row");
});

test("(a) team and receipt tables: RLS on, no anon/authenticated privileges", { skip }, () => {
  for (const t of ["agency_team_owners", "agency_team_invites", "shared_media_transfers"]) {
    const [r] = db.query(`select relrowsecurity as rls,
      has_table_privilege('anon','public.${t}','select,insert,update,delete,truncate,references,trigger') as anon,
      has_table_privilege('authenticated','public.${t}','select,insert,update,delete,truncate,references,trigger') as authenticated
      from pg_class where oid='public.${t}'::regclass`);
    assert.deepEqual(r, { rls: true, anon: false, authenticated: false }, t);
  }
});

test("(a) team RPCs executable by service_role only (not PUBLIC, anon, authenticated)", { skip }, () => {
  for (const fn of TEAM_RPCS) {
    const [r] = db.query(`select has_function_privilege('anon','${fn}','execute') as anon,
      has_function_privilege('authenticated','${fn}','execute') as authenticated,
      has_function_privilege('service_role','${fn}','execute') as service_role,
      exists(select 1 from aclexplode((select proacl from pg_proc where oid='${fn}'::regprocedure)) where grantee=0) as public`);
    assert.deepEqual(r, { anon: false, authenticated: false, service_role: true, public: false }, fn);
  }
});

test("(a) can_chat propagates: invite -> invitation row -> accepted membership; update sets it", { skip }, () => {
  const hash = "d".repeat(64);
  db.run(`insert into agency_team_owners(user_id,agency_id) values('${OWNER}','${AGENCY}');`);
  db.run(`set role service_role; select agency_team_command('${OWNER}','${AGENCY}',${jsonb({ operation: "invite", email: "chatter@example.test", token_hash: hash, can_manage: false, can_chat: true, creator_scope: "selected", creator_ids: [CREATOR] })});`);
  assert.deepEqual(db.query(`select can_chat, can_manage from agency_team_invites where token_hash='${hash}'`), [{ can_chat: true, can_manage: false }]);
  db.run(`set role service_role; select agency_team_accept('${NEWCOMER}','${hash}','chatter@example.test');`);
  assert.deepEqual(db.query(`select active, can_chat, can_manage, creator_scope, creator_ids::text[] as ids from agency_memberships where user_id='${NEWCOMER}'`),
    [{ active: true, can_chat: true, can_manage: false, creator_scope: "selected", ids: [CREATOR] }]);
  const [{ rev }] = db.query(`select creator_access_revision::text as rev from agency_memberships where user_id='${STAFF}'`);
  db.run(`set role service_role; select agency_team_command('${OWNER}','${AGENCY}',${jsonb({ operation: "update", user_id: STAFF, revision: rev, can_manage: false, can_chat: true, creator_scope: "all", creator_ids: [] })});`);
  assert.equal(db.query(`select can_chat from agency_memberships where user_id='${STAFF}'`)[0].can_chat, true);
});

const progress = (id) => db.query(`select questionnaire_completed as q, content_completed as content, voice_completed as voice, updated_at::text as at from creator_onboarding_progress where creator_account_id='${id}'`)[0];

test("(b) 49 verified content files: no progress row created", { skip }, () => {
  assert.equal(progress(c(49)), undefined);
});

test("(b) 50 verified files across mixed content kinds: content_completed inserted, other steps false", { skip }, () => {
  const p = progress(c(50));
  assert.deepEqual({ q: p.q, content: p.content, voice: p.voice }, { q: false, content: true, voice: false });
});

test("(b) existing row: only content flips, questionnaire and voice kept", { skip }, () => {
  const p = progress(c(51));
  assert.deepEqual({ q: p.q, content: p.content, voice: p.voice }, { q: true, content: true, voice: true });
  assert.notEqual(new Date(p.at).toISOString(), new Date(OLD).toISOString(), "flipped row gets a new updated_at");
});

test("(b) unverified files and non-content kinds are not counted", { skip }, () => {
  assert.equal(progress(c(52)), undefined, "49 verified + pending/failed");
  assert.equal(progress(c(53)), undefined, "49 verified content + verified voice/id_document");
});

test("(b) already-complete row is not rewritten; row without files untouched", { skip }, () => {
  const done = progress(c(54));
  assert.deepEqual({ q: done.q, content: done.content, voice: done.voice }, { q: true, content: true, voice: false });
  assert.equal(new Date(done.at).toISOString(), new Date(OLD).toISOString(), "updated_at of a row already complete is kept");
  const none = progress(c(55));
  assert.deepEqual({ q: none.q, content: none.content, voice: none.voice }, { q: true, content: false, voice: false });
  assert.equal(new Date(none.at).toISOString(), new Date(OLD).toISOString());
});
