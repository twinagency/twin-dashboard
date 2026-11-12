/**
 * KNOWN RED (W4 N1, docs/review/W4/api-ai-assistant-plus2.md): POST /api/ai-assistant/approve (approve/route.ts) and
 * the chat POST (route.ts) do no trustedFormOrigin check and parse the body as JSON whatever its Content-Type,
 * while app/api/business-account/route.ts:130 and app/api/compile/route.ts:16 refuse an untrusted Origin
 * (lib/form-origin.ts). A cross-origin `text/plain` POST is a CORS "simple request" (no preflight), so the body
 * reaches the handler and the write lands. Exposure is limited by the admin session cookie being sameSite=lax
 * (app/admin-auth/route.ts:31; a cross-SITE POST carries no cookie), so the live risk is same-site origins [inferred].
 * Control: approve with a trusted Origin (the request's own origin, http://127.0.0.1 here: NODE_ENV=test, no
 * DASHBOARD_PUBLIC_ORIGIN) + application/json → the write lands; same for the chat POST (stream starts).
 * Red: same body with `Origin: https://evil.example` and `Content-Type: text/plain` → a 4xx and no PATCH clones
 * (chat: a 4xx, no ai_messages write and no OpenRouter call).
 * Fix shapes accepted: an Origin check (403), a Content-Type check (415/400), or both; any 4xx passes.
 * TEST-CHANGE NEEDED IF the fix lives in middleware.ts instead of the handlers: this test calls the handlers
 * directly (middleware does not run), so it would stay red; move it to a middleware-level request then.
 * conversations/[id] DELETE also has no Origin check but is not tested here: a cross-origin DELETE is always
 * preflighted (not a simple request) and the route sends no CORS headers [inferred], so it is not reachable this way.
 * Run: env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test nice -n 10 node --import tsx --test tests/known-red/W4-api-ai-assistant-plus2-approve-origin.test.ts
 * DECLARED BYPASS: Next workAsyncStorage fake store (see harness header); PostgREST faked on 127.0.0.1; OpenRouter
 * faked at the fetch boundary (one text-only turn).
 */
import { CLONE, inWorkStore, readSse, request, startFakePostgrest, stubOpenRouter, type FakePostgrest } from "./W4-api-ai-assistant-plus2-harness";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

const CONV = "efefefef-efef-4fef-8fef-efefefefefef";
const MSG = "12121212-1212-4212-8212-121212121212";
const ARGS = { clone: CLONE.id, status: "paused" };
const APPROVAL = { conversationId: CONV, messageId: MSG, proposalId: "p1", id: "p1", tool: "setCloneStatus", args: ARGS };
const TRUSTED = { origin: "http://127.0.0.1", "content-type": "application/json" };
const CROSS = { origin: "https://evil.example", "content-type": "text/plain;charset=UTF-8" };

let pg: FakePostgrest;
before(async () => { pg = await startFakePostgrest(); });
after(async () => { await pg.close(); });
beforeEach(() => {
  pg.reset();
  pg.seed("clones", [{ ...CLONE, status: "active" }]);
  pg.seed("ai_conversations", [{ id: CONV, title: "t", created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" }]);
  pg.seed("ai_messages", [{
    id: MSG, conversation_id: CONV, role: "assistant", content: "Queued a pause.", created_at: "2026-11-01T00:00:00Z",
    meta: { proposals: [{ id: "p1", tool: "setCloneStatus", args: ARGS, summary: `PAUSE clone ${CLONE.id}.`, heavy: true }] },
  }]);
});

async function approve(headers: Record<string, string>) {
  const { POST } = await import("../../app/api/ai-assistant/approve/route");
  return inWorkStore(async () => {
    const res = await POST(request("/api/ai-assistant/approve", { headers, body: APPROVAL }));
    return { status: res.status, json: await res.json().catch(() => null) };
  });
}
async function chat(headers: Record<string, string>) {
  const or = stubOpenRouter([{ text: "Hello." }]);
  try {
    const { POST } = await import("../../app/api/ai-assistant/route");
    return await inWorkStore(async () => {
      const res = await POST(request("/api/ai-assistant", { headers, body: { conversationId: CONV, message: "hi" } }));
      const events = res.headers.get("content-type")?.includes("event-stream") ? await readSse(res) : [];
      return { status: res.status, events, upstream: or.requests.length };
    });
  } finally {
    or.restore();
  }
}

test("control: approve from the dashboard's own origin with JSON applies the write", async () => {
  const r = await approve(TRUSTED);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(pg.writes("PATCH", "clones").length, 1);
});

test("control: chat POST from the dashboard's own origin with JSON streams a reply", async () => {
  const r = await chat(TRUSTED);
  assert.equal(r.status, 200);
  assert.equal(r.upstream, 1);
  assert.ok(r.events.some((e) => e.type === "token"), JSON.stringify(r.events));
});

test("N1: a cross-origin text/plain approve is refused with a 4xx and writes nothing", async () => {
  const r = await approve(CROSS);
  assert.deepEqual(pg.writes("PATCH", "clones").map((c) => c.url), [], "cross-origin approve PATCHed clones");
  assert.ok(r.status >= 400 && r.status < 500, `expected a 4xx, got ${r.status} ${JSON.stringify(r.json)}`);
});

test("N1: a cross-origin text/plain chat POST is refused with a 4xx before any write or model call", async () => {
  const r = await chat(CROSS);
  assert.deepEqual(pg.calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.table}`), [], "cross-origin chat wrote");
  assert.equal(r.upstream, 0, "cross-origin chat reached OpenRouter (paid)");
  assert.ok(r.status >= 400 && r.status < 500, `expected a 4xx, got ${r.status}`);
});
