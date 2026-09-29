import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { createCatalogueHandler } from '../lib/catalogue-api';
import { TIP_PRESET_USD, tipStarsForUsd } from '../lib/catalogue-ton-price';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const clone = { id: id(1), slug: 'fixture', name: 'Creator', bot_token: '1234:fixture', status: 'active', browse_enabled: true, photos_enabled: true, videos_enabled: true, bundles_enabled: true };
const fan: any = { id: id(2), clone_id: clone.id, telegram_id: 42, business_connection_id: 'fixture-business', paused: false, blocked_at: null, minor_flagged_at: null };
const settings: any = { clone_id: clone.id, enabled: true, checkout_mode: 'invoice', stars_tips_enabled: true, simple_unlock_cards: true, ton_star_usd: 0.02, ton_discount_percent: 50 };
const rows: Record<string, any[]> = { clones: [clone], users: [fan], creator_catalogue_settings: [settings], star_transactions: [] };
let invoiceCalls: any[] = [], dbError = false, admin = false;
// Read-only fixture: any attempted balance, ownership or delivery mutation fails.
const db: any = {
  from(table: string) {
    const filters: ((row: any) => boolean)[] = []; let single = false; let cap = Infinity;
    const query: any = {
      select() { return query; }, eq(k: string, v: any) { filters.push(r => r[k] === v); return query; },
      gt(k: string, v: any) { filters.push(r => r[k] > v); return query; },
      order() { return query; }, limit(n: number) { cap = n; return query; }, maybeSingle() { single = true; return query; },
      then(resolve: any) { const matches = (rows[table] ?? []).filter(row => filters.every(filter => filter(row))).slice(0, cap); resolve({ data: single ? matches[0] ?? null : matches, error: dbError && table === 'star_transactions' ? { code: 'unavailable' } : null }); },
    }; return query;
  },
};
const handler = createCatalogueHandler({ db: () => db, admin: async () => admin,
  invoice: async (token, body) => { assert.equal(token, clone.bot_token); invoiceCalls.push(body); return 'https://t.me/$fixture-tip'; },
  preview: async () => Buffer.alloc(0), videoPreview: async () => Buffer.alloc(0), videoSources: async () => ({ url: '', posterUrl: '', seconds: 5 }),
});
function initData() {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: fan.telegram_id }) });
  const secret = createHmac('sha256', 'WebAppData').update(clone.bot_token).digest();
  params.set('hash', createHmac('sha256', secret).update([...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n')).digest('hex'));
  return params.toString();
}
const request = { usd: 25, requestKey: id(3) };
async function call(action: string, extra: any = {}, signed = true) {
  const response = await handler(new NextRequest('https://dashboard.example/api/catalogue/fixture', {
    method: 'POST', headers: { origin: 'https://dashboard.example', 'content-type': 'application/json', 'x-telegram-init-data': signed ? initData() : '' },
    body: JSON.stringify({ action, ...request, ...extra }),
  }), { params: Promise.resolve({ slug: 'fixture' }) });
  return { status: response.status, body: await response.json() };
}
async function main() {
  assert.equal((await call('stars_tip', {}, false)).status, 401);
  settings.stars_tips_enabled = false;
  assert.equal((await call('stars_tip')).status, 403, 'other creators are not enabled implicitly');
  settings.stars_tips_enabled = true;
  settings.checkout_mode = 'chat'; assert.equal((await call('stars_tip')).status, 403); settings.checkout_mode = 'invoice';
  admin = true; assert.equal((await call('stars_tip', { preview: true })).status, 403); admin = false;
  for (const key of ['paused', 'blocked_at', 'minor_flagged_at']) {
    const old = fan[key]; fan[key] = key === 'paused' ? true : new Date().toISOString();
    assert.equal((await call('stars_tip')).status, 403, `${key} still blocks payment`); fan[key] = old;
  }
  for (const usd of [0, -25, 1, 25.5, '25', 1001]) assert.equal((await call('stars_tip', { usd })).status, 400);
  assert.equal((await call('stars_tip', { requestKey: 'bad' })).status, 400);
  assert.equal(invoiceCalls.length, 0, 'rejected requests never create invoices');
  const started = await call('stars_tip', { amountStars: 1, currency: 'TON' });
  assert.equal(started.status, 200); assert.equal(started.body.amountStars, 1250);
  const invoice = invoiceCalls[0];
  assert.equal(invoice.currency, 'XTR'); assert.equal(invoice.business_connection_id, fan.business_connection_id);
  assert.deepEqual(invoice.prices, [{ label: 'Tip', amount: 1250 }]);
  assert.ok(invoice.payload.startsWith('tip_')); assert.ok(Buffer.byteLength(invoice.payload) <= 128);
  assert.equal((await call('stars_tip_status', { status: 'paid' })).body.status, 'pending', 'client payment claims cannot confirm tips');
  const receipt = { id: 'telegram-charge', clone_id: clone.id, user_id: fan.id, telegram_id: fan.telegram_id, kind: 'tip', invoice_payload: invoice.payload, amount_stars: 1250 };
  for (const wrong of [{ clone_id: id(90) }, { user_id: id(90) }, { telegram_id: -90 }, { kind: 'media' }, { invoice_payload: 'tip_other' }]) {
    rows.star_transactions = [{ ...receipt, ...wrong }];
    assert.equal((await call('stars_tip_status')).body.status, 'pending', 'only this fan and creator receipt can confirm');
  }
  rows.star_transactions = [receipt];
  assert.equal((await call('stars_tip_status')).body.status, 'paid');
  assert.equal((await call('stars_tip')).body.status, 'paid');
  assert.equal(invoiceCalls.length, 1, 'paid retries do not open another invoice');
  rows.star_transactions.push({ id: `refund:${receipt.id}`, clone_id: clone.id });
  assert.equal((await call('stars_tip_status')).body.status, 'refunded');
  assert.equal((await call('stars_tip')).body.status, 'refunded');
  assert.equal(invoiceCalls.length, 1);
  dbError = true; assert.equal((await call('stars_tip_status')).status, 503); dbError = false;
  assert.deepEqual(TIP_PRESET_USD.map(usd => tipStarsForUsd(usd, 0.02)), [500, 1250, 2500, 5000, 12500, 25000, 50000]);
  for (const rate of [null, 0, -1, 'oops']) assert.equal(tipStarsForUsd(25, rate), null);
  console.log('Stars tip API: authorization, server pricing, creator isolation, receipts, refunds and retry checks passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
