// G19 (was KNOWN RED W4 api-business-connection-plus17 F13): app/api/business-connection/route.ts:92-94 answers a Telegram
// 5xx, 429 or network failure exactly like Telegram's definitive "this connection is invalid" (400): `connected:false`
// with HTTP 200. BusinessConnectionCard renders both as "Not connected", so a Telegram outage reads as "she disconnected".
// Fixed looks like: an outage answer differs from the definitive-negative answer in its HTTP status or its `connected`
// value (e.g. 502, or a connected state that is not false), so a client can tell the two apart.
import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { anyOf, as, BOT_TOKEN, CLONE_A, isRest, isTelegram, json, table, withWire, type Responder } from "./G19-harness";
import { GET } from "../../app/api/business-connection/route";

const BCID = "synthetic-business-connection-1";
const CONNECTION = { id: BCID, user: { id: 777, first_name: "Clone", last_name: "A", username: "clone_a" }, user_chat_id: 777,
  date: 1_760_000_000, rights: { can_reply: true }, is_enabled: true };

// The database as internal admin: one clone row (answers both the route's clones read and cloneBotToken's bot_token read,
// whatever columns each selects) and one fan carrying the business_connection_id.
const database: Responder = c => {
  if (isRest(c, "clones") && c.method === "GET") return table([{ id: CLONE_A, name: "Clone A", slug: "clone-a", bot_token: BOT_TOKEN }], c);
  if (isRest(c, "users") && c.method === "GET") return table([{ clone_id: CLONE_A, business_connection_id: BCID, last_message_received: "2026-11-01T00:00:00Z" }], c);
  return undefined;
};
async function read(telegram: () => Response) {
  const telegramWire: Responder = c => (isTelegram(c, "getBusinessConnection") && c.method === "POST" ? telegram() : undefined);
  return withWire(anyOf(database, telegramWire), async stub => {
    const res = await as(null, () => GET(new NextRequest(`http://localhost/api/business-connection?cloneId=${CLONE_A}`)));
    const text = await res.text();
    assert.equal(stub.calls.filter(c => isTelegram(c, "getBusinessConnection")).length, 1, "precondition: Telegram asked exactly once");
    // A fix may answer an outage as plain text (e.g. a bare 502): parse JSON only when the route says it is JSON.
    const body = (res.headers.get("content-type") ?? "").includes("json") ? JSON.parse(text) as { connected?: unknown } : {};
    return { status: res.status, text, body };
  });
}
const invalidConnection = () => json({ ok: false, error_code: 400, description: "Bad Request: business connection not found" }, 400);
type Answer = Awaited<ReturnType<typeof read>>;
function distinguishable(outage: Answer, definitive: Answer, what: string) {
  assert.ok(outage.status !== definitive.status || outage.body.connected !== definitive.body.connected,
    `${what} answered ${outage.status} ${JSON.stringify(outage.body).slice(0, 160)}; Telegram's definitive "not found" answered ` +
    `${definitive.status} connected:${String(definitive.body.connected)}: indistinguishable`);
}

test("control: Telegram reports the connection, the route answers connected:true and never echoes the bot token", async () => {
  const r = await read(() => json({ ok: true, result: CONNECTION }));
  assert.equal(r.status, 200);
  assert.equal(r.body.connected, true);
  assert.ok(!r.text.includes(BOT_TOKEN), "bot token leaked into the response body");
});

test("control (true negative): Telegram 400 'business connection not found' answers 200 connected:false", async () => {
  // Status pinned too: the reds compare against this answer, so a "fix" that only moves the definitive answer off 200
  // (leaving outages at 200 connected:false) would make them pass while outages still read as "not connected".
  const r = await read(invalidConnection);
  assert.equal(r.status, 200);
  assert.equal(r.body.connected, false);
  assert.ok(!r.text.includes(BOT_TOKEN), "bot token leaked into the response body");
});

test("F13: a Telegram 502 is distinguishable from a definitive 'not connected'", async () => {
  distinguishable(await read(() => json({ ok: false, error_code: 502, description: "Bad Gateway" }, 502)), await read(invalidConnection), "Telegram 502");
});

test("F13: a Telegram 429 is distinguishable from a definitive 'not connected'", async () => {
  const outage = await read(() => json({ ok: false, error_code: 429, description: "Too Many Requests: retry after 5", parameters: { retry_after: 5 } }, 429));
  distinguishable(outage, await read(invalidConnection), "Telegram 429");
});

test("F13: a network failure reaching Telegram is distinguishable from a definitive 'not connected'", async () => {
  distinguishable(await read(() => { throw new TypeError("fetch failed"); }), await read(invalidConnection), "network failure");
});
