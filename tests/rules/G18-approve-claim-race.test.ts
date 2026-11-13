/**
 * Rule (G18, new; not from the known-red corpus): /approve claims a stored proposal with a compare-and-swap on
 * ai_messages.meta.claimRev (app/api/ai-assistant/db.ts claimProposal). Concurrent identical approvals apply once;
 * concurrent claims of different proposals in one message do not overwrite each other; a write that throws keeps its
 * claim as "unknown". Each was proven by planting the bug back (drop the claimRev filter; release on a throw).
 * R1 change: requests name the card by proposalId; the third test was "a failed write releases the claim", which F4
 * reversed for a throw (it may have landed). The ok:false release is in G18-approve-by-id.test.ts.
 * Run: env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test nice -n 10 node --import tsx --test tests/rules/G18-approve-claim-race.test.ts
 */
import { CLONE, inWorkStore, jsonRequest, startFakePostgrest, type FakePostgrest } from "./G18-harness";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
const CONV = "44444444-4444-4444-8444-444444444444", MSG = "55555555-5555-4555-8555-555555555555";
const ARGS = { clone: CLONE.id, status: "paused" };
let pg: FakePostgrest;
before(async () => { pg = await startFakePostgrest(); });
after(async () => { await pg.close(); });
beforeEach(() => {
  pg.reset();
  pg.seed("clones", [{ ...CLONE, status: "active" }]);
  pg.seed("ai_messages", [{ id: MSG, conversation_id: CONV, role: "assistant", content: "q", created_at: "2026-11-01T00:00:00Z",
    meta: { proposals: [{ id: "p1", tool: "setCloneStatus", args: ARGS, summary: "s", heavy: true }, { id: "p2", tool: "setCloneStatus", args: { clone: CLONE.id, status: "active" }, summary: "s", heavy: true }] } }]);
});
const approve = async (args = ARGS, proposalId = args === ARGS ? "p1" : "p2") => { const { POST } = await import("../../app/api/ai-assistant/approve/route");
  return inWorkStore(async () => { const r = await POST(jsonRequest("/api/ai-assistant/approve", { conversationId: CONV, proposalId, tool: "setCloneStatus", args })); return { status: r.status, json: await r.json() }; }); };
test("concurrent identical approvals apply once", async () => {
  const rs = await Promise.all([approve(), approve(), approve()]);
  assert.equal(pg.writes("PATCH", "clones").length, 1, JSON.stringify(rs));
  assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409, 409]);
});
test("concurrent different proposals in one message both claim, neither lost", async () => {
  const rs = await Promise.all([approve(), approve({ clone: CLONE.id, status: "active" })]);
  assert.deepEqual(rs.map((r) => r.status), [200, 200], JSON.stringify(rs));
  assert.deepEqual(pg.rows("ai_messages").find((m) => m.id === MSG)!.meta.claims, { p1: "applied", p2: "applied" });
  assert.equal((await approve()).status, 409);
});
test("a write that throws keeps its claim as unknown, so a retry does not run it again", async () => {
  pg.respond((c) => (c.table === "clones" && c.method === "PATCH" ? { status: 500, body: { code: "23514", message: "boom" } } : undefined));
  assert.equal((await approve()).status, 500);
  pg.respond(() => undefined);
  const r = await approve();
  assert.equal(r.status, 409, JSON.stringify(r.json));
  assert.equal(pg.writes("PATCH", "clones").length, 1, "the retry ran the write again");
});
