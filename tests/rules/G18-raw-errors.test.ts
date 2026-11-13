/**
 * KNOWN RED (W4 api-ai-assistant-plus2 F17, docs/review/W4/api-ai-assistant-plus2.md): app/api/ai-assistant/approve/route.ts:38-39
 * returns `e.message` of a failed write verbatim, so a raw PostgREST error (table/constraint/detail text) reaches the browser.
 * Control: a write that succeeds returns 200 ok. Red: a clones PATCH that fails with a PostgREST 500 answers with a body that
 * does not contain the raw database message. Any status is accepted; only the leaked text is asserted.
 * Run: env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test nice -n 10 node --import tsx --test tests/known-red/W7-P-picks-W4-ai-raw-errors.test.ts
 * DECLARED BYPASS: the W4 ai harness (PostgREST faked on 127.0.0.1, Next workAsyncStorage fake store).
 * FIXTURE CHANGE (G18, copied from tests/known-red/W7-P-picks-W4-ai-raw-errors.test.ts): the G18 replay fix (W4 F1) makes
 * approve run only a stored proposal, so the approval now names a conversation holding one (assertions unchanged).
 */
import { CLONE, inWorkStore, jsonRequest, startFakePostgrest, type FakePostgrest } from "./G18-harness";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

const RAW = "new row for relation \"clones\" violates check constraint \"clones_internal_secret_chk\"";
let pg: FakePostgrest;
before(async () => { pg = await startFakePostgrest(); });
after(async () => { await pg.close(); });
const CONV = "f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1";
const ARGS = { clone: CLONE.id, status: "paused" };
beforeEach(() => {
  pg.reset();
  pg.seed("clones", [{ ...CLONE, status: "active" }]);
  pg.seed("ai_messages", [{ id: "f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2", conversation_id: CONV, role: "assistant", content: "Queued a pause.",
    created_at: "2026-11-01T00:00:00Z", meta: { proposals: [{ id: "p1", tool: "setCloneStatus", args: ARGS, summary: "PAUSE", heavy: true }] } }]);
});

async function approve() {
  const { POST } = await import("../../app/api/ai-assistant/approve/route");
  return inWorkStore(async () => {
    const res = await POST(jsonRequest("/api/ai-assistant/approve", { conversationId: CONV, tool: "setCloneStatus", args: ARGS }));
    return { status: res.status, text: await res.text() };
  });
}

test("control: a successful approve returns 200 ok", async () => {
  const r = await approve();
  assert.equal(r.status, 200, r.text);
  assert.match(r.text, /"ok":true/);
});

test("F17: a failed write does not send the raw PostgREST message to the browser", async () => {
  pg.respond((c) => (c.table === "clones" && c.method === "PATCH" ? { status: 500, body: { code: "23514", message: RAW } } : undefined));
  const r = await approve();
  assert.notEqual(r.status, 200, "a failed write must not answer 200");
  assert.ok(!r.text.includes("clones_internal_secret_chk"), `raw database error reached the response: ${r.text}`);
});
