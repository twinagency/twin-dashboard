// KNOWN RED (W5 db-migrations F1, F2, F4; docs/review/W5/db-migrations.md). Applies the REAL deployed chain
// 20261021204833_agency_team_onboarding.sql -> 20261028125157_onlyfans_scoped_chatter.sql on the fixture shape
// of scripts/check-agency-team-onboarding.sql, in a throwaway database (tests/support/W5-db-migrations-pg.mjs).
// Controls must be green; F-tests are red until the migrations are fixed. Not wired into npm scripts on purpose.
// Run: W5_MIGRATIONS_PGPORT=<throwaway port> node --test --test-concurrency=1 tests/known-red/W5-db-migrations-team-rpc.test.mjs
import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { skipReason as skip, freshDb, migration, jsonb } from "../support/W5-db-migrations-pg.mjs";

const u = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const AGENCY = "20000000-0000-4000-8000-000000000001", AGENCY2 = "20000000-0000-4000-8000-000000000002";
const CREATOR = "30000000-0000-4000-8000-000000000001";
const OWNER = u(1), OWNER2 = u(2);
let db;

const member = (id) => db.query(`select active,can_manage,can_chat,creator_scope,creator_ids::text[] as creator_ids,creator_access_revision::text as revision from agency_memberships where user_id='${id}'`)[0];
const asService = (sql) => db.run(`set role service_role;\n${sql}`);
const command = (actor, agency, cmd) => asService(`select agency_team_command('${actor}','${agency}',${jsonb(cmd)});`);
const accept = (user, hash, email) => asService(`select agency_team_accept('${user}','${hash}','${email}');`);
const addStaff = (id, email, agency = AGENCY) => db.run(`insert into auth.users values('${id}'); insert into agency_memberships(user_id,agency_id,email) values('${id}','${agency}','${email}');`);
// Runs fn; returns the error message if it raised, null otherwise (the post-state assertion decides the verdict).
const raised = (fn) => { try { fn(); return null; } catch (e) { return String(e.message); } };

before(() => {
  if (skip) return;
  db = freshDb();
  db.run(`
    create schema auth;
    create table auth.users(id uuid primary key);
    create table public.partner_agencies(id uuid primary key,active boolean not null default true);
    create table public.agency_creators(agency_id uuid,clone_id uuid);
    create table public.agency_memberships(user_id uuid primary key references auth.users(id),agency_id uuid not null references partner_agencies(id),email text not null,active boolean not null default true,can_manage boolean not null default false,creator_scope text not null default 'all',creator_ids uuid[] not null default '{}',creator_access_revision uuid not null default gen_random_uuid(),unique(agency_id,email));
    grant all on public.partner_agencies,public.agency_creators,public.agency_memberships to service_role;`);
  db.run(migration("20261021204833_agency_team_onboarding.sql"));
  db.run(migration("20261028125157_onlyfans_scoped_chatter.sql"));
  db.run(`
    insert into auth.users values('${OWNER}'),('${OWNER2}');
    insert into partner_agencies values('${AGENCY}',true),('${AGENCY2}',true);
    insert into agency_creators values('${AGENCY}','${CREATOR}');
    insert into agency_memberships(user_id,agency_id,email) values('${OWNER}','${AGENCY}','owner@example.test'),('${OWNER2}','${AGENCY2}','owner2@example.test');
    insert into agency_team_owners(user_id,agency_id) values('${OWNER}','${AGENCY}'),('${OWNER2}','${AGENCY2}');`);
});
after(() => { if (db) db.drop(); });

test("control: owner update on an ACTIVE staff member succeeds and changes scope", { skip }, () => {
  const staff = u(10);
  addStaff(staff, "active-staff@example.test");
  const before = member(staff);
  command(OWNER, AGENCY, { operation: "update", user_id: staff, revision: before.revision, can_manage: false, can_chat: false, creator_scope: "selected", creator_ids: [CREATOR] });
  const now = member(staff);
  assert.equal(now.active, true);
  assert.equal(now.creator_scope, "selected");
  assert.deepEqual(now.creator_ids, [CREATOR]);
  assert.notEqual(now.revision, before.revision, "revision must rotate on update");
});

test("control: invite with can_chat:true then accept yields membership can_chat=true", { skip }, () => {
  const newcomer = u(11), hash = "a".repeat(64);
  command(OWNER, AGENCY, { operation: "invite", email: "chatter@example.test", token_hash: hash, can_manage: false, can_chat: true, creator_scope: "selected", creator_ids: [CREATOR] });
  db.run(`insert into auth.users values('${newcomer}');`);
  accept(newcomer, hash, "chatter@example.test");
  const m = member(newcomer);
  assert.equal(m.active, true);
  assert.equal(m.can_chat, true);
  assert.deepEqual(m.creator_ids, [CREATOR]);
});

