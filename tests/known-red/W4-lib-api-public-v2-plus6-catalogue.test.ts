import "../support/admin-route-env";
/**
 * KNOWN RED (W4 lib-api-public-v2-plus6 F34, F36; docs/review/W4/lib-api-public-v2-plus6.md): the fan-facing catalogue
 * Mini App handler, lib/catalogue-api.ts createCatalogueHandler. Driven with a real NextRequest carrying Telegram
 * initData signed with a synthetic test bot token (same HMAC scheme as scripts/check-catalogue.ts), and deps.db() = a
 * real supabase-js client pointed at the fake PostgREST (tests/support/admin-wire.ts). No network: preview/content
 * deps are never reached; any non-fake host answers 404.
 * F34 (money): in chat checkout mode, "purchased" comes from a raw star_transactions query (amount > 0) that ignores
 *   refunds, unlike paidCatalogueItems (lib/catalogue-checkout.ts:20-29), which drops a receipt whose `refund:<id>` row
 *   exists. A refunded item keeps reading purchased:true. Control: the unrefunded purchase reads purchased:true.
 *   MODELLED: the refund row shape (id `refund:<receipt id>`, negative amount, payload "refund") follows
 *   lib/catalogue-checkout.ts and lib/star-dedupe.ts; how the bot writes it is not re-read here.
 * F36: the 21st checkout in a minute trips the handler's local rateLimit, which throws a plain Error; the catch-all
 *   maps it to 503 (in this repo: "unconfirmed, may retry", RISKS D7) instead of 429. Control: the first checkout
 *   reaches beginCatalogueCheckout (400 for an empty body).
 * The handler's rate-limit Map is module-level (lib/catalogue-api.ts:24) and keyed by fan, so every test uses its OWN
 * fan (FANS below): a whole-file run gives the same outcome per test as running each test alone.
 * Team's Claude owns the fix. Not wired into npm scripts on purpose.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { CLONE_ID, installWire, type Row } from "../support/admin-wire";
import { FAKE_SUPABASE } from "../support/admin-route-env";
import { createCatalogueHandler } from "../../lib/catalogue-api";

delete process.env.DASHBOARD_PUBLIC_ORIGIN;
const ORIGIN = "http://localhost:3107";
const SLUG = "fake-clone";
const BOT_TOKEN = "123456:test-only-token";
const ITEM_ID = "44444444-4444-4444-8444-444444444444";
type Fan = { id: string; tg: number };
/** One fan per test: the checkout rate limit (module-level Map, key `checkout:<fan id>`) must not leak between tests. */
const FANS = {
  owned: { id: "33333333-3333-4333-8333-333333333301", tg: 123401 },
  refunded: { id: "33333333-3333-4333-8333-333333333302", tg: 123402 },
  firstCheckout: { id: "33333333-3333-4333-8333-333333333303", tg: 123403 },
  rateLimited: { id: "33333333-3333-4333-8333-333333333304", tg: 123404 },
} satisfies Record<string, Fan>;

function signedInitData(fan: Fan): string {
  const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: fan.tg, first_name: "Test" }) });
  const secret = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  p.set("hash", createHmac("sha256", secret).update([...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n")).digest("hex"));
  return p.toString();
}

const receipt = (fan: Fan): Row => ({ id: "stx-1", clone_id: CLONE_ID, user_id: fan.id, telegram_id: fan.tg, kind: "media", media_type: "photo",
  media_id: ITEM_ID, amount_stars: 630, paid_at: new Date(Date.now() - 3_600_000).toISOString(), invoice_payload: "fake-payload-stx-1" });
const refund = (fan: Fan): Row => ({ ...receipt(fan), id: "refund:stx-1", amount_stars: -630, invoice_payload: "refund", paid_at: new Date().toISOString() });

function wire(fan: Fan, checkoutMode: "chat" | "invoice", stx: Row[]) {
  return installWire({ tables: {
    clones: [{ id: CLONE_ID, slug: SLUG, name: "Fake Clone", bot_token: BOT_TOKEN, browse_enabled: true, photos_enabled: true,
      videos_enabled: false, bundles_enabled: false, business_username: "fake_clone", status: "active" }],
    users: [{ id: fan.id, clone_id: CLONE_ID, telegram_id: fan.tg, blocked_at: null, paused: false, minor_flagged_at: null,
      business_connection_id: "fake-business", last_message_received: new Date().toISOString() }],
    creator_catalogue_settings: [{ clone_id: CLONE_ID, enabled: true, blur_strength: 16, checkout_mode: checkoutMode }],
    photos: [{ id: ITEM_ID, clone_id: CLONE_ID, caption: "A fake test photo", auto_desc: "", tags: null, teaser_caption: null,
      star_value: 630, is_free: false, created_at: new Date(Date.now() - 86_400_000).toISOString() }],
    videos: [], star_transactions: stx, user_received_media: [], catalogue_bundles: [], catalogue_loyalty_programs: [],
    catalogue_events: [], catalogue_checkout_orders: [],
  } });
}

const handler = createCatalogueHandler({
  db: () => createClient(FAKE_SUPABASE, "fake-anon-key", { auth: { persistSession: false, autoRefreshToken: false } }),
  admin: async () => false,
  preview: async () => { throw new Error("not reached"); },
  videoPreview: async () => { throw new Error("not reached"); },
  videoSources: async () => { throw new Error("not reached"); },
});

async function call(fan: Fan, action: string, body: Record<string, unknown> = {}) {
  const req = new NextRequest(`${ORIGIN}/api/catalogue/${SLUG}`, { method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", "x-telegram-init-data": signedInitData(fan) },
    body: JSON.stringify({ action, ...body }) });
  const res = await handler(req, { params: Promise.resolve({ slug: SLUG }) });
  return { status: res.status, body: await res.json() };
}

async function purchased(fan: Fan, stx: Row[]) {
  const w = wire(fan, "chat", stx);
  try {
    const r = await call(fan, "catalogue");
    assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
    const item = r.body.items.find((i: { id: string }) => i.id === ITEM_ID);
    assert.ok(item, "harness: the photo is in the catalogue");
    return item.purchased;
  } finally { w.restore(); }
}

test("control: chat mode, an unrefunded purchase reads purchased:true", async () => {
  assert.equal(await purchased(FANS.owned, [receipt(FANS.owned)]), true);
});

test("F34: chat mode, a refunded purchase reads purchased:false", async () => {
  const fan = FANS.refunded;
  assert.equal(await purchased(fan, [receipt(fan), refund(fan)]), false, "a refunded item still shows as bought");
});

test("control: invoice mode, the first checkout reaches the checkout code (400 on an empty body)", async () => {
  const fan = FANS.firstCheckout;
  const w = wire(fan, "invoice", []);
  try {
    const r = await call(fan, "checkout");
    assert.equal(r.status, 400, JSON.stringify(r.body));
  } finally { w.restore(); }
});

test("F36: the 21st checkout in a minute is rate limited with 429, not 503", async () => {
  const fan = FANS.rateLimited;
  const w = wire(fan, "invoice", []);
  try {
    for (let i = 0; i < 20; i++) assert.equal((await call(fan, "checkout")).status, 400, `harness: checkout ${i + 1} reaches checkout`);
    const r = await call(fan, "checkout");
    assert.equal(r.status, 429, `21st checkout answered ${r.status} ${JSON.stringify(r.body)}`);
  } finally { w.restore(); }
});
