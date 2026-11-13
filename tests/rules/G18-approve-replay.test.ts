/**
 * KNOWN RED (W4 F1, docs/review/W4/api-ai-assistant-plus2.md): POST /api/ai-assistant/approve runs whatever
 * tool+args the client posts. It is not bound to a stored proposal and never consumes it, so the same approval
 * replayed (re-armed card after reload, two tabs) applies twice, a write nobody proposed runs too, and a stored
 * proposal's id can be sent with different args.
 * Control: one approval of a stored proposal returns 200 and PATCHes that clone once.
 * Fix shapes accepted: approve executes only a stored, still-pending proposal (the stored args, not the client's)
 * and consumes it, e.g. an atomic conditional flip pending→applied. The fake PostgREST is the harness's stateful
 * store: PATCH honours eq/is/in/cs filters (and `meta->...` json paths) and returns representation / Content-Range
 * when asked, so a conditional update that matches 0 rows on replay behaves as it would in Postgres. Refusing
 * (4xx) or answering the replay as an idempotent no-op both pass; the assertions count clone PATCHes only.
 * Every plausible identifier is sent (conversationId, messageId, proposalId, id).
 * TEST-CHANGE NEEDED IF: the fix stores proposals somewhere other than ai_messages.meta.proposals (e.g. a new
 * table): seed that table in beforeEach instead; the store already serves any table name.
 * FIXTURE CHANGE (G18 legacy ids): new proposals' ids "p1"/"p2" are now UUIDs, since /approve refuses non-UUID (legacy) ids; assertions unchanged.
 * Run: env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test nice -n 10 node --import tsx --test tests/rules/G18-approve-replay.test.ts (copied from tests/known-red/W4-api-ai-assistant-plus2-approve-replay.test.ts)
 * DECLARED BYPASS: Next workAsyncStorage fake store (see harness header); PostgREST faked on 127.0.0.1.
 */
import { CLONE, OTHER_CLONE, inWorkStore, jsonRequest, startFakePostgrest, type FakePostgrest } from "./G18-harness";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

const CONV = "44444444-4444-4444-8444-444444444444";
const MSG = "55555555-5555-4555-8555-555555555555";
const ARGS = { clone: CLONE.id, status: "paused" };
const PROPOSAL = { id: "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1", tool: "setCloneStatus", args: ARGS, summary: `PAUSE clone ${CLONE.id}.`, heavy: true };

let pg: FakePostgrest;
before(async () => { pg = await startFakePostgrest(); });
after(async () => { await pg.close(); });
beforeEach(() => {
  pg.reset();
  pg.seed("clones", [{ ...CLONE, status: "active" }, { ...OTHER_CLONE, status: "active" }]);
  pg.seed("ai_conversations", [{ id: CONV, title: "pause test", created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" }]);
  pg.seed("ai_messages", [
    { id: MSG, conversation_id: CONV, role: "assistant", content: "Queued a pause.", meta: { proposals: [PROPOSAL] }, created_at: "2026-11-01T00:00:00Z" },
  ]);
});

async function approve(body: Record<string, unknown>) {
  const { POST } = await import("../../app/api/ai-assistant/approve/route");
  return inWorkStore(async () => {
    const res = await POST(jsonRequest("/api/ai-assistant/approve", body));
    return { status: res.status, json: await res.json().catch(() => null) };
  });
}
const ids = { conversationId: CONV, messageId: MSG, proposalId: "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1", id: "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1" };
const approvalBody = { ...ids, tool: "setCloneStatus", args: ARGS };
const clonePatches = () => pg.writes("PATCH", "clones");

test("control: approving a stored proposal once returns 200 and PATCHes that clone once", async () => {
  const r = await approve(approvalBody);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json?.ok, true);
  assert.equal(clonePatches().length, 1);
  assert.equal(clonePatches()[0].query.get("id"), `eq.${CLONE.id}`);
  assert.equal(clonePatches()[0].body?.status, "paused");
  assert.equal(pg.rows("clones").find((c) => c.id === CLONE.id)?.status, "paused");
});

test("F1: replaying the identical approval does not apply the write a second time", async () => {
  const first = await approve(approvalBody);
  assert.equal(first.status, 200, "first approval must apply");
  await approve(approvalBody);
  assert.equal(clonePatches().length, 1, "second identical approve must not PATCH clones again");
});

test("F1: a write that no stored conversation ever proposed is refused and not applied", async () => {
  const r = await approve({ conversationId: CONV, tool: "setCloneStatus", args: { clone: OTHER_CLONE.id, status: "paused" } });
  assert.equal(clonePatches().length, 0, "an unproposed write must not reach clones");
  assert.ok(r.status >= 400 && r.status < 500, `expected a 4xx refusal, got ${r.status}`);
});

test("F1: a stored proposal's identifiers sent with tampered args do not write the tampered target", async () => {
  await approve({ ...ids, tool: "setCloneStatus", args: { clone: OTHER_CLONE.id, status: "paused" } });
  assert.deepEqual(
    clonePatches().filter((c) => c.query.get("id") === `eq.${OTHER_CLONE.id}`).map((c) => c.url),
    [],
    "approve of proposal p1 (clone A) PATCHed clone OTHER from client-supplied args",
  );
  assert.equal(pg.rows("clones").find((c) => c.id === OTHER_CLONE.id)?.status, "active");
});
