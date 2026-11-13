/**
 * Rule (G18 rwl R2, S6; not from the known-red corpus): when the model stream throws after the turn's first proposal
 * was stored, the chat route still saves the turn's final text onto that row (app/api/ai-assistant/route.ts finally).
 * Red on 39cfedec: the final save sat inside the try, so the row kept only the text from before the first proposal.
 * Run: env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test nice -n 10 node --import tsx --test tests/rules/G18-turn-error-persist.test.ts
 * DECLARED BYPASS: OpenRouter faked at the fetch boundary; its second reply body errors mid-stream.
 */
import { CLONE, inWorkStore, jsonRequest, readSse, startFakePostgrest, stubOpenRouter, type FakePostgrest } from "./G18-harness";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

const CONV = "a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7";
const ARGS = { clone: CLONE.id, status: "paused" };
let pg: FakePostgrest;
before(async () => { pg = await startFakePostgrest(); });
after(async () => { await pg.close(); });

test("S6: a stream error after the first proposal still saves the turn's final text on the stored row", async () => {
  pg.reset();
  pg.seed("clones", [{ ...CLONE, status: "active" }]);
  pg.seed("ai_conversations", [{ id: CONV, title: "t", created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" }]);
  const or = stubOpenRouter([{ toolCalls: [{ name: "setCloneStatus", args: ARGS }] }]);
  const stubbed = globalThis.fetch;
  // The second model reply streams one text delta, then its body errors: orChatWithToolsStream throws.
  globalThis.fetch = (async (input: any, init?: any) => {
    if (!String(input?.url ?? input).includes("openrouter.ai") || or.requests.length < 1) return stubbed(input, init);
    or.requests.push(JSON.parse(String(init?.body ?? "{}")));
    const enc = new TextEncoder();
    const body = new ReadableStream({
      start(c) {
        c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "Waiting on your tap." } }] })}\n\n`));
        setTimeout(() => c.error(new Error("upstream reset")), 10);
      },
    });
    return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
  }) as typeof fetch;
  try {
    const { POST } = await import("../../app/api/ai-assistant/route");
    const events = await inWorkStore(async () => readSse(await POST(jsonRequest("/api/ai-assistant", { conversationId: CONV, message: "pause it" }))));
    assert.ok(events.some((e) => e.type === "proposal"), JSON.stringify(events));
    assert.ok(events.some((e) => e.type === "error"), "fixture: the stream did not throw");
    const rows = pg.rows("ai_messages").filter((m) => m.role === "assistant");
    assert.equal(rows.length, 1, JSON.stringify(rows));
    assert.equal(rows[0].content, "Waiting on your tap.", "the turn's text after the first proposal was not saved");
    assert.equal(rows[0].meta.proposals?.length, 1, "the stored card was lost");
  } finally {
    globalThis.fetch = stubbed;
    or.restore();
  }
});
