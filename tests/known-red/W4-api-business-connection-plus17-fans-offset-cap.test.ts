// KNOWN RED (W4 api-business-connection-plus17 F11): app/api/v1/fans/route.ts:47 computes
// hasMore = full page && offset + rowCount < MAX_FAN_OFFSET (20000), and lib/api-public-query.ts:82 silently clamps any
// larger offset to 20000. At offset=19500&limit=1000 a full page answers hasMore:false, so a key paging a large fan
// list stops there; and a client that asks for offset=20500 anyway is served the 20000 page again under the wrong offset.
// Fixed looks like either: offset paging refused (400) in favour of keyset paging like /payments; or a full page says
// hasMore:true AND offset=20500 is honoured (the users query asks for offset 20500) or refused with a 400. Flipping
// hasMore alone while the clamp stays is NOT a fix: the next page would silently repeat rows.
// Team's Claude owns the fix. Not wired into npm scripts.
import assert from "node:assert/strict";
import test from "node:test";
import { anyOf, as, CLONE_A, isRest, modelKeyWire, table, withWire, type Responder } from "../rules/W4-api-business-connection-plus17-helpers";
import { GET } from "../../app/api/v1/fans/route";

const KEY = "TEST-FIXTURE-NOT-A-SECRET-public-key-fans"; // a marker, not a credential: no key format is validated
const KEY_ROW = { id: "key-fans", clone_id: CLONE_A, scope: "clone", label: "synthetic fans key" };
// 25,000 fans of clone A, already in the route's order (the fake applies filters, offset and limit, not order).
const FANS = Array.from({ length: 25_000 }, (_, n) => ({ clone_id: CLONE_A, telegram_id: 1_000_000 + n, name: `Fan ${n}`, stated_name: null,
  username: null, first_seen_at: null, last_message_received: null, total_messages_sent: 0, total_messages_purchased: 0, message_credits: 0,
  total_spent_stars: 25_000 - n, purchase_count: 0, spend_tier: null }));

// The users page plus the two cut reads publicFans makes for a clone key (lib/platform-cut.ts getCutPctForClone /
// getAgencyCreatorCutPct).
const database: Responder = c => {
  if (isRest(c, "users") && c.method === "GET") return table(FANS, c);
  if (isRest(c, "platform_cuts")) return table([{ clone_id: CLONE_A, agency_id: null, cut_pct: 0 }], c);
  if (isRest(c, "agency_creator_cuts")) return table([], c);
  return undefined;
};
async function fans(query: string) {
  return withWire(anyOf(modelKeyWire(KEY, KEY_ROW), database), async stub => {
    const res = await as(null, () => GET(new Request(`http://localhost/api/v1/fans?${query}`, { headers: { authorization: `Bearer ${KEY}` } })));
    const body = await res.json() as { ok?: boolean; rowCount?: number; hasMore?: boolean; offset?: number };
    return { status: res.status, body, usersOffset: stub.calls.find(c => isRest(c, "users"))?.url.searchParams.get("offset") ?? null };
  });
}

test("control: offset=0&limit=1000 with a full page of 1000 rows says hasMore:true", async () => {
  const r = await fans("offset=0&limit=1000");
  assert.equal(r.status, 200);
  assert.equal(r.body.rowCount, 1000);
  assert.equal(r.body.hasMore, true);
});

test("F11: a full page at offset=19500 says hasMore:true and the next page (offset=20500) is honoured or refused, never clamped", async () => {
  const page = await fans("offset=19500&limit=1000");
  if (page.status === 400) return; // offset paging refused outright (keyset fix)
  assert.equal(page.status, 200);
  assert.equal(page.body.rowCount, 1000, "precondition: a full page came back");
  assert.equal(page.body.hasMore, true, "a full page answered hasMore:false: a client paging by hasMore stops here");
  const next = await fans("offset=20500&limit=1000");
  assert.ok(next.status === 400 || next.usersOffset === "20500",
    `offset=20500 answered ${next.status} after asking the database for offset ${next.usersOffset}: the page is silently clamped`);
});
