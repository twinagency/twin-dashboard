/**
 * RULE (W4 H2, docs/review/W4/api-ai-assistant-plus2.md; CLAUDE.md rule 3; REVIEW.md invariant 3): the /ai chat
 * route never executes a write. Every write tool the model calls becomes one `proposal` SSE event, nothing is
 * written to clones/users/system_logs, and the tool result handed back to the model says applied:false.
 * Characterization (green today), mutation-proven: tests/rules/mutations/W4-api-ai-assistant-plus2/.
 * Run: env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test nice -n 10 node --import tsx --test tests/rules/W4-api-ai-assistant-plus2-chat-never-writes.test.ts
 * DECLARED BYPASS: Next workAsyncStorage fake store (see tests/known-red/W4-api-ai-assistant-plus2-harness.ts);
 * PostgREST faked on 127.0.0.1 (answers clone + fan lookups so a write WOULD land if attempted); OpenRouter faked
 * at the fetch boundary (one turn calling all 8 write tools, then an empty "stop" turn).
 */
import { CLONE, FAN_ID, inWorkStore, jsonRequest, readSse, startFakePostgrest, stubOpenRouter, type FakePostgrest } from "../known-red/W4-api-ai-assistant-plus2-harness";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

const CALLS: { name: string; args: Record<string, unknown> }[] = [
  { name: "setCloneFeature", args: { clone: CLONE.id, field: "voice_enabled", enabled: true } },
  { name: "setCloneDial", args: { clone: CLONE.id, field: "push_level", value: "high" } },
  { name: "setCloneStatus", args: { clone: CLONE.id, status: "paused" } },
  { name: "recompileClonePersona", args: { clone: CLONE.id } },
  { name: "setFanCredits", args: { userId: FAN_ID, credits: 99 } },
  { name: "setFanActive", args: { userId: FAN_ID, active: false } },
  { name: "setFanBlocked", args: { userId: FAN_ID, blocked: true } },
  { name: "resetFanCounters", args: { userId: FAN_ID } },
];

let pg: FakePostgrest;
let events: any[] = [];
let upstream: any[] = [];
before(async () => {
  pg = await startFakePostgrest();
  pg.respond((c) => {
    if (c.method !== "GET") return undefined;
    if (c.table === "clones") return { body: [{ ...CLONE, intake: null }] };
    if (c.table === "users") return { body: [{ id: FAN_ID, clone_id: CLONE.id, stated_name: "Sam", message_credits: 1 }] };
    return undefined;
  });
  const or = stubOpenRouter([{ toolCalls: CALLS }, { text: "Queued, needs your tap." }]);
  try {
    const { POST } = await import("../../app/api/ai-assistant/route");
    events = await inWorkStore(async () => readSse(await POST(jsonRequest("/api/ai-assistant", { conversationId: "99999999-9999-4999-8999-999999999999", message: "do all of it" }))));
  } finally {
    or.restore();
    upstream = or.requests;
  }
});
after(async () => { await pg.close(); });

test("H2: no write tool call reaches clones, users or system_logs from the chat route", () => {
  const writes = pg.calls.filter((c) => c.method !== "GET" && ["clones", "users", "system_logs"].includes(c.table));
  assert.deepEqual(writes.map((c) => `${c.method} ${c.table}`), []);
});

test("H2: each write tool call becomes exactly one proposal SSE event, in order", () => {
  const proposals = events.filter((e) => e.type === "proposal");
  assert.deepEqual(proposals.map((p) => p.tool), CALLS.map((c) => c.name));
  assert.deepEqual(proposals.map((p) => p.args), CALLS.map((c) => c.args));
});

test("H2: the tool result the model sees for every write says applied:false", () => {
  assert.equal(upstream.length, 2, "one tool turn and one final turn upstream");
  const toolMsgs = (upstream[1].messages as any[]).filter((m) => m.role === "tool");
  assert.equal(toolMsgs.length, CALLS.length);
  for (const m of toolMsgs) {
    const r = JSON.parse(m.content);
    assert.equal(r.applied, false, m.content);
    assert.equal(r.status, "awaiting_approval", m.content);
  }
});
