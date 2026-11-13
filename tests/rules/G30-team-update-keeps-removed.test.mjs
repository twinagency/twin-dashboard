// Was KNOWN RED (W5 db-migrations F1): an agency-owner 'update' through agency_team_command set active=true, so the
// edit form on a Removed row reactivated a member Twin admin revoked. Green since G30 (20261113100200: update edits
// active members only). F2/F4/F20a of the same review stay known-red outside this file. Applies the REAL chain
// 204833 -> 20261028125157 -> 20261113100200 in a throwaway initdb cluster (tests/support/W5-db-migrations-pg.mjs);
// skips without PG binaries.
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
  db.run(migration("20261113100200_agency_team_update_keeps_removed.sql"));
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
