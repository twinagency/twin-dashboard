/**
 * KNOWN RED (W4 F4, docs/review/W4/api-ai-assistant-plus2.md): write-tools.ts:71-79 `logWrite` awaits the
 * system_logs insert but ignores its `{error}` (supabase-js does not throw), so an applied write whose audit row
 * failed returns exactly what a fully logged write returns, and POST /api/ai-assistant/approve answers the operator
 * exactly as for a logged write. CLAUDE.md rule 3: every assistant write is logged.
 * Control: log insert succeeds → {ok:true} from the executor and 200 {ok:true} from the approve route.
 * Red: when the insert answers HTTP 500 the result must differ from the success result, at the executor and at the
 * route. A determinism guard runs first (two log-OK runs must be equal), so "differs" cannot come from noise.
 * Fix shapes accepted: none is encoded. A flag, an error, a throw, a different status or body all count; a shared
 * system-log writer is fine as long as the failure reaches the caller.
 * The route call sends a stored proposal with every plausible identifier (as in the F1 test), so an F1 fix that
 * binds approve to stored proposals keeps the control green; the store is reseeded per call.
 * FIXTURE CHANGE (G18 legacy ids): new proposals' ids "p1"/"p2" are now UUIDs, since /approve refuses non-UUID (legacy) ids; assertions unchanged.
 * Run: env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test nice -n 10 node --import tsx --test tests/rules/G18-audit-log-failure.test.ts (copied from tests/known-red/W4-api-ai-assistant-plus2-audit-log-failure.test.ts)
 * DECLARED BYPASS: Next workAsyncStorage fake store (see harness header); PostgREST faked on 127.0.0.1.
 */
import { CLONE, inWorkStore, jsonRequest, startFakePostgrest, type FakePostgrest } from "./G18-harness";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

const CONV = "abababab-abab-4bab-8bab-abababababab";
const MSG = "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd";
const ARGS = { clone: CLONE.id, status: "paused" };

let pg: FakePostgrest;
before(async () => { pg = await startFakePostgrest(); });
after(async () => { await pg.close(); });
beforeEach(() => pg.reset());

function arrange(logFails: boolean) {
  pg.reset();
  pg.seed("clones", [{ ...CLONE, status: "active" }]);
  pg.seed("ai_conversations", [{ id: CONV, title: "t", created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" }]);
  pg.seed("ai_messages", [{
    id: MSG, conversation_id: CONV, role: "assistant", content: "Queued a pause.", created_at: "2026-11-01T00:00:00Z",
    meta: { proposals: [{ id: "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1", tool: "setCloneStatus", args: ARGS, summary: `PAUSE clone ${CLONE.id}.`, heavy: true }] },
  }]);
  pg.respond((c) => (logFails && c.table === "system_logs" && c.method === "POST"
    ? { status: 500, body: { code: "XX000", message: "system_logs insert failed (test)", details: null, hint: null } }
    : undefined));
}

async function pause(logFails: boolean): Promise<unknown> {
  arrange(logFails);
  const { executeWriteTool } = await import("../../app/api/ai-assistant/write-tools");
  try {
    return await inWorkStore(() => executeWriteTool("setCloneStatus", { ...ARGS }));
  } catch (e) {
    return { thrown: e instanceof Error ? e.message : String(e) };
  }
}

async function approveRoute(logFails: boolean): Promise<{ status: number; body: unknown }> {
  arrange(logFails);
  const { POST } = await import("../../app/api/ai-assistant/approve/route");
  return inWorkStore(async () => {
    const res = await POST(jsonRequest("/api/ai-assistant/approve", { conversationId: CONV, messageId: MSG, proposalId: "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1", id: "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1", tool: "setCloneStatus", args: ARGS }));
    return { status: res.status, body: await res.json().catch(() => null) };
  });
}

test("control: with the audit insert succeeding the write returns ok:true and one system_logs POST", async () => {
  const r = (await pause(false)) as any;
  assert.equal(r?.ok, true, JSON.stringify(r));
  assert.equal(pg.writes("PATCH", "clones").length, 1);
  assert.equal(pg.writes("POST", "system_logs").length, 1);
});

test("control: approve route with the audit insert succeeding answers 200 ok:true and logs once", async () => {
  const r = await approveRoute(false);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((r.body as any)?.ok, true);
  assert.equal(pg.writes("PATCH", "clones").length, 1);
  assert.equal(pg.writes("POST", "system_logs").length, 1);
});

test("F4: a failed system_logs insert is not reported exactly like a logged write", async () => {
  assert.deepEqual(await pause(false), await pause(false), "determinism guard: two logged runs must be equal");
  const logged = await pause(false);
  const unlogged = await pause(true);
  assert.ok(pg.writes("POST", "system_logs").length >= 1, "the audit insert must have been attempted");
  assert.notDeepEqual(unlogged, logged, "caller cannot tell the write went unaudited");
});

test("F4: POST /approve tells the operator when the audit insert failed", async () => {
  assert.deepEqual(await approveRoute(false), await approveRoute(false), "determinism guard: two logged approvals must be equal");
  const logged = await approveRoute(false);
  const unlogged = await approveRoute(true);
  assert.ok(pg.writes("POST", "system_logs").length >= 1, "the audit insert must have been attempted");
  assert.notDeepEqual(unlogged, logged, "approve answered an unaudited write exactly like an audited one");
});
