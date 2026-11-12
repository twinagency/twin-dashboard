/**
 * KNOWN RED (W4 F7, docs/review/W4/api-ai-assistant-plus2.md): app/api/ai-assistant/route.ts:240-247 persists the
 * assistant turn (and its meta.proposals) only `if (assistantText.trim())`. A model that calls a write tool and
 * then writes no text gets an approval card streamed to the browser that is gone after reload, the exact case
 * db.ts:13-16 says persistence prevents.
 * Control: the SSE stream carries one `proposal` event, and a reload through the real GET
 * /api/ai-assistant/conversations/[id] route returns the persisted user turn (the store keeps what was POSTed).
 * Red: the proposal was persisted somewhere. Fix shapes accepted: ANY POST/PATCH to ANY table whose body holds the
 * tool name and its args (setCloneStatus, the clone id, "paused"), OR the reload through the real conversation
 * route shows it. Persisting in `finally`, a separate proposals table, or a text-less assistant row all pass.
 * Run: env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test nice -n 10 node --import tsx --test tests/known-red/W4-api-ai-assistant-plus2-no-text-proposal.test.ts
 * DECLARED BYPASS: Next workAsyncStorage fake store (see harness header); PostgREST faked on 127.0.0.1;
 * OpenRouter faked at the fetch boundary (scripted SSE: one setCloneStatus tool call, then an empty "stop" turn).
 */
import { CLONE, inWorkStore, jsonRequest, readSse, startFakePostgrest, stubOpenRouter, type FakePostgrest } from "./W4-api-ai-assistant-plus2-harness";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

const CONV = "77777777-7777-4777-8777-777777777777";
let pg: FakePostgrest;
let events: any[] = [];
before(async () => { pg = await startFakePostgrest(); });
after(async () => { await pg.close(); });
beforeEach(async () => {
  pg.reset();
  const or = stubOpenRouter([{ toolCalls: [{ name: "setCloneStatus", args: { clone: CLONE.id, status: "paused" } }] }, { text: "" }]);
  try {
    const { POST } = await import("../../app/api/ai-assistant/route");
    events = await inWorkStore(async () => readSse(await POST(jsonRequest("/api/ai-assistant", { conversationId: CONV, message: "pause the test clone" }))));
  } finally {
    or.restore();
  }
});

test("control: the stream carries exactly one proposal event for the write tool call", () => {
  const proposals = events.filter((e) => e.type === "proposal");
  assert.equal(proposals.length, 1, JSON.stringify(events));
  assert.equal(proposals[0].tool, "setCloneStatus");
  assert.equal(pg.writes("PATCH", "clones").length, 0);
  // persistence itself works in this harness: the user turn reached ai_messages
  assert.equal(pg.writes("POST", "ai_messages").filter((c) => c.body?.role === "user").length, 1);
});

async function reload(): Promise<string> {
  const { GET } = await import("../../app/api/ai-assistant/conversations/[id]/route");
  const res = await GET(new Request(`http://127.0.0.1/api/ai-assistant/conversations/${CONV}`) as any, { params: Promise.resolve({ id: CONV }) });
  assert.equal(res.status, 200);
  return JSON.stringify(await res.json());
}
const holdsProposal = (s: string) => s.includes("setCloneStatus") && s.includes(CLONE.id) && s.includes("paused");

test("control: a reload through the conversation route returns the persisted user turn", async () => {
  assert.ok((await reload()).includes("pause the test clone"));
});

test("F7: a proposal with no assistant text is still persisted (any table, or visible on reload)", async () => {
  const persisted = pg.calls.filter((c) => (c.method === "POST" || c.method === "PATCH") && holdsProposal(c.rawBody));
  const onReload = await reload();
  assert.ok(persisted.length > 0 || holdsProposal(onReload), `no write carried the proposal; reload: ${onReload}`);
});
