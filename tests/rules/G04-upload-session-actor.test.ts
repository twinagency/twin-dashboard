/**
 * RULE G04 (coordinator decision on #389): the named owner is opt-in per route (handover requests, memory correction) and never an
 * upload actor. Upload permission verifies an operator actor against a live owner session (dashboard_owner_session_verify on the
 * token hash); the named-owner hash has the same `op-session:<64 hex>` shape but no session row, so an upload stamped with it would
 * fail permission at the backend (twin-onlyfans-backend content_sync_media.py checks the lease actor).
 * Pins: (1) the REAL content-sync upload route, driven through tests/rules/controls-route.child.ts as an internal operator whose named
 * owner resolves, posts the session actor, not the named owner; (2) currentUploadPermission refuses a named-owner actor and admits
 * the same operator's session actor (fake DB that verifies only the session hash); (3) at type level the content-sync call takes a
 * SessionActor only (lib/onlyfans/actor.ts; the @ts-expect-error line fails `npm run typecheck` if a NamedOwnerActor becomes
 * assignable). currentUploadPermission takes a plain string: its caller passes a wire value, and (2) checks it at runtime.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { namedOwnerActor } from "../../lib/onlyfans/plan-c-owner-core";
import { currentUploadPermission } from "../../lib/onlyfans/upload-permission";
import type { SessionActor } from "../../lib/onlyfans/actor";
import type { SyncCall } from "../../lib/onlyfans/content-sync-route";
import { controlsChild, NAMED_OWNER, SESSION_A } from "./controls-fixtures";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const SESSION_ACTOR = `op-session:${sha(SESSION_A)}` as SessionActor;
const CREATOR = "33333333-3333-4333-8333-333333333333";

async function named() {
  Object.assign(process.env, { SUPABASE_URL: "https://supabase.fixture.invalid", SUPABASE_SERVICE_KEY: "synthetic-service-key" });
  const actor = await namedOwnerActor(SESSION_A, (async () => Response.json(NAMED_OWNER)) as unknown as typeof fetch);
  assert.ok(actor && actor !== "unavailable", "precondition: the named owner resolved");
  return actor;
}

test("the content-sync upload route stamps the session actor even when the operator's named owner resolves", () => {
  const r = controlsChild("upload-actor");
  assert.equal(r.posts, 1, "precondition: the settings command reached the backend");
  assert.equal(r.actor, SESSION_ACTOR);
  assert.notEqual(r.actor, `op-session:${sha(`twin-plan-c-named-owner-v1:${NAMED_OWNER}`)}`);
});

test("upload permission refuses a named-owner actor and admits the same operator's session actor", async () => {
  const owner = await named();
  const hashes: string[] = [];
  const db = { rpc: async (name: string, input: { p_session_hash: string }) => {
    assert.equal(name, "dashboard_owner_session_verify");
    hashes.push(input.p_session_hash);
    return { data: input.p_session_hash === sha(SESSION_A), error: null };
  } } as unknown as SupabaseClient;
  assert.equal(await currentUploadPermission(owner, CREATOR, db), false);
  assert.equal(await currentUploadPermission(SESSION_ACTOR, CREATOR, db), true);
  assert.equal(hashes.length, 2, "both actors reached the live session check");
  // @ts-expect-error the content-sync upload call takes a session actor only
  const call: SyncCall = { method: "POST", accountId: "of-a", path: ["settings"], search: new URLSearchParams(), actor: owner, canManage: true };
  assert.ok(call);
});
