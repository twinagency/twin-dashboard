import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCatalogueHandler } from '../lib/catalogue-api';
import { beginTonCheckout, effectiveNanotonPerStar, reconcilePendingTonOrders, resetTonUsdPriceCacheForTests, resetTonWalletCacheForTests, starsToNanoton, tonDiscountPercent, tonOrderStatus, tonEnabled, tonUsdPrice, type TonIncomingTx } from '../lib/catalogue-ton';
import { formatTonAmount, tonPriceNanoton, TON_PRICE_STEP_NANOTON } from '../lib/catalogue-ton-price';
import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const clone = { id: id(1), slug: 'fixture', name: 'Creator', bot_token: '1234:fixture', status: 'active', browse_enabled: true, photos_enabled: true, videos_enabled: true, bundles_enabled: true };
const fan = { id: id(2), clone_id: clone.id, telegram_id: 42, business_connection_id: 'creator-business', paused: false, blocked_at: null, minor_flagged_at: null };
const RATE = 2_000_000; // nanoton per star, i.e. 0.002 TON/star

let rows: Record<string, any[]>;
function reset() {
  rows = {
    clones: [clone], users: [fan],
    creator_catalogue_settings: [{ clone_id: clone.id, enabled: true, checkout_mode: 'invoice', ton_wallet_address: 'EQtest-wallet-address', ton_nanoton_per_star: RATE }],
    photos: [{ id: id(10), clone_id: clone.id, caption: 'Photo', star_value: 350, is_free: false, storage_path: 'private/0.jpg' }],
    videos: [{ id: id(11), clone_id: clone.id, caption: 'Video 1', star_value: 400, is_free: false, storage_path: 'private/0.mp4' },
      { id: id(12), clone_id: clone.id, caption: 'Video 2', star_value: 400, is_free: false, storage_path: 'private/1.mp4' }],
    catalogue_bundles: [{ id: id(13), clone_id: clone.id, title: 'Two clips', enabled: true, media_kind: 'video', photo_ids: [], video_ids: [id(11), id(12)], price_stars: 400, regular_stars: 800 }],
    catalogue_checkout_orders: [], catalogue_checkout_deliveries: [], catalogue_ton_orders: [],
    star_transactions: [], user_received_media: [],
  };
}

