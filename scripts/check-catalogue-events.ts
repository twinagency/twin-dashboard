import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { createCatalogueHandler } from '../lib/catalogue-api';
import { isClientEventName, sanitizeClientDetail, validEventUuid, validEventMediaType, validEventRail, CLIENT_EVENT_NAMES } from '../lib/catalogue-events';
import { parseCatalogueStartParam } from '../lib/catalogue-start-param';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const clone = { id: id(1), slug: 'fixture', name: 'Creator', bot_token: '1234:fixture', status: 'active', browse_enabled: true, photos_enabled: true, videos_enabled: true, bundles_enabled: true };
const fan = { id: id(2), clone_id: clone.id, telegram_id: 42, business_connection_id: 'creator-business', paused: false, blocked_at: null, minor_flagged_at: null };
const testFan = { id: id(3), clone_id: clone.id, telegram_id: 6814483810, business_connection_id: 'creator-business', paused: false, blocked_at: null, minor_flagged_at: null };

let rows: Record<string, any[]>;
function reset() {
  rows = {
    clones: [clone], users: [fan, testFan],
    creator_catalogue_settings: [{ clone_id: clone.id, enabled: true, checkout_mode: 'chat', blur_strength: 16 }],
    photos: [{ id: id(10), clone_id: clone.id, caption: 'Photo', star_value: 350, is_free: false, storage_path: 'private/0.jpg' }],
    videos: [], catalogue_bundles: [], catalogue_loyalty_programs: [],
    catalogue_requests: [], user_received_media: [], star_transactions: [],
    catalogue_events: [],
  };
}

