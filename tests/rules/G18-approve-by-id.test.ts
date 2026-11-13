/**
 * Rule (G18 rwl R1, F1-F5; not from the known-red corpus): /api/ai-assistant/approve runs exactly the stored proposal the
 * card names (proposalId), the chat route stores a proposal BEFORE its card is streamed, and each claim ends as
 * applied, unknown (the write threw, it may have landed: never re-run) or released (the tool returned ok:false).
 * - two cards with identical args: approving A twice never consumes B (F3)
 * - a card is approvable while its turn is still streaming, and the turn's final save keeps the claim (F1)
 * - a write that throws after the clones PATCH (revalidatePath outside a request) is "unknown": a retry is 409 and
 *   does not PATCH again, and a system_logs row records the unknown outcome (F2/F4)
 * - an ok:false tool result releases the claim, so the same card can be retried (F4)
 * - a reload returns meta.claims and storedCardState maps it: applied -> approved, unknown -> unknown (F5)
 * Each was proven red on fceff02b (or by planting the hunk back), see the PR.
 * Run: env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test nice -n 10 node --import tsx --test tests/rules/G18-approve-by-id.test.ts
 * DECLARED BYPASS: Next workAsyncStorage fake store (see harness header), deliberately left out for the one call
 * that must throw after the write; PostgREST faked on 127.0.0.1; OpenRouter faked at the fetch boundary.
 */
import { CLONE, FAN_ID, inWorkStore, jsonRequest, startFakePostgrest, stubOpenRouter, type FakePostgrest } from "./G18-harness";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { storedCardState } from "../../app/api/ai-assistant/claim-state";

const CONV = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const MSG_A = "b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1", MSG_B = "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2";
const A = "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1", B = "c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2";
const ARGS = { clone: CLONE.id, status: "paused" };
const card = (id: string, tool = "setCloneStatus", args: Record<string, unknown> = ARGS) => ({ id, tool, args, summary: "s", heavy: true });

