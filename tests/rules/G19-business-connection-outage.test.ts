// G19 regression guard (was KNOWN RED W4 api-business-connection-plus17 F13; fixed in #392). Before the fix,
// app/api/business-connection/route.ts answered a Telegram 5xx, 429 or network failure exactly like Telegram's definitive
// "this connection is invalid" (400): HTTP 200 connected:false, so BusinessConnectionCard showed an outage as "Not connected".
// Now: a Telegram or database outage answers 502 {connected:false, unavailable:true}; a missing clone 404; HTTP 200
// connected:false only when Telegram says the connection is gone or no connection was ever observed.
import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { agency, anyOf, as, BOT_TOKEN, CLONE_A, CLONE_B, isRest, isTelegram, json, pgError, selects, table, withWire, type Responder } from "./G19-harness";
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
async function read(telegram: () => Response, db: Responder = database, telegramCalls = 1) {
  const telegramWire: Responder = c => (isTelegram(c, "getBusinessConnection") && c.method === "POST" ? telegram() : undefined);
  return withWire(anyOf(db, telegramWire), async stub => {
    const res = await as(null, () => GET(new NextRequest(`http://localhost/api/business-connection?cloneId=${CLONE_A}`)));
    const text = await res.text();
    assert.equal(stub.calls.filter(c => isTelegram(c, "getBusinessConnection")).length, telegramCalls, `precondition: Telegram asked exactly ${telegramCalls} time(s)`);
    // A fix may answer an outage as plain text (e.g. a bare 502): parse JSON only when the route says it is JSON.
    const body = (res.headers.get("content-type") ?? "").includes("json") ? JSON.parse(text) as { connected?: unknown; unavailable?: unknown } : {};
    return { status: res.status, text, body };
  });
}
const invalidConnection = () => json({ ok: false, error_code: 400, description: "Bad Request: business connection not found" }, 400);
type Answer = Awaited<ReturnType<typeof read>>;
function distinguishable(outage: Answer, definitive: Answer, what: string) {
  assert.equal(outage.status, 502, `${what} answered ${outage.status}`);
  assert.equal(outage.body.unavailable, true, `${what} body lacks unavailable:true`);
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

// G19 R1 #2: the database reads behind the Telegram call. An outage there must not read as "not connected" (200) or as a
// sign-in failure (dashboardReader's catch-all 403), and only a clone that is really missing answers 404.
const never = () => { throw new Error("Telegram must not be asked"); };
const unavailable = (r: Answer, what: string) => {
  assert.equal(r.status, 502, `${what} answered ${r.status} ${r.text.slice(0, 160)}`);
  assert.equal(r.body.connected, false);
  assert.equal(r.body.unavailable, true, `${what} body lacks unavailable:true`);
};
const routeClonesRead = (c: Parameters<Responder>[0]) => isRest(c, "clones") && c.method === "GET" && selects(c, "name");
const tokenRead = (c: Parameters<Responder>[0]) => isRest(c, "clones") && c.method === "GET" && !selects(c, "name");

test("G19 R1 #2: a failing clones read answers 502 unavailable, not 200 'Clone not found'", async () => {
  unavailable(await read(never, anyOf(c => (routeClonesRead(c) ? pgError(500) : undefined), database), 0), "clones read 500");
});

test("G19 R1 #2: a failing users read answers 502 unavailable, not 200 'no connection observed'", async () => {
  unavailable(await read(never, anyOf(c => (isRest(c, "users") ? pgError(500) : undefined), database), 0), "users read 500");
});

test("G19 R1 #2: a failing bot_token read (cloneBotToken throws) answers 502 unavailable, not a 403 sign-in failure", async () => {
  unavailable(await read(never, anyOf(c => (tokenRead(c) ? pgError(500) : undefined), database), 0), "bot_token read 500");
});

test("G19 R1 #2: a clone that does not exist answers 404", async () => {
  const r = await read(never, c => (isRest(c, "clones") && c.method === "GET" ? table([], c) : undefined), 0);
  assert.equal(r.status, 404, `missing clone answered ${r.status}`);
  assert.equal(r.body.connected, false);
});

test("control (true negative): no fan has carried a business_connection_id answers 200 connected:false", async () => {
  const r = await read(never, anyOf(c => (isRest(c, "users") ? table([], c) : undefined), database), 0);
  assert.equal(r.status, 200);
  assert.equal(r.body.connected, false);
  assert.equal(r.body.unavailable, undefined);
});

test("control: an agency not assigned the clone is refused 403 before any database or Telegram read", async () => {
  await withWire(anyOf(database, () => json({ ok: true, result: CONNECTION })), async stub => {
    const res = await as(agency([CLONE_B]), () => GET(new NextRequest(`http://localhost/api/business-connection?cloneId=${CLONE_A}`)));
    assert.equal(res.status, 403);
    assert.equal(stub.calls.length, 0, `denied caller reached: ${stub.calls.map(c => c.url.pathname).join(", ")}`);
  });
});