function makeDb() {
  function builder(table: string) {
    const filters: ((r: any) => boolean)[] = [];
    let single = false, selection = '*', change: any, insert = false;
    const q: any = {
      select(s = '*') { selection = s; return q; },
      eq(k: string, v: any) { filters.push(r => r[k] === v); return q; },
      in(k: string, v: any[]) { filters.push(r => v.includes(r[k])); return q; },
      gt(k: string, v: any) { filters.push(r => r[k] > v); return q; },
      not(k: string, _op: string, v: any) { filters.push(r => r[k] !== v); return q; },
      order() { return q; }, limit() { return q; },
      maybeSingle() { single = true; return q; }, single() { single = true; return q; },
      insert(v: any) { change = v; insert = true; return q; },
      update(v: any) { change = v; return q; },
      then(resolve: any, reject: any) {
        try {
          if (insert) {
            const row = { id: id(900 + rows[table].length), status: 'pending', ...change };
            rows[table].push(row);
            filters.push(r => r === row);
          } else if (change) {
            rows[table].filter(r => filters.every(f => f(r))).forEach(r => Object.assign(r, change));
          }
          const data = (rows[table] ?? []).filter(r => filters.every(f => f(r)))
            .map(r => selection === '*' ? { ...r } : Object.fromEntries(selection.split(',').map(k => [k, r[k]])));
          resolve({ data: single ? (data[0] ?? null) : data, error: null });
        } catch (e) { reject(e); }
      },
    };
    return q;
  }
  return {
    from: builder,
    async rpc(name: string, args: any) {
      if (name === 'catalogue_owned_checkout_assets') {
        // The real function this mirrors: unchanged by this migration (see its header).
        const assets = rows.catalogue_checkout_orders.filter(o => o.user_id === args.p_user && o.status === 'paid'
          && rows.star_transactions.some(t => t.id === o.charge_id && t.invoice_payload === `catalogue_order_${o.id}`)
          && !rows.star_transactions.some(t => t.id === `refund:${o.charge_id}`))
          .flatMap(o => args.p_type === 'bundle' ? [] : o.media_type === 'bundle' ? (args.p_type === 'photo' ? o.photo_ids : args.p_type === 'video' ? (o.video_ids ?? []) : []) : o.media_type === args.p_type ? [o.media_id] : []);
        return { data: assets, error: null };
      }
      assert.equal(name, 'confirm_catalogue_ton_order', 'only these RPCs should be used by the TON path');
      const order = rows.catalogue_ton_orders.find(r => r.id === args.p_order);
      if (!order) return { data: null, error: { message: 'not found' } };
      if (order.status === 'confirmed' || order.status === 'delivered') return { data: order.status, error: null };
      if (order.status === 'expired' || Date.parse(order.expires_at) <= Date.now()) {
        order.status = 'expired';
        return { data: 'expired', error: null };
      }
      const charge = 'ton:' + args.p_tx_hash;
      const payload = 'catalogue_order_' + order.id;
      const alreadySettled = rows.star_transactions.some(t => t.id === charge);
      order.status = 'confirmed'; order.tx_hash = args.p_tx_hash; order.buyer_wallet = args.p_buyer;
      order.confirmed_at = order.confirmed_at ?? new Date().toISOString();
      if (alreadySettled) return { data: 'confirmed', error: null };
      if (!rows.catalogue_checkout_orders.some(r => r.id === order.id)) {
        rows.catalogue_checkout_orders.push({
          id: order.id, clone_id: order.clone_id, user_id: order.user_id, telegram_id: order.telegram_id,
          business_connection_id: order.business_connection_id, media_type: order.media_type, media_id: order.media_id,
          amount_stars: order.amount_stars, photo_ids: order.photo_ids, video_ids: order.video_ids, status: 'paid',
          invoice_url: 'ton:' + order.memo, expires_at: new Date().toISOString(), charge_id: charge, paid_at: new Date().toISOString(),
        });
      }
      if (!rows.star_transactions.some(t => t.id === charge)) {
        rows.star_transactions.push({
          id: charge, clone_id: order.clone_id, user_id: order.user_id, telegram_id: order.telegram_id,
          kind: 'media', amount_stars: order.amount_stars, media_type: order.media_type, media_id: order.media_id,
          invoice_payload: payload, imported_from: 'ton', paid_at: new Date().toISOString(),
        });
      }
      if (!rows.catalogue_checkout_deliveries.some(d => d.order_id === order.id)) {
        rows.catalogue_checkout_deliveries.push({ order_id: order.id, status: 'pending' });
      }
      return { data: 'confirmed', error: null };
    },
  };
}

function tx(overrides: Partial<TonIncomingTx>): TonIncomingTx {
  return { hash: 'hash-a', comment: null, valueNanoton: BigInt(0), source: 'buyer-wallet', ...overrides };
}