let pg: FakePostgrest;
before(async () => { pg = await startFakePostgrest(); });
after(async () => { await pg.close(); });
beforeEach(() => {
  pg.reset();
  pg.seed("clones", [{ ...CLONE, status: "active" }]);
  pg.seed("ai_conversations", [{ id: CONV, title: "t", created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" }]);
  pg.seed("ai_messages", [
    { id: MSG_A, conversation_id: CONV, role: "assistant", content: "a", created_at: "2026-11-01T00:00:00Z", meta: { proposals: [card(A)] } },
    { id: MSG_B, conversation_id: CONV, role: "assistant", content: "b", created_at: "2026-11-01T00:01:00Z", meta: { proposals: [card(B)] } },
  ]);
});

async function approve(proposalId: string, opts: { tool?: string; args?: Record<string, unknown>; noStore?: boolean } = {}) {
  const { POST } = await import("../../app/api/ai-assistant/approve/route");
  const run = async () => {
    const r = await POST(jsonRequest("/api/ai-assistant/approve", { conversationId: CONV, proposalId, tool: opts.tool ?? "setCloneStatus", args: opts.args ?? ARGS }));
    return { status: r.status, json: await r.json() };
  };
  return opts.noStore ? run() : inWorkStore(run);
}
const claims = (msg: string) => pg.rows("ai_messages").find((m) => m.id === msg)?.meta?.claims ?? {};
const clonePatches = () => pg.writes("PATCH", "clones").length;

test("F3: replaying card A never consumes the identical card B", async () => {
  assert.equal((await approve(A)).status, 200);
  assert.deepEqual([claims(MSG_A), claims(MSG_B)], [{ [A]: "applied" }, {}], "approving A claimed some other card");
  const replay = await approve(A);
  assert.equal(replay.status, 409, JSON.stringify(replay.json));
  assert.equal(replay.json.state, "applied");
  assert.equal(clonePatches(), 1, "the replay of A ran a write");
  assert.equal((await approve(B)).status, 200, "B must still be approvable after A was replayed");
  assert.equal(clonePatches(), 2);
});

test("F3: an unknown id, or a known id with other args, is refused and writes nothing", async () => {
  const unknown = await approve("d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1");
  assert.equal(unknown.status, 404);
  assert.doesNotMatch(unknown.json.error, /ask/i, "the 404 tells the operator to ask again for a card they can see");
  assert.equal((await approve(A, { args: { clone: CLONE.id, status: "active" } })).status, 404);
  assert.equal(clonePatches(), 0);
});

test("F1: a card is approvable while its turn is still streaming, and the final save keeps the claim", async () => {
  const or = stubOpenRouter([{ toolCalls: [{ name: "setCloneStatus", args: ARGS }] }, { text: "Queued, needs your tap." }]);
  const stubbed = globalThis.fetch;
  let open!: () => void;
  const gate = new Promise<void>((r) => (open = r));
  // Hold the model's second turn until the approval has run: the turn is still streaming while the card is approved.
  globalThis.fetch = (async (input: any, init?: any) => {
    if (String(input?.url ?? input).includes("openrouter.ai") && or.requests.length >= 1) await gate;
    return stubbed(input, init);
  }) as typeof fetch;
  try {
    const { POST } = await import("../../app/api/ai-assistant/route");
    await inWorkStore(async () => {
      const res = await POST(jsonRequest("/api/ai-assistant", { conversationId: CONV, message: "pause it" }));
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = "", proposal: any = null;
      while (!proposal) {
        const { value, done } = await reader.read();
        assert.ok(!done, "stream ended without a proposal event");
        buf += dec.decode(value, { stream: true });
        proposal = buf.split("\n\n").map((b) => b.replace(/^data: /, "")).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).find((e) => e?.type === "proposal");
      }
      const r = await approve(proposal.id, { args: proposal.args });
      assert.equal(r.status, 200, `approve during the turn: ${JSON.stringify(r.json)}`);
      assert.equal(clonePatches(), 1);
      open();
      while (!(await reader.read()).done);
      const row = pg.rows("ai_messages").find((m) => m.meta?.proposals?.some((p: any) => p.id === proposal.id))!;
      assert.equal(row.content, "Queued, needs your tap.", "the final text reached the stored row");
      assert.equal(row.meta.claims?.[proposal.id], "applied", "the turn's final save overwrote the claim");
    });
  } finally {
    open();
    or.restore();
  }
});

test("F2/F4: a write that throws after the PATCH is unknown: retry is 409 and never re-runs it", async () => {
  // Outside a request revalidatePath throws, and setStatus calls it after its clones update: the write landed.
  const first = await approve(A, { noStore: true });
  assert.equal(first.status, 500, JSON.stringify(first.json));
  assert.equal(first.json.state, "unknown");
  assert.equal(clonePatches(), 1, "fixture: the clones PATCH ran before the throw");
  assert.equal(claims(MSG_A)[A], "unknown", "a write that may have landed was released for a retry");
  const log = pg.writes("POST", "system_logs").map((c) => c.body);
  assert.equal(log.length, 1, "no audit row for the unknown outcome");
  assert.equal(log[0].detail?.outcome, "unknown");
  const retry = await approve(A);
  assert.equal(retry.status, 409, JSON.stringify(retry.json));
  assert.equal(retry.json.state, "unknown");
  assert.doesNotMatch(retry.json.error, /already applied/, "an unknown outcome is reported as applied");
  assert.equal(clonePatches(), 1, "the retry ran the write again");
});

test("F4: an ok:false tool result releases the claim, so the same card can be retried", async () => {
  const blockArgs = { userId: FAN_ID, blocked: true };
  pg.seed("ai_messages", [{ id: MSG_A, conversation_id: CONV, role: "assistant", content: "a", created_at: "2026-11-01T00:00:00Z", meta: { proposals: [card(A, "setFanBlocked", blockArgs)] } }]);
  const refused = await approve(A, { tool: "setFanBlocked", args: blockArgs }); // no such fan yet: ok:false, nothing written
  assert.equal(refused.status, 400, JSON.stringify(refused.json));
  assert.deepEqual(claims(MSG_A), {}, "an ok:false refusal kept its claim");
  pg.seed("users", [{ id: FAN_ID, clone_id: CLONE.id, name: "Sam", blocked: false }]);
  const retry = await approve(A, { tool: "setFanBlocked", args: blockArgs });
  assert.equal(retry.status, 200, JSON.stringify(retry.json));
  assert.equal(claims(MSG_A)[A], "applied");
});

test("F5: a reload returns each card's claim state, and storedCardState renders it", async () => {
  assert.equal((await approve(B)).status, 200);
  pg.seed("ai_messages", [...pg.rows("ai_messages").map((m) => (m.id === MSG_A ? { ...m, meta: { ...m.meta, claims: { [A]: "unknown" } } } : m))]);
  const { GET } = await import("../../app/api/ai-assistant/conversations/[id]/route");
  const res = await GET(new Request(`http://127.0.0.1/api/ai-assistant/conversations/${CONV}`) as any, { params: Promise.resolve({ id: CONV }) });
  const { messages } = await res.json();
  const states = messages.flatMap((m: any) => (m.meta?.proposals ?? []).map((p: any) => [p.id, storedCardState(m.meta?.claims, p.id)]));
  assert.deepEqual(Object.fromEntries(states), { [A]: "unknown", [B]: "approved" });
  assert.equal(storedCardState(undefined, A), "pending");
  assert.equal(storedCardState({ [A]: "claimed" }, A), "unknown", "an in-flight claim must not render approvable");
});
