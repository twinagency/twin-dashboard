// KNOWN RED (W4 api-business-connection-plus17 F14, severity polish): app/api/health/route.ts:38-43 answers a Supabase
// failure with HTTP 200 (body supabase.ok:false), and :53-63 answers 200 when a clone's Telegram getMe says ok:false, so a
// status-code monitor would stay green while the database or a bot is down.
// No monitor or page is known to call this route (only the lib/app-mode.ts:48 allowlist names it), and in production
// middleware redirects cookieless callers, so the impact is limited to an admin reading it by hand.
// Fixed looks like: a dependency failure answers a non-200 (e.g. 503), keeping the body for humans; or the route is
// deleted along with its allowlist entry, which this file also counts as fixed (loaded without a static import).
// Team's Claude owns the fix. Not wired into npm scripts.
import assert from "node:assert/strict";
import test from "node:test";
import { anyOf, as, BOT_TOKEN, CLONE_A, isRest, isTelegram, json, optionalModule, pgError, table, withWire, type Responder } from "../rules/W4-api-business-connection-plus17-helpers";

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