async function main() {
  const db = makeDb();
  const context = { db, clone, fan } as any;

  // 1. TON disabled clone rejects ton_checkout.
  reset();
  resetTonWalletCacheForTests();
  rows.creator_catalogue_settings[0].ton_wallet_address = null;
  assert.equal(tonEnabled(rows.creator_catalogue_settings[0]), false);
  await assert.rejects(() => beginTonCheckout(context, { type: 'photo', id: id(10) }, rows.creator_catalogue_settings[0]), /not available/);

  // Begin real orders for the remaining tests. Each check uses its own order so the
  // per-order 3s verification throttle never masks a different test's assertion.
  reset();
  const settings = rows.creator_catalogue_settings[0];
  assert.equal(tonEnabled(settings), true);
  const begin = await beginTonCheckout(context, { type: 'photo', id: id(10) }, settings);
  assert.equal(begin.toAddress, settings.ton_wallet_address);
  assert.equal(begin.amountNanoton, 700_000_000, '350 stars at 0.002 TON/star is exactly 0.7 TON, unchanged by rounding');
  assert.equal(begin.comment, begin.memo);
  assert.match(begin.memo, /^cc_[a-z2-7]{12}$/);
  const order = rows.catalogue_ton_orders.find(r => r.id === begin.orderId);
  assert.ok(order, 'order row created');

  // 2. Wrong memo does not confirm.
  {
    resetTonWalletCacheForTests(); // each of 2/3/4 supplies its own fake tx list for the same wallet
    const wrongMemoOrder = await beginTonCheckout(context, { type: 'photo', id: id(10) }, settings);
    const noMatch = await tonOrderStatus(context, wrongMemoOrder.orderId, async () => [tx({ comment: 'not-the-memo', valueNanoton: BigInt(wrongMemoOrder.amountNanoton) })]);
    assert.equal(noMatch.status, 'pending', 'wrong memo must not confirm');
  }

  // 3. Underpayment does not confirm.
  {
    resetTonWalletCacheForTests();
    const underpaidOrder = await beginTonCheckout(context, { type: 'photo', id: id(10) }, settings);
    const short = await tonOrderStatus(context, underpaidOrder.orderId, async () => [tx({ comment: underpaidOrder.memo, valueNanoton: BigInt(underpaidOrder.amountNanoton - 1) })]);
    assert.equal(short.status, 'pending', 'underpayment must not confirm');
  }
  assert.equal(rows.catalogue_checkout_orders.length, 0, 'no ownership granted yet');

  // 4. Memo match confirms and wires ownership + delivery.
  {
    resetTonWalletCacheForTests();
    const matched = await tonOrderStatus(context, begin.orderId, async (address) => {
      assert.equal(address, settings.ton_wallet_address);
      return [tx({ hash: 'hash-real', comment: begin.memo, valueNanoton: BigInt(begin.amountNanoton) })];
    });
    assert.equal(matched.status, 'confirmed');
  }
  const paidOrder = rows.catalogue_checkout_orders.find(r => r.id === begin.orderId);
  assert.ok(paidOrder, 'catalogue_checkout_orders row created on confirm');
  assert.equal(paidOrder.status, 'paid');
  assert.equal(paidOrder.charge_id, 'ton:hash-real');
  const receipt = rows.star_transactions.find(t => t.id === 'ton:hash-real');
  assert.ok(receipt, 'star_transactions receipt created');
  assert.equal(receipt.imported_from, 'ton');
  assert.equal(receipt.invoice_payload, `catalogue_order_${begin.orderId}`);
  assert.equal(receipt.amount_stars, 350);
  assert.ok(rows.catalogue_checkout_deliveries.some(d => d.order_id === begin.orderId), 'delivery queued exactly like the Stars path');

  // 5. Same tx twice is idempotent: confirming again with the same tx_hash changes nothing further.
  await new Promise(r => setTimeout(r, 3100));
  {
    const again = await tonOrderStatus(context, begin.orderId, async () => [tx({ hash: 'hash-real', comment: begin.memo, valueNanoton: BigInt(begin.amountNanoton) })]);
    assert.equal(again.status, 'confirmed');
  }
  assert.equal(rows.star_transactions.filter(t => t.id === 'ton:hash-real').length, 1, 'no duplicate receipt');
  assert.equal(rows.catalogue_checkout_orders.filter(r => r.id === begin.orderId).length, 1, 'no duplicate checkout order');
  assert.equal(rows.catalogue_checkout_deliveries.filter(d => d.order_id === begin.orderId).length, 1, 'no duplicate delivery row');

  // 6. Expired order never confirms, and never even calls the verifier.
  reset();
  const expiredBegin = await beginTonCheckout(context, { type: 'photo', id: id(10) }, settings);
  const expiredOrder = rows.catalogue_ton_orders.find(r => r.id === expiredBegin.orderId);
  expiredOrder.expires_at = new Date(Date.now() - 1000).toISOString();
  let verifierCalled = false;
  const expired = await tonOrderStatus(context, expiredBegin.orderId, async () => { verifierCalled = true; return [tx({ comment: expiredBegin.memo, valueNanoton: BigInt(expiredBegin.amountNanoton) })]; });
  assert.equal(expired.status, 'expired');
  assert.equal(verifierCalled, false, 'an expired order must never be checked on chain');
  const stillExpired = await tonOrderStatus(context, expiredBegin.orderId, async () => { verifierCalled = true; return []; });
  assert.equal(stillExpired.status, 'expired', 'expired stays expired');
  assert.equal(verifierCalled, false);

  // 7. Client-supplied "confirmed" is ignored end to end through the HTTP handler:
  // the action only ever accepts an orderId, and confirmation happens only from a
  // server side, mocked (never live) toncenter lookup that finds nothing.
  reset();
  resetTonWalletCacheForTests();
  const globalFetch = global.fetch;
  try {
    (global as any).fetch = async () => ({ ok: true, json: async () => ({ transactions: [] }) });
    const httpBegin = await beginTonCheckout(context, { type: 'photo', id: id(10) }, settings);
    const handler = createCatalogueHandler({
      db: () => db as any, admin: async () => false,
      preview: async () => Buffer.from(''), videoPreview: async () => Buffer.from(''),
      videoSources: async () => ({ url: '', posterUrl: '', seconds: 0 }),
    });
    const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 42 }) });
    const secret = createHmac('sha256', 'WebAppData').update(clone.bot_token).digest();
    p.set('hash', createHmac('sha256', secret).update([...p].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n')).digest('hex'));
    const response = await handler(new NextRequest('http://localhost:3001/api/catalogue/fixture', {
      method: 'POST', headers: { origin: 'http://localhost:3001', 'content-type': 'application/json', 'x-telegram-init-data': p.toString() },
      body: JSON.stringify({ action: 'ton_status', orderId: httpBegin.orderId, status: 'confirmed', tx_hash: 'hash-fake', preview: false }),
    }), { params: Promise.resolve({ slug: 'fixture' }) });
    const body = await response.json();
    assert.equal(body.status, 'pending', 'a client-asserted status/tx_hash must never confirm an order');
  } finally { (global as any).fetch = globalFetch; }

  // 8. A fan who paid but never came back to poll: the catalogue load reconciles their
  // pending orders from one chain lookup, confirming only the memo+amount match.
  reset();
  resetTonWalletCacheForTests();
  const left = await beginTonCheckout(context, { type: 'photo', id: id(10) }, settings);
  const other = await beginTonCheckout(context, { type: 'photo', id: id(10) }, settings);
  const settled = await reconcilePendingTonOrders(context, async () => [
    tx({ hash: 'hash-left', comment: left.memo, valueNanoton: BigInt(left.amountNanoton) }),
    tx({ hash: 'hash-other', comment: 'unrelated', valueNanoton: BigInt(other.amountNanoton) }),
  ]);
  assert.equal(settled, 1, 'exactly the matching pending order is confirmed on reconcile');
  assert.equal(rows.catalogue_ton_orders.find(r => r.id === left.orderId).status, 'confirmed');
  assert.equal(rows.catalogue_ton_orders.find(r => r.id === other.orderId).status, 'pending', 'no memo match stays pending');

  // 8b. Video bundle: TON checkout snapshots video_ids not photo_ids, and confirming
  // on chain copies video_ids into catalogue_checkout_orders (mirrors confirm_catalogue_ton_order).
  reset();
  resetTonWalletCacheForTests();
  const videoBundleBegin = await beginTonCheckout(context, { type: 'bundle', id: id(13) }, settings);
  assert.equal(videoBundleBegin.amountNanoton, 800_000_000, '400 stars at 0.002 TON/star is 0.8 TON');
  const videoBundleOrder = rows.catalogue_ton_orders.find(r => r.id === videoBundleBegin.orderId);
  assert.deepEqual(videoBundleOrder.photo_ids, [], 'a video bundle TON order never carries photo ids');
  assert.deepEqual(videoBundleOrder.video_ids, [id(11), id(12)], 'video bundle TON order snapshots video_ids');
  // Reused mock order ids across reset() calls can inherit another scenario's
  // recent per-order verify timestamp; wait out the throttle like section 5 does.
  await new Promise(r => setTimeout(r, 3100));
  const videoBundleConfirmed = await tonOrderStatus(context, videoBundleBegin.orderId, async () =>
    [tx({ hash: 'hash-video-bundle', comment: videoBundleBegin.memo, valueNanoton: BigInt(videoBundleBegin.amountNanoton) })]);
  assert.equal(videoBundleConfirmed.status, 'confirmed');
  const videoBundleCheckoutOrder = rows.catalogue_checkout_orders.find(r => r.id === videoBundleBegin.orderId);
  assert.deepEqual(videoBundleCheckoutOrder.video_ids, [id(11), id(12)], 'confirm_catalogue_ton_order copies video_ids into catalogue_checkout_orders');
  assert.deepEqual(videoBundleCheckoutOrder.photo_ids, []);

  // 9. TON discount: the server computes the discounted price; junk percentages are ignored.
  assert.equal(starsToNanoton(350, 12_000_000, 50), 2_100_000_000, '50% off halves the TON price');
  assert.equal(starsToNanoton(350, 12_000_000), 4_200_000_000, 'no discount by default');
  assert.equal(tonDiscountPercent({ ton_discount_percent: 50 }), 50);
  assert.equal(tonDiscountPercent({ ton_discount_percent: 150 }), 0, 'out of range discount is ignored');
  assert.equal(tonDiscountPercent({ ton_discount_percent: null }), 0);
  reset();
  const discounted = await beginTonCheckout(context, { type: 'photo', id: id(10) }, { ...settings, ton_discount_percent: 50 });
  const full = await beginTonCheckout(context, { type: 'photo', id: id(10) }, settings);
  assert.equal(discounted.amountNanoton, 400_000_000, 'checkout charges the discounted, rounded TON price (0.35 -> 0.4 TON)');
  assert.equal(full.amountNanoton, 700_000_000, 'full price 0.7 TON is already a whole step');

  // 10. Rounding: always UP to the next 0.1 TON, minimum 0.1 TON, exact multiples unchanged.
  assert.equal(starsToNanoton(350, 12_121_212, 50), 2_200_000_000, '2.1212 TON rounds up to 2.2 TON');
  assert.equal(starsToNanoton(1, 12_121_212, 50), 100_000_000, '1 star is the 0.1 TON minimum');
  assert.equal(starsToNanoton(1, 1), 100_000_000, 'a tiny price is still at least 0.1 TON');
  assert.equal(starsToNanoton(250, 12_000_000), 3_000_000_000, 'an exact multiple is unchanged');
  assert.equal(starsToNanoton(100, 1_000_000), 100_000_000, 'exactly 0.1 TON is unchanged');
  assert.equal(starsToNanoton(100, 1_000_001), 200_000_000, 'one nanoton over a step rounds up');
  assert.equal(starsToNanoton(350, '12121212', 50), 2_200_000_000, 'numeric string rate from Postgres works');
  assert.throws(() => starsToNanoton(0, 12_000_000), /invalid/, 'zero stars never produces a price');
  assert.throws(() => starsToNanoton(350, 0), /invalid/);
  assert.equal(formatTonAmount(2_200_000_000), '2.2');
  assert.equal(formatTonAmount(3_000_000_000), '3', 'no trailing .0');
  assert.equal(formatTonAmount(100_000_000), '0.1');
  assert.equal(formatTonAmount(12_500_000_000), '12.5');

  // 11. The client label helper and the server charge agree across a sweep of prices.
  for (const rate of [1, 1_000_000, 2_000_000, 12_000_000, 12_121_212, 33_333_333])
    for (const pct of [0, 10, 33, 50, 90])
      for (const stars of [1, 7, 50, 99, 350, 1_234, 2_500]) {
        const charged = starsToNanoton(stars, rate, pct);
        assert.equal(tonPriceNanoton(stars, rate, pct), charged, `label and charge agree at ${stars}★ ${rate}/★ ${pct}%`);
        assert.equal(charged % TON_PRICE_STEP_NANOTON, 0, 'every charge is a whole 0.1 TON step');
        assert.ok(charged >= stars * rate * (100 - pct) / 100, 'rounding never undercharges');
        assert.ok(charged - stars * rate * (100 - pct) / 100 < TON_PRICE_STEP_NANOTON || charged === TON_PRICE_STEP_NANOTON, 'rounding adds less than one step');
        assert.equal(Number(formatTonAmount(charged)) * 1_000_000_000, charged, 'the label shows exactly the charged amount');
      }
  const clientSource = readFileSync(new URL('../app/catalogue/[slug]/Catalogue.tsx', import.meta.url), 'utf8');
  assert.match(clientSource, /from '@\/lib\/catalogue-ton-price'/, 'the Mini App label uses the shared price helper');
  assert.doesNotMatch(clientSource, /1_000_000_000/, 'the Mini App does not compute its own TON price');

  // 12. Live TON/USD rate: ton_star_usd converts through the live rate, cache is
  // honoured within the window, a fetch failure and an absurd price both fall
  // back to the stored ton_nanoton_per_star, and the display and charge paths
  // agree because they call the exact same function.
  {
    resetTonUsdPriceCacheForTests();
    const settingsWithUsd = { ton_wallet_address: 'EQtest-wallet-address', ton_nanoton_per_star: 12_121_212, ton_star_usd: 0.02 };

    // $2.00/TON: 0.02 / 2.00 = 0.01 TON/star = 10_000_000 nanoton/star.
    let fetchCalls = 0;
    const fetcher = async () => { fetchCalls++; return 2.0; };
    const live1 = await effectiveNanotonPerStar(settingsWithUsd, fetcher);
    assert.equal(live1, 10_000_000, 'ton_star_usd converts through the live TON/USD rate');
    assert.equal(fetchCalls, 1);

    // Cache honoured: a second call within the 10-minute window does not fetch again,
    // even though the fetcher would now return a different price.
    const live2 = await effectiveNanotonPerStar(settingsWithUsd, async () => { fetchCalls++; return 4.0; });
    assert.equal(live2, 10_000_000, 'the cached TON/USD price is reused, not refetched');
    assert.equal(fetchCalls, 1, 'a second lookup inside the cache window must not call the fetcher again');

    // Fetch failure falls back to the stored fixed rate.
    resetTonUsdPriceCacheForTests();
    const failFallback = await effectiveNanotonPerStar(settingsWithUsd, async () => { throw new Error('network down'); });
    assert.equal(failFallback, 12_121_212, 'a fetch failure falls back to the stored ton_nanoton_per_star');

    // An absurd price (outside 0.2..50 USD) is rejected, same fallback.
    resetTonUsdPriceCacheForTests();
    const absurdLow = await effectiveNanotonPerStar(settingsWithUsd, async () => 0.001);
    assert.equal(absurdLow, 12_121_212, 'a price below $0.20 is rejected in favour of the stored rate');
    resetTonUsdPriceCacheForTests();
    const absurdHigh = await effectiveNanotonPerStar(settingsWithUsd, async () => 9_999);
    assert.equal(absurdHigh, 12_121_212, 'a price above $50 is rejected in favour of the stored rate');
    resetTonUsdPriceCacheForTests();
    assert.equal(await tonUsdPrice(async () => 1.65), 1.65, 'a sane price in range is accepted');

    // No ton_star_usd at all: the stored fixed rate is used directly, no fetch happens.
    resetTonUsdPriceCacheForTests();
    let noUsdFetchCalls = 0;
    const noUsd = await effectiveNanotonPerStar({ ton_wallet_address: 'EQtest-wallet-address', ton_nanoton_per_star: 12_121_212 }, async () => { noUsdFetchCalls++; return 2.0; });
    assert.equal(noUsd, 12_121_212, 'without ton_star_usd the stored rate is used unchanged');
    assert.equal(noUsdFetchCalls, 0, 'no live lookup happens when ton_star_usd is not set');

    // Display and charge agree: the catalogue payload's tonNanotonPerStar and
    // beginTonCheckout's charged amount are computed by the exact same call.
    resetTonUsdPriceCacheForTests();
    reset();
    resetTonWalletCacheForTests();
    rows.creator_catalogue_settings[0].ton_star_usd = 0.02;
    const globalFetchForRate = global.fetch;
    try {
      (global as any).fetch = async () => ({ ok: true, json: async () => ({ 'the-open-network': { usd: 2.0 } }) });
      const handler = createCatalogueHandler({
        db: () => db as any, admin: async () => false,
        preview: async () => Buffer.from(''), videoPreview: async () => Buffer.from(''),
        videoSources: async () => ({ url: '', posterUrl: '', seconds: 0 }),
      });
      const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 42 }) });
      const secret = createHmac('sha256', 'WebAppData').update(clone.bot_token).digest();
      p.set('hash', createHmac('sha256', secret).update([...p].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n')).digest('hex'));
      const catalogueResponse = await handler(new NextRequest('http://localhost:3001/api/catalogue/fixture', {
        method: 'POST', headers: { origin: 'http://localhost:3001', 'content-type': 'application/json', 'x-telegram-init-data': p.toString() },
        body: JSON.stringify({ action: 'catalogue' }),
      }), { params: Promise.resolve({ slug: 'fixture' }) });
      const cataloguePayload = await catalogueResponse.json();
      assert.equal(cataloguePayload.tonNanotonPerStar, 10_000_000, 'the catalogue payload shows the live rate, not the stale stored one');
      const liveBegin = await beginTonCheckout(context, { type: 'photo', id: id(10) }, rows.creator_catalogue_settings[0]);
      assert.equal(liveBegin.amountNanoton, 350 * 10_000_000, 'the charge uses the exact same live rate the display just showed');
    } finally { (global as any).fetch = globalFetchForRate; }
  }

  // 13. One chain lookup per wallet: 50 concurrent status polls for the same
  // wallet, across different orders and fans, cost exactly one verifier call.
  {
    reset();
    resetTonWalletCacheForTests();
    const liveSettings = rows.creator_catalogue_settings[0]; // the actual row tonOrderStatus queries by clone_id
    const concurrencyOrders = await Promise.all(Array.from({ length: 50 }, () => beginTonCheckout(context, { type: 'photo', id: id(10) }, liveSettings)));
    let verifierCalls = 0;
    const slowVerifier = async (address: string) => {
      verifierCalls++;
      await new Promise((r) => setTimeout(r, 20)); // simulate real network latency
      return [] as TonIncomingTx[];
    };
    const results = await Promise.all(concurrencyOrders.map((o) => tonOrderStatus(context, o.orderId, slowVerifier)));
    assert.equal(verifierCalls, 1, '50 concurrent polls for one wallet must coalesce into a single toncenter call');
    assert.ok(results.every((r) => r.status === 'pending'));

    // A second wallet is unaffected: it gets its own call. Mutate the actual
    // stored settings row (what tonOrderStatus looks up by clone_id), not a
    // stale local reference.
    liveSettings.ton_wallet_address = 'EQanother-wallet-address';
    const otherOrder = await beginTonCheckout(context, { type: 'photo', id: id(10) }, liveSettings);
    await tonOrderStatus(context, otherOrder.orderId, slowVerifier);
    assert.equal(verifierCalls, 2, "a different wallet is not served from the first wallet's cache");
  }

  console.log('TON checkout checks passed: memo match confirms, wrong memo and underpayment do not, same tx twice is idempotent, expired orders never confirm and skip verification, TON-disabled clones reject checkout, client-supplied confirmation is ignored end to end, TON prices round up to 0.1 TON identically in the label and the charge, the live TON/USD rate is applied with a 10-minute cache and a fallback to the stored rate on failure or an absurd price, display and charge always agree, and concurrent polls for one wallet coalesce into a single toncenter call. No live toncenter calls.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
