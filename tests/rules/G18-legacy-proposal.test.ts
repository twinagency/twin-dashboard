/**
 * Rule (G18 rwl final, Flash major; not from the known-red corpus): a proposal stored before this branch has a
 * per-turn id ("p1") and no meta.claims, so it cannot say whether it was already applied (an "Applied:" line may
 * exist). Only the new code mints randomUUID ids, so a non-UUID id is legacy: /approve refuses it with 409 state
 * "unknown" BEFORE claiming (no write, no claim), and a reload renders it as the unknown (not approvable) card
 * through the shared cardState (lib/ai-claim-state.ts), never as pending.
 * Red on 73974aef: /approve ran the stored args again (200, one clones PATCH) and the reload rendered "pending".
 * Run: env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test nice -n 10 node --import tsx --test tests/rules/G18-legacy-proposal.test.ts
 * DECLARED BYPASS: Next workAsyncStorage fake store (see harness header); PostgREST faked on 127.0.0.1.
 */
import { CLONE, inWorkStore, jsonRequest, startFakePostgrest, type FakePostgrest } from "./G18-harness";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { approveOutcome, cardState } from "../../lib/ai-claim-state";

const CONV = "a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7", MSG = "b7b7b7b7-b7b7-4b7b-8b7b-b7b7b7b7b7b7";
const ARGS = { clone: CLONE.id, status: "paused" };

let pg: FakePostgrest;
before(async () => { pg = await startFakePostgrest(); });
after(async () => { await pg.close(); });
beforeEach(() => {
  pg.reset();
  pg.seed("clones", [{ ...CLONE, status: "active" }]);
  pg.seed("ai_conversations", [{ id: CONV, title: "t", created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" }]);
  pg.seed("ai_messages", [{ id: MSG, conversation_id: CONV, role: "assistant", content: "a", created_at: "2026-11-01T00:00:00Z",
    meta: { proposals: [{ id: "p1", tool: "setCloneStatus", args: ARGS, summary: "Pause it.", heavy: true }] } }]);
});

test("a legacy 'p1' proposal with no claims: /approve is 409 unknown, no write, no claim", async () => {
  const { POST } = await import("../../app/api/ai-assistant/approve/route");
  const r = await inWorkStore(async () => {
    const res = await POST(jsonRequest("/api/ai-assistant/approve", { conversationId: CONV, proposalId: "p1", tool: "setCloneStatus", args: ARGS }));
    return { ok: res.ok, status: res.status, json: await res.json() };
  });
  assert.equal(r.status, 409, JSON.stringify(r.json));
  assert.equal(r.json.state, "unknown");
  assert.match(r.json.error, /created before approval tracking/);
  assert.equal(pg.writes("PATCH", "clones").length, 0, "a legacy card ran its write");
  assert.equal(pg.writes("PATCH", "ai_messages").length, 0, "a legacy card was claimed");
  assert.equal(pg.writes("POST", "ai_messages").length, 0, "a legacy card wrote an Applied line");
  assert.equal(approveOutcome(r.ok, r.json, "Pause it.").state, "unknown");
});

test("a reloaded legacy proposal renders unknown, a UUID one with no claim renders pending", () => {
  assert.equal(cardState(undefined, "p1"), "unknown");
  assert.equal(cardState(undefined, "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1"), "pending");
  assert.equal(cardState("applied", "p1"), "approved", "a recorded claim still wins");
});
