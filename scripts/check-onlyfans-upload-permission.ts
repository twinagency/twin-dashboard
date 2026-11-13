import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentUploadPermission, type SessionActor } from "../lib/onlyfans/upload-permission";

const agency = "11111111-1111-4111-8111-111111111111", user = "22222222-2222-4222-8222-222222222222";
const creator = "33333333-3333-4333-8333-333333333333", revision = "44444444-4444-4444-8444-444444444444";
const actor = `agency-user:${agency}:${user}` as SessionActor;
const state = { active: true, manage: true, assigned: true, owner: true, failure: false, selected: false };
let calls = 0;
const db = {
  rpc: async (name: string, input: Record<string,string>) => {
    assert.equal(name, "dashboard_owner_session_verify");
    assert.equal(input.p_session_hash, "a".repeat(64));
    calls++;
    return { data: state.owner, error: state.failure ? new Error("offline") : null };
  },
  from(table: string) {
    const query = {
      select() { return query; }, eq() { return query; },
      async maybeSingle() {
        calls++;
        const data = table === "agency_memberships" ? { can_manage: state.manage, creator_scope: state.selected ? "selected" : "all",
          creator_ids: state.selected ? [] : [], creator_access_revision: revision }
          : table === "partner_agencies" ? state.active ? { id: agency } : null
          : state.assigned ? { clone_id: creator } : null;
        return { data, error: state.failure ? new Error("offline") : null };
      },
    };
    return query;
  },
} as unknown as SupabaseClient;

async function main() {
  assert.equal(await currentUploadPermission(actor, creator, db), true);
  // Every boundary reads fresh authority: a queued operation inherits no cache.
  for (const key of ["active", "manage", "assigned"] as const) {
    state[key] = false;
    assert.equal(await currentUploadPermission(actor, creator, db), false, key);
    state[key] = true;
  }
  state.selected = true;
  assert.equal(await currentUploadPermission(actor, creator, db), false);
  state.selected = false;
  state.failure = true;
  assert.equal(await currentUploadPermission(actor, creator, db), false);
  state.failure = false;
  assert.equal(await currentUploadPermission(`op-session:${"a".repeat(64)}` as SessionActor, creator, db), true);
  state.owner = false;
  assert.equal(await currentUploadPermission(`op-session:${"a".repeat(64)}` as SessionActor, creator, db), false);
  const before = calls;
  assert.equal(await currentUploadPermission("forged" as SessionActor, creator, db), false);
  assert.equal(await currentUploadPermission(actor, "invalid-creator", db), false);
  assert.equal(calls, before);
  console.log("upload permission: 11 checks passed; live lookup required at each boundary");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