test("F1: owner 'update' must not reactivate a member Twin admin revoked", { skip }, () => {
  const staff = u(12);
  addStaff(staff, "revoked-staff@example.test");
  // Twin-admin revoke exactly as app/agency-admin/provision/route.ts:24 writes it.
  db.run(`update agency_memberships set active=false,creator_access_revision=gen_random_uuid() where user_id='${staff}';`);
  const revoked = member(staff);
  assert.equal(revoked.active, false, "fixture: revoke applied");
  // /agency/team still renders the edit form for the Removed row with this current revision.
  const err = raised(() => command(OWNER, AGENCY, { operation: "update", user_id: staff, revision: revoked.revision, can_manage: false, can_chat: true, creator_scope: "all", creator_ids: [] }));
  assert.equal(member(staff).active, false, `revoked member was reactivated by an agency-owner update (rpc ${err ? `raised: ${err}` : "returned OK"})`);
});

test("F2: owner 'update' without the can_chat key must not silently revoke chat", { skip }, () => {
  const staff = u(13);
  addStaff(staff, "chat-staff@example.test");
  db.run(`update agency_memberships set can_chat=true where user_id='${staff}';`);
  const m = member(staff);
  assert.equal(m.can_chat, true, "fixture: member can chat");
  // A pre-can_chat dashboard (header :2 says the migration lands first) sends no can_chat key.
  const err = raised(() => command(OWNER, AGENCY, { operation: "update", user_id: staff, revision: m.revision, can_manage: false, creator_scope: "all", creator_ids: [] }));
  assert.doesNotMatch(err ?? "", /Owner access required|Agency unavailable|Record changed/, "fixture problem, not a can_chat refusal");
  if (err === null) assert.equal(member(staff).can_chat, true, "update without can_chat returned OK and set can_chat=false");
});

test("F4 control: deleting an Auth user with no invites succeeds", { skip }, () => {
  const lone = u(20);
  db.run(`insert into auth.users values('${lone}');`);
  db.run(`delete from auth.users where id='${lone}';`);
  assert.equal(db.query(`select 1 from auth.users where id='${lone}'`).length, 0);
});

test("F4: deleting an Auth user who sent an invite must succeed (invited_by FK)", { skip }, () => {
  command(OWNER2, AGENCY2, { operation: "invite", email: "pending@example.test", token_hash: "b".repeat(64), can_manage: false, can_chat: false, creator_scope: "all", creator_ids: [] });
  // Isolate the invite FK: drop the owner and membership rows that also reference this user.
  db.run(`delete from agency_team_owners where user_id='${OWNER2}'; delete from agency_memberships where user_id='${OWNER2}';`);
  const err = raised(() => db.run(`delete from auth.users where id='${OWNER2}';`));
  assert.equal(err, null, `auth user delete blocked: ${err}`);
});

test("F4: deleting an Auth user who accepted an invite must succeed (accepted_by FK)", { skip }, () => {
  const joiner = u(21), hash = "c".repeat(64);
  command(OWNER, AGENCY, { operation: "invite", email: "joiner@example.test", token_hash: hash, can_manage: false, can_chat: false, creator_scope: "all", creator_ids: [] });
  db.run(`insert into auth.users values('${joiner}');`);
  accept(joiner, hash, "joiner@example.test");
  db.run(`delete from agency_memberships where user_id='${joiner}';`);
  const err = raised(() => db.run(`delete from auth.users where id='${joiner}';`));
  assert.equal(err, null, `auth user delete blocked: ${err}`);
});

// F20 (round 2): invite and accept disagree on who may join (204833:52 vs :90, 20261028:24 vs :62).
// Only (a) is tested; (b) removed-member re-invite is documented, untested: its fix shape couples to F1.
const AGENCY3 = "20000000-0000-4000-8000-000000000003", OWNER3 = u(3);
const ownAgency3 = () => {
  if (db.query(`select 1 from partner_agencies where id='${AGENCY3}'`).length) return;
  db.run(`insert into auth.users values('${OWNER3}'); insert into partner_agencies values('${AGENCY3}',true);
    insert into agency_memberships(user_id,agency_id,email) values('${OWNER3}','${AGENCY3}','owner3@example.test');
    insert into agency_team_owners(user_id,agency_id) values('${OWNER3}','${AGENCY3}');`);
};
const invite = (actor, agency, email, hash) => command(actor, agency, { operation: "invite", email, token_hash: hash, can_manage: false, can_chat: false, creator_scope: "all", creator_ids: [] });

test("F20 control: owner of agency B invites a brand-new email", { skip }, () => {
  ownAgency3();
  invite(OWNER3, AGENCY3, "brand-new@example.test", "e".repeat(64));
  assert.equal(db.query(`select 1 from agency_team_invites where agency_id='${AGENCY3}' and email='brand-new@example.test' and revoked_at is null`).length, 1);
});

test("F20a: inviting an active member of another agency must be refused up front", { skip }, () => {
  ownAgency3();
  const other = u(30), email = "a-member@example.test", hash = "f".repeat(64);
  addStaff(other, email, AGENCY);
  const err = raised(() => invite(OWNER3, AGENCY3, email, hash));
  assert.doesNotMatch(err ?? "", /Owner access required|Agency unavailable|Invalid creator scope/, "fixture problem, not a membership refusal");
  // Today the invite is created; show what the invitee then hits.
  const acceptErr = err === null ? raised(() => accept(other, hash, email)) : null;
  assert.notEqual(err, null, `invite returned an id ("Invitation created"); accept by the invitee then ${acceptErr ? `raised: ${acceptErr.split("\n")[0]}` : "succeeded"}`);
});
