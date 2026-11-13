// G19 regression guard (was KNOWN RED W4 api-business-connection-plus17 F14, severity polish; fixed in #392). Before the fix,
// app/api/health/route.ts answered HTTP 200 on a Supabase failure (body supabase.ok:false) and when a bot's getMe failed, so
// a status-code monitor stayed green while the database or a bot was down. Now: 503 on either, computed over active clones
// with a bot token only; paused and OnlyFans-only clones are listed in `skipped` so a retired token cannot hold it red.
// No monitor or page is known to call this route (only the lib/app-mode.ts allowlist names it). Deleting the route along
// with its allowlist entry also counts as fixed (loaded without a static import).
import assert from "node:assert/strict";
import test from "node:test";
import { anyOf, as, BOT_TOKEN, CLONE_A, isRest, isTelegram, json, optionalModule, pgError, table, withWire, type Responder } from "./G19-harness";

const route = optionalModule<{ GET?: () => Promise<Response> }>("app/api/health/route");
const CLONE = { id: CLONE_A, slug: "clone-a", name: "Clone A", bot_token: BOT_TOKEN, status: "active" };
const getMe: Responder = c => (isTelegram(c, "getMe") ? json({ ok: true, result: { id: 1, is_bot: true, username: "synthetic_bot" } }) : undefined);
const getMeRefused: Responder = c => (isTelegram(c, "getMe") ? json({ ok: false, error_code: 401, description: "Unauthorized" }, 401) : undefined);
const clonesOk: Responder = c => (isRest(c, "clones") ? table([CLONE], c) : undefined);

type Body = { supabase?: { ok: boolean }; clones?: { telegram: { ok: boolean } }[] };
async function health(GET: () => Promise<Response>, clones: Responder, telegram: Responder = getMe) {
  return withWire(anyOf(clones, telegram), async () => {
    const res = await as(null, () => GET());
    // A fix may answer plain text (e.g. a bare 503): parse JSON only when the route says it is JSON.
    const body = ((res.headers.get("content-type") ?? "").includes("json") ? await res.json() : {}) as Body;
    return { status: res.status, body };
  });
}

test("control: clones read OK and Telegram getMe OK answer 200 with supabase.ok and the clone's telegram ok", async t => {
  if (!route?.GET) return t.skip("route deleted: nothing left to control");
  const r = await health(route.GET, clonesOk);
  assert.equal(r.status, 200);
  assert.equal(r.body.supabase?.ok, true);
  assert.equal(r.body.clones?.length, 1);
  assert.equal(r.body.clones?.[0].telegram.ok, true);
});

test("F14: a failing clones read (PostgREST 500) does not answer HTTP 200", async () => {
  if (!route?.GET) return; // the route is gone: nothing can read it as healthy
  const r = await health(route.GET, c => (isRest(c, "clones") ? pgError(500) : undefined));
  assert.notEqual(r.status, 200, `Supabase down answered HTTP ${r.status} (body supabase.ok:${r.body.supabase?.ok}): a status-code monitor reads it as healthy`);
});

test("F14: clones read OK but a clone's Telegram getMe answering ok:false does not answer a 2xx", async () => {
  if (!route?.GET) return; // the route is gone: nothing can read it as healthy
  const r = await health(route.GET, clonesOk, getMeRefused);
  assert.ok(r.status < 200 || r.status > 299,
    `a refused bot answered HTTP ${r.status} (telegram.ok:${r.body.clones?.[0]?.telegram.ok}): a status-code monitor reads it as healthy`);
});

test("G19 R1 #1: paused clones (incl. OnlyFans-only, no token) are reported as skipped, not pinged, and do not turn the status red", async () => {
  if (!route?.GET) return; // the route is gone: nothing can read it as healthy
  // Statuses are "active" | "paused" (lib/types.ts:40); OnlyFans-only creators are created paused with bot_token ""
  // (lib/onlyfans/connection-creators.ts:89). A retired bot's token answers getMe 401.
  const PAUSED_DEAD = { id: "0f000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa", slug: "paused-dead", name: "Paused Dead", bot_token: "1:DEAD_FIXTURE", status: "paused" };
  const OF_ONLY = { id: "0f000002-aaaa-4aaa-8aaa-aaaaaaaaaaaa", slug: "of-only", name: "OF Only", bot_token: "", status: "paused" };
  const fleet: Responder = c => (isRest(c, "clones") ? table([CLONE, PAUSED_DEAD, OF_ONLY], c) : undefined);
  const telegram: Responder = c => (isTelegram(c, "getMe") ? (c.url.pathname.includes(BOT_TOKEN) ? getMe(c) : getMeRefused(c)) : undefined);
  const r = await withWire(anyOf(fleet, telegram), async stub => {
    const res = await as(null, () => route.GET!());
    assert.equal(stub.to("api.telegram.org").length, 1, "only the active clone with a token is pinged");
    return { status: res.status, body: await res.json() as Body & { skipped?: { slug: string; status: string }[] } };
  });
  assert.equal(r.status, 200, `a mixed fleet with every active bot healthy answered ${r.status}`);
  assert.deepEqual(r.body.clones?.map(c => (c as unknown as { slug: string }).slug), ["clone-a"]);
  assert.deepEqual(r.body.skipped?.map(s => s.slug).sort(), ["of-only", "paused-dead"]);
});

test("G19 R2 A: an active clone with no bot token is a broken bot and turns the status red without a ping", async () => {
  if (!route?.GET) return;
  const ACTIVE_NO_TOKEN = { id: "0f000003-aaaa-4aaa-8aaa-aaaaaaaaaaaa", slug: "no-token", name: "No Token", bot_token: "", status: "active" };
  for (const rows of [[CLONE, ACTIVE_NO_TOKEN], [ACTIVE_NO_TOKEN]]) {
    const fleet: Responder = c => (isRest(c, "clones") ? table(rows, c) : undefined);
    const telegram: Responder = c => (isTelegram(c, "getMe") ? (c.url.pathname.includes(BOT_TOKEN) ? getMe(c) : getMeRefused(c)) : undefined);
    const r = await withWire(anyOf(fleet, telegram), async stub => {
      const res = await as(null, () => route.GET!());
      assert.equal(stub.to("api.telegram.org").length, rows.length - 1, "a tokenless clone is never pinged");
      return { status: res.status, body: await res.json() as Body };
    });
    assert.equal(r.status, 503, `an active clone with no bot token answered ${r.status}: a status-code monitor reads it as healthy`);
    assert.ok(r.body.clones?.some(c => (c as unknown as { slug: string; telegram: { ok: boolean } }).slug === "no-token" && !(c as unknown as { telegram: { ok: boolean } }).telegram.ok));
  }
});
