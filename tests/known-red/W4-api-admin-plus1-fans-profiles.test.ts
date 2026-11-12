import "../support/admin-route-env";
/**
 * KNOWN RED (W4 api-admin-plus1 F3, docs/review/W4/api-admin-plus1.md): GET /api/admin/v1/fans?fan=<telegram id>
 * that matches users on two clones runs the fan_profiles query with NO filter, so 50 unrelated profiles come back
 * under this fan while the note says "the profile lookup is skipped while ambiguous"; and a profile query error
 * reads as `profiles: []` with ok:true. Drives the real route; PostgREST faked at the wire
 * (tests/support/admin-wire.ts). Control: a single matching user gets only its own profile.
 * Turns green when the ambiguous case skips (or user-filters) the profile read and a profile error is not ok.
 * Team's Claude owns the fix. Not wired into npm scripts on purpose.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { adminRequest, installWire } from "../support/admin-wire";
import { GET } from "../../app/api/admin/v1/fans/route";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const users = [
  { id: "user-a", clone_id: A, telegram_id: 777, name: "fan on A" },
  { id: "user-b", clone_id: B, telegram_id: 777, name: "fan on B" },
  { id: "user-x", clone_id: A, telegram_id: 999, name: "someone else" },
];
const fan_profiles = [
  { user_id: "user-a", clone_id: A, summary: "A's fan" },
  { user_id: "user-b", clone_id: B, summary: "B's fan" },
  { user_id: "user-x", clone_id: A, summary: "UNRELATED fan 999" },
];
const get = (q: string) => GET(adminRequest(`/api/admin/v1/fans?${q}`));

test("control: an unambiguous telegram id returns only its own profile", async () => {
  const w = installWire({ tables: { users, fan_profiles } });
  try {
    const res = await get("fan=999");
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.deepEqual(body.profiles.map((p: { user_id: string }) => p.user_id), ["user-x"]);
  } finally { w.restore(); }
});

test("F3: an ambiguous telegram id never returns another fan's profile", async () => {
  const w = installWire({ tables: { users, fan_profiles } });
  try {
    const res = await get("fan=777");
    const body = await res.json();
    assert.equal(body.users.length, 2, "fixture: the id is ambiguous across two clones");
    const foreign = (body.profiles ?? []).filter((p: { user_id: string }) => !["user-a", "user-b"].includes(p.user_id));
    assert.deepEqual(foreign, [], "profiles of a different telegram id were returned under this fan");
    for (const c of w.rest("fan_profiles", "GET")) {
      assert.ok(c.url.searchParams.has("user_id"), `fan_profiles read without a user_id filter: ${c.url.search}`);
    }
  } finally { w.restore(); }
});

test("F3: a fan_profiles read error is not reported as ok with profiles: []", async () => {
  const w = installWire({
    tables: { users, fan_profiles },
    override: (c) => c.table === "fan_profiles"
      ? new Response(JSON.stringify({ code: "57014", message: "canceling statement due to statement timeout" }), { status: 500, headers: { "content-type": "application/json" } })
      : undefined,
  });
  try {
    const res = await get("fan=999");
    const body = await res.json();
    assert.ok(!(res.status === 200 && body.ok === true && Array.isArray(body.profiles) && body.profiles.length === 0),
      "a failed profile read was served as a fan with no profile");
  } finally { w.restore(); }
});
