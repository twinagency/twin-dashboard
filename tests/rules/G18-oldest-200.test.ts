/**
 * KNOWN RED (W4 F8, docs/review/W4/api-ai-assistant-plus2.md): app/api/ai-assistant/db.ts:46-52
 * getConversationMessages sends `order=created_at.asc&limit=200`, i.e. keeps the OLDEST 200 messages. Past 200
 * the model's history (route.ts:148) and the reload view (conversations/[id]/route.ts:9) lose every newer turn,
 * including `Applied:` lines and pending cards.
 * The fake PostgREST is the harness's stateful store, which honours `order` (stable) + `limit` + filters. It holds
 * 250 messages of this conversation (seeded in a scrambled physical order) plus 5 of another one.
 * Control: the read is capped at 200 rows, all of this conversation.
 * Red: the function returns the NEWEST 200, in ascending created_at order (what both callers expect: history and
 * transcript run oldest→newest). A half fix (desc + limit, no reverse) stays red.
 * Fix shapes accepted: any query shape (desc+limit+reverse, a count + offset, a range) as long as the returned rows
 * are right; nothing is asserted about the wire request.
 * Run: env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test nice -n 10 node --import tsx --test tests/known-red/W4-api-ai-assistant-plus2-oldest-200.test.ts
 * DECLARED BYPASS: none needed beyond the harness (PostgREST faked on 127.0.0.1; no server action runs).
 */
import { startFakePostgrest, type FakePostgrest } from "./G18-harness";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

const CONV = "88888888-8888-4888-8888-888888888888";
const OTHER = "89898989-8989-4989-8989-898989898989";
const N = 250;
const at = (i: number) => new Date(Date.UTC(2026, 9, 1) + i * 60_000).toISOString();
const msgId = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;

let pg: FakePostgrest;
before(async () => { pg = await startFakePostgrest(); });
after(async () => { await pg.close(); });
beforeEach(() => {
  pg.reset();
  const rows = Array.from({ length: N }, (_, k) => {
    const i = (k * 7) % N; // scrambled physical order, every i once (7 is coprime with 250)
    return { id: msgId(i), conversation_id: CONV, role: i % 2 ? "assistant" : "user", content: `m${i}`, meta: null, created_at: at(i) };
  });
  const other = Array.from({ length: 5 }, (_, i) => ({ id: msgId(1000 + i), conversation_id: OTHER, role: "user", content: `x${i}`, meta: null, created_at: at(N + i) }));
  pg.seed("ai_messages", [...rows, ...other]);
});

async function read() {
  const { getConversationMessages } = await import("../../app/api/ai-assistant/db");
  return getConversationMessages(CONV);
}

test("control: the conversation read is capped at 200 rows for this conversation", async () => {
  const rows = await read();
  const reads = pg.calls.filter((c) => c.method === "GET" && c.table === "ai_messages");
  assert.equal(reads.length >= 1, true, "expected an ai_messages read");
  assert.equal(reads[0].query.get("conversation_id"), `eq.${CONV}`);
  assert.equal(rows.length, 200);
  assert.ok(rows.every((r) => r.conversation_id === CONV));
});

test("F8: the conversation read returns the newest 200 messages, oldest first", async () => {
  const rows = await read();
  const expected = Array.from({ length: 200 }, (_, k) => `m${N - 200 + k}`);
  assert.deepEqual(rows.map((r) => r.content), expected, `got ${rows[0]?.content} … ${rows.at(-1)?.content}`);
});