function contains(container: any, needle: any): boolean {
  if (container == null) return false;
  return Object.entries(needle).every(([k, v]) => container[k] === v);
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
      gte(k: string, v: any) { filters.push(r => r[k] >= v); return q; },
      not(k: string, _op: string, v: any) { filters.push(r => r[k] !== v); return q; },
      contains(k: string, v: any) { filters.push(r => contains(r[k], v)); return q; },
      order() { return q; }, limit() { return q; },
      maybeSingle() { single = true; return q; }, single() { single = true; return q; },
      insert(v: any) { change = v; insert = true; return q; },
      update(v: any) { change = v; return q; },
      then(resolve: any, reject: any) {
        try {
          if (insert) {
            const row = { id: rows[table].length + 1, status: 'pending', ...change };
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
    async rpc() { return { data: null, error: null }; },
  };
}

function signedInitData(token: string, telegramId: number, startParam?: string) {
  const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: telegramId }) });
  if (startParam) p.set('start_param', startParam);
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  p.set('hash', createHmac('sha256', secret).update([...p].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n')).digest('hex'));
  return p.toString();
}

async function main() {
  const db = makeDb();
  const handler = createCatalogueHandler({
    db: () => db as any, admin: async () => false,
    preview: async () => Buffer.from(''), videoPreview: async () => Buffer.from(''),
    videoSources: async () => ({ url: '', posterUrl: '', seconds: 0 }),
  });
  async function call(action: string, body: Record<string, unknown> = {}, initData = signedInitData(clone.bot_token, fan.telegram_id)) {
    return handler(new NextRequest('http://localhost:3001/api/catalogue/fixture', {
      method: 'POST', headers: { origin: 'http://localhost:3001', 'content-type': 'application/json', 'x-telegram-init-data': initData },
      body: JSON.stringify({ ...body, action, preview: false }),
    }), { params: Promise.resolve({ slug: 'fixture' }) });
  }

  // 1. Pure validators: the 'event' action's exact allowlist.
  for (const name of CLIENT_EVENT_NAMES) assert.equal(isClientEventName(name), true, `${name} is a client-loggable event`);
  for (const name of ['open', 'pay_success', 'pay_fail', 'unknown_event', '', 'view_item; drop table', 123])
    assert.equal(isClientEventName(name), false, `${JSON.stringify(name)} must never be accepted as a client event`);
  assert.deepEqual(sanitizeClientDetail({ kind: 'error', error_message: 'x'.repeat(500), elapsed_ms: 12.4, evil: 'drop', was_connected: true }), { kind: 'error', error_message: 'x'.repeat(300), elapsed_ms: 12, was_connected: true });
  assert.equal(sanitizeClientDetail('nope'), null);
  assert.equal(sanitizeClientDetail({ evil: 1 }), null);
  assert.equal(validEventUuid(id(10)), true);
  for (const bad of ['not-a-uuid', '', id(10).slice(0, -1), `${id(10)}x`, null, 42])
    assert.equal(validEventUuid(bad), false, `${JSON.stringify(bad)} must be rejected as a uuid`);
  assert.equal(validEventMediaType('photo'), true);
  assert.equal(validEventMediaType('bundle'), true);
  assert.equal(validEventMediaType('gif'), false);
  assert.equal(validEventRail('stars'), true);
  assert.equal(validEventRail('ton'), true);
  assert.equal(validEventRail('cash'), false);

  // 2. Deep-link start_param parser: accepts the documented shape, rejects junk.
  assert.deepEqual(parseCatalogueStartParam(`item_photo_${id(10)}`), { type: 'photo', id: id(10) });
  assert.deepEqual(parseCatalogueStartParam(`item_video_${id(10)}`), { type: 'video', id: id(10) });
  assert.deepEqual(parseCatalogueStartParam(`item_bundle_${id(10)}`), { type: 'bundle', id: id(10) });
  for (const junk of ['item_photo_not-a-uuid', 'item_gif_' + id(10), 'photo_' + id(10), 'item_photo_', '', null, undefined, 42, `item_photo_${id(10)}x`])
    assert.equal(parseCatalogueStartParam(junk), null, `${JSON.stringify(junk)} must not parse`);

  // 3. 'catalogue' logs an 'open' event for a real fan, carrying start_param from initData.
  reset();
  const openInit = signedInitData(clone.bot_token, fan.telegram_id, `item_photo_${id(10)}`);
  const res = await call('catalogue', {}, openInit);
  assert.equal(res.status, 200, await res.clone().text());
  const opens = rows.catalogue_events.filter(r => r.event === 'open');
  assert.equal(opens.length, 1, 'exactly one open event logged');
  assert.equal(opens[0].clone_id, clone.id);
  assert.equal(opens[0].telegram_id, fan.telegram_id);
  assert.equal(opens[0].start_param, `item_photo_${id(10)}`);
  // A second catalogue load logs a second open; this table is an event log, not a dedup table.
  await call('catalogue', {}, signedInitData(clone.bot_token, fan.telegram_id));
  assert.equal(rows.catalogue_events.filter(r => r.event === 'open').length, 2);

  // 4. 'event' rejects an unknown event name and never lets the client log 'open'/'pay_success'/'pay_fail'.
  reset();
  for (const bad of ['open', 'pay_success', 'pay_fail', 'nonsense']) {
    const before = rows.catalogue_events.length;
    const r = await call('event', { event: bad, mediaType: 'photo', mediaId: id(10) });
    assert.equal(r.status, 400, `event=${bad} must be rejected`);
    assert.equal(rows.catalogue_events.length, before, 'a rejected event must not be logged');
  }

  // 5. 'event' rejects a bad uuid for mediaId.
  {
    const before = rows.catalogue_events.length;
    const r = await call('event', { event: 'view_item', mediaType: 'photo', mediaId: 'not-a-uuid' });
    assert.equal(r.status, 400);
    assert.equal(rows.catalogue_events.length, before);
  }

  // 6. A valid client event is logged, and the client can never set amounts or a
  // success outcome: even if the payload includes them, they never reach the row.
  reset();
  const before = rows.catalogue_events.length;
  const r2 = await call('event', {
    event: 'tap_pay_stars', mediaType: 'photo', mediaId: id(10), rail: 'stars',
    amountStars: 999_999, amount_stars: 999_999, amountNanoton: 999_999, status: 'paid',
  });
  assert.equal(r2.status, 200, await r2.clone().text());
  assert.equal(rows.catalogue_events.length, before + 1);
  const logged = rows.catalogue_events.at(-1);
  assert.equal(logged.event, 'tap_pay_stars');
  assert.equal(logged.rail, 'stars');
  assert.equal(logged.media_id, id(10));
  assert.equal(logged.amount_stars, null, 'a client-supplied amount must never be trusted');
  assert.equal(logged.amount_nanoton, null);

  // 7. Owner/test accounts are still logged, just flagged.
  reset();
  await call('event', { event: 'view_item', mediaType: 'photo', mediaId: id(10) }, signedInitData(clone.bot_token, testFan.telegram_id));
  const testRow = rows.catalogue_events.at(-1);
  assert.equal(testRow.telegram_id, testFan.telegram_id);
  assert.equal(testRow.detail?.test, true, 'a known test/owner telegram id is flagged, not dropped');

  console.log('Catalogue funnel checks passed: event validation rejects unknown names, bad uuids and every server-only event name; the client can never set an amount or a payment outcome; open is logged server-side with start_param; owner/test accounts are flagged not dropped; and the deep-link start_param parser accepts item_<type>_<uuid> and rejects junk.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
