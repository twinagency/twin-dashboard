import type { SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { Cell } from '@ton/core';
import { TIP_PRESET_USD, tonPriceNanoton, type TipPresetUsd } from './catalogue-ton-price';
import { CheckoutError, checkoutType, checkoutUuid, productForCheckout, type Context } from './catalogue-checkout';
import { catalogueEventLoggedForOrder, logCatalogueEvent } from './catalogue-events';

export type TonSettings = {
  ton_wallet_address?: string | null;
  ton_nanoton_per_star?: number | string | null;
  ton_discount_percent?: number | null;
  ton_star_usd?: number | string | null;
};

// Live TON pricing: a star is worth a fixed USD value (ton_star_usd), converted
// to nanoton at the current TON/USD rate. Both the displayed catalogue price
// (lib/catalogue-api.ts) and the charged amount (beginTonCheckout below) call
// this SAME function, so the price a fan sees can never drift from the price
// they are charged. An order's amount is fixed at creation time regardless.
export type TonUsdPriceFetcher = () => Promise<number | null>;
const TON_USD_MIN = 0.2;
const TON_USD_MAX = 50;
const TON_USD_CACHE_MS = 10 * 60_000;

export const defaultTonUsdPriceFetcher: TonUsdPriceFetcher = async () => {
  const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd',
    { signal: AbortSignal.timeout(5_000), cache: 'no-store' });
  if (!response.ok) return null;
  const body = await response.json();
  const price = Number(body?.['the-open-network']?.usd);
  return Number.isFinite(price) ? price : null;
};

let tonUsdCache: { value: number; at: number } | null = null;
// Test-only: clear the in-process TON/USD cache so each check exercises a
// fresh fetch rather than a previous check's cached price.
export function resetTonUsdPriceCacheForTests() { tonUsdCache = null; }

// Cached for 10 minutes. A fetch failure, or a price outside a sane band
// (something is badly wrong with the feed below $0.20 or above $50), falls
// back to a stale cached value rather than nothing.
export async function tonUsdPrice(fetcher: TonUsdPriceFetcher = defaultTonUsdPriceFetcher): Promise<number | null> {
  const now = Date.now();
  if (tonUsdCache && now - tonUsdCache.at < TON_USD_CACHE_MS) return tonUsdCache.value;
  let price: number | null = null;
  try { price = await fetcher(); } catch { price = null; }
  if (price != null && price >= TON_USD_MIN && price <= TON_USD_MAX) {
    tonUsdCache = { value: price, at: now };
    return price;
  }
  return tonUsdCache ? tonUsdCache.value : null;
}

// The single shared rate used for both the displayed price and the charge.
// When ton_star_usd is set, converts it to nanoton at the live TON/USD rate;
// otherwise (or if the live rate is unavailable) falls back to the stored,
// fixed ton_nanoton_per_star.
export async function effectiveNanotonPerStar(settings: TonSettings, fetcher: TonUsdPriceFetcher = defaultTonUsdPriceFetcher): Promise<number | null> {
  const starUsd = Number(settings?.ton_star_usd);
  const stored = settings?.ton_nanoton_per_star != null && Number(settings.ton_nanoton_per_star) > 0
    ? Number(settings.ton_nanoton_per_star) : null;
  if (Number.isFinite(starUsd) && starUsd > 0) {
    const usdPerTon = await tonUsdPrice(fetcher);
    if (usdPerTon != null) {
      const nanoton = Math.round((starUsd / usdPerTon) * 1_000_000_000);
      if (Number.isSafeInteger(nanoton) && nanoton > 0) return nanoton;
    }
  }
  return stored;
}

export function tonDiscountPercent(settings: TonSettings | null | undefined): number {
  const pct = Number(settings?.ton_discount_percent ?? 0);
  return Number.isInteger(pct) && pct > 0 && pct <= 90 ? pct : 0;
}

export function tonEnabled(settings: TonSettings | null | undefined): boolean {
  return !!settings?.ton_wallet_address && Number(settings?.ton_nanoton_per_star ?? 0) > 0;
}

export function starsToNanoton(stars: number, nanotonPerStar: number | string, discountPercent = 0): number {
  const amount = tonPriceNanoton(stars, nanotonPerStar, discountPercent);
  if (amount == null) throw new CheckoutError('Payment amount is invalid. Please try again.', 503);
  return amount;
}

const memoAlphabet = 'abcdefghijklmnopqrstuvwxyz234567';
function randomMemo(): string {
  const bytes = randomBytes(12);
  let body = '';
  for (let i = 0; i < 12; i++) body += memoAlphabet[bytes[i] % memoAlphabet.length];
  return `cc_${body}`;
}

const orderColumns = 'id,clone_id,user_id,telegram_id,business_connection_id,media_type,media_id,amount_stars,amount_nanoton,photo_ids,video_ids,memo,status,expires_at';
function checked<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw new CheckoutError('Could not load checkout. Please try again.', 503);
  return result.data;
}

export type BeginTonCheckoutResult = { orderId: string; memo: string; toAddress: string; amountNanoton: number; comment: string };
export async function beginTonCheckout(context: Context, body: Record<string, unknown>, settings: TonSettings): Promise<BeginTonCheckoutResult> {
  const { db, clone, fan } = context;
  if (!tonEnabled(settings)) throw new CheckoutError('Pay with TON is not available for this collection.', 403);
  if (!checkoutType(body.type) || typeof body.id !== 'string' || !checkoutUuid.test(body.id))
    throw new CheckoutError('Invalid checkout request.', 400);
  if (!fan.business_connection_id) throw new CheckoutError('Open the creator’s chat once before your first purchase.');
  const product = await productForCheckout(context, body.type, body.id);
  const nanotonPerStar = await effectiveNanotonPerStar(settings);
  if (nanotonPerStar == null) throw new CheckoutError('Payment amount is invalid. Please try again.', 503);
  const amountNanoton = starsToNanoton(product.stars, nanotonPerStar, tonDiscountPercent(settings));
  const toAddress = settings.ton_wallet_address!;
  for (let attempt = 0; attempt < 5; attempt++) {
    const memo = randomMemo();
    const inserted = await db.from('catalogue_ton_orders').insert({
      clone_id: clone.id, user_id: fan.id, telegram_id: fan.telegram_id,
      business_connection_id: fan.business_connection_id, media_type: product.type, media_id: product.id,
      photo_ids: product.photoIds, video_ids: product.videoIds, amount_stars: product.stars, amount_nanoton: amountNanoton, memo,
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    }).select(orderColumns).single();
    if (!inserted.error) {
      const row: any = inserted.data;
      return { orderId: row.id, memo: row.memo, toAddress, amountNanoton: Number(row.amount_nanoton), comment: row.memo };
    }
    if ((inserted.error as any).code !== '23505') break; // only retry a memo collision
  }
  throw new CheckoutError('Payment could not open. Please try again.', 503);
}

// The server rejects any tip amount not exactly one of TIP_PRESET_USD; the amount
// is never trusted from the client beyond picking one of these numbers.
export function validTipUsd(value: unknown): value is TipPresetUsd {
  return typeof value === 'number' && Number.isFinite(value) && (TIP_PRESET_USD as readonly number[]).includes(value);
}

export type BeginTonTipResult = { orderId: string; memo: string; toAddress: string; amountNanoton: number; comment: string };
// A tip is priced straight in USD, at the live TON/USD rate, never discounted. It
// reuses effectiveNanotonPerStar for the live-rate-with-fallback plumbing (same
// source and same fallback as a media checkout), then divides out ton_star_usd to
// get nanoton-per-dollar. Without ton_star_usd configured there is no USD peg to
// convert from, so tips refuse rather than guess a rate.
export async function beginTonTipCheckout(context: Context, body: Record<string, unknown>, settings: TonSettings): Promise<BeginTonTipResult> {
  const { db, clone, fan } = context;
  if (!tonEnabled(settings)) throw new CheckoutError('Pay with TON is not available for this collection.', 403);
  if (!validTipUsd(body.usd)) throw new CheckoutError('Invalid tip amount.', 400);
  if (!fan.business_connection_id) throw new CheckoutError('Open the creator’s chat once before your first purchase.');
  const starUsd = Number(settings.ton_star_usd);
  if (!Number.isFinite(starUsd) || starUsd <= 0) throw new CheckoutError('Tips are not available for this collection.', 503);
  const nanotonPerStar = await effectiveNanotonPerStar(settings);
  if (nanotonPerStar == null) throw new CheckoutError('Payment amount is invalid. Please try again.', 503);
  const nanotonPerUsd = nanotonPerStar / starUsd;
  const amountNanoton = tonPriceNanoton(body.usd, nanotonPerUsd, 0); // no discount, ever, on a tip
  if (amountNanoton == null) throw new CheckoutError('Payment amount is invalid. Please try again.', 503);
  // Stars-equivalent kept only for revenue reporting; a tip is never charged in Stars.
  const amountStars = Math.max(1, Math.round(body.usd / starUsd));
  const toAddress = settings.ton_wallet_address!;
  for (let attempt = 0; attempt < 5; attempt++) {
    const memo = randomMemo();
    const inserted = await db.from('catalogue_ton_orders').insert({
      clone_id: clone.id, user_id: fan.id, telegram_id: fan.telegram_id,
      business_connection_id: fan.business_connection_id, media_type: 'tip', media_id: null,
      photo_ids: [], video_ids: [], amount_stars: amountStars, amount_nanoton: amountNanoton, memo,
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    }).select(orderColumns).single();
    if (!inserted.error) {
      const row: any = inserted.data;
      return { orderId: row.id, memo: row.memo, toAddress, amountNanoton: Number(row.amount_nanoton), comment: row.memo };
    }
    if ((inserted.error as any).code !== '23505') break; // only retry a memo collision
  }
  throw new CheckoutError('Payment could not open. Please try again.', 503);
}

export type TonIncomingTx = { hash: string; comment: string | null; valueNanoton: bigint; source: string | null };
export type TonVerifier = (address: string) => Promise<TonIncomingTx[]>;

function decodeRawComment(base64Body: unknown): string | null {
  if (typeof base64Body !== 'string' || !base64Body) return null;
  try {
    const cell = Cell.fromBoc(Buffer.from(base64Body, 'base64'))[0];
    const slice = cell.beginParse();
    if (slice.remainingBits < 32) return null;
    if (slice.loadUint(32) !== 0) return null; // 0 = simple text comment opcode
    return slice.loadStringTail();
  } catch { return null; }
}

function decodeIncomingTx(tx: any): TonIncomingTx | null {
  const inMsg = tx?.in_msg;
  if (!inMsg || !inMsg.source) return null; // no in_msg, or it's an outgoing-only tx
  const hash = typeof tx?.hash === 'string' ? tx.hash : typeof inMsg?.hash === 'string' ? inMsg.hash : null;
  if (!hash) return null;
  const decoded = inMsg?.message_content?.decoded;
  const comment = typeof decoded?.comment === 'string' ? decoded.comment : decodeRawComment(inMsg?.message_content?.body);
  let value = BigInt(0);
  try { value = BigInt(inMsg?.value ?? 0); } catch { value = BigInt(0); }
  return { hash, comment, valueNanoton: value, source: typeof inMsg.source === 'string' ? inMsg.source : null };
}

// toncenter v3 works unauthenticated at roughly 1 req/s; pass TONCENTER_API_KEY to raise that.
export const defaultTonVerifier: TonVerifier = async (address) => {
  const url = new URL('https://toncenter.com/api/v3/transactions');
  url.searchParams.set('account', address);
  url.searchParams.set('limit', '50');
  url.searchParams.set('sort', 'desc');
  const headers: Record<string, string> = {};
  if (process.env.TONCENTER_API_KEY) headers['X-API-Key'] = process.env.TONCENTER_API_KEY;
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(10_000), cache: 'no-store' });
  if (!response.ok) throw new Error('toncenter unavailable');
  const body = await response.json();
  const list = Array.isArray(body?.transactions) ? body.transactions : [];
  return list.map(decodeIncomingTx).filter((tx: TonIncomingTx | null): tx is TonIncomingTx => !!tx);
};

// One verification attempt per order per this window. TON confirmation is checked
// lazily on each ton_status poll rather than by any background job.
const lastVerifyAt = new Map<string, number>();
const VERIFY_MIN_INTERVAL_MS = 3_000;

// Per-wallet cache of the incoming-transaction list, shared across every order
// and every fan polling the same creator wallet. Without this, N fans polling
// their own order each cost their own toncenter call; with it, N fans polling
// the same wallet within the TTL cost exactly one call, and concurrent polls
// that land before that one call resolves are coalesced onto its single
// in-flight promise rather than each starting their own.
const WALLET_TX_CACHE_MS = 3_000;
const walletTxCache = new Map<string, { promise: Promise<TonIncomingTx[]>; at: number }>();
// Test-only: clear the wallet tx cache so each check scenario gets a fresh
// verifier call instead of a previous scenario's cached (or in-flight) result.
export function resetTonWalletCacheForTests() { walletTxCache.clear(); }

function walletTxs(address: string, verifier: TonVerifier): Promise<TonIncomingTx[]> {
  const now = Date.now();
  const cached = walletTxCache.get(address);
  if (cached && now - cached.at < WALLET_TX_CACHE_MS) return cached.promise;
  const promise = verifier(address).catch(err => {
    // A failed lookup must not poison the cache for the next poll within the TTL.
    if (walletTxCache.get(address)?.promise === promise) walletTxCache.delete(address);
    throw err;
  });
  walletTxCache.set(address, { promise, at: now });
  return promise;
}

// Both the fan's own poll (below) and the catalogue-load reconciliation logs
// pay_success the same way once confirm_catalogue_ton_order actually confirms.
async function logTonPaySuccess(db: any, clone: any, fan: any, order: any) {
  if (await catalogueEventLoggedForOrder(db, clone.id, 'pay_success', order.id)) return;
  // 'tip' is not a media type catalogue_events accepts (it never has one); log it
  // as a plain rail:'ton' event with the tip flag in detail instead.
  const isTip = order.media_type === 'tip';
  await logCatalogueEvent(db, { cloneId: clone.id, telegramId: fan.telegram_id, event: 'pay_success', rail: 'ton',
    mediaType: isTip ? null : order.media_type ?? null, mediaId: isTip ? null : order.media_id ?? null,
    amountNanoton: Number(order.amount_nanoton), amountStars: isTip ? Number(order.amount_stars) : null,
    detail: { order_id: order.id, ...(isTip ? { tip: true } : {}) } });
}

export type TonOrderStatus = { orderId: string; status: 'pending' | 'confirmed' | 'delivered' | 'expired' };
export async function tonOrderStatus({ db, clone, fan }: Context, orderId: string, verifier: TonVerifier = defaultTonVerifier): Promise<TonOrderStatus> {
  if (!checkoutUuid.test(orderId)) throw new CheckoutError('Invalid checkout request.', 400);
  const order: any = checked(await db.from('catalogue_ton_orders').select('id,status,memo,amount_nanoton,amount_stars,expires_at,media_type,media_id')
    .eq('id', orderId).eq('clone_id', clone.id).eq('user_id', fan.id).maybeSingle());
  if (!order) throw new CheckoutError('Checkout not found.', 404);
  let status: TonOrderStatus['status'] = order.status;
  if (status === 'pending' && Date.parse(order.expires_at) <= Date.now()) {
    checked(await db.from('catalogue_ton_orders').update({ status: 'expired' }).eq('id', orderId).eq('status', 'pending'));
    status = 'expired';
  }
  if (status === 'pending') {
    const now = Date.now();
    const last = lastVerifyAt.get(orderId) ?? 0;
    if (now - last >= VERIFY_MIN_INTERVAL_MS) {
      lastVerifyAt.set(orderId, now);
      const settings: any = checked(await db.from('creator_catalogue_settings').select('ton_wallet_address').eq('clone_id', clone.id).maybeSingle());
      const address = settings?.ton_wallet_address;
      if (address) {
        try {
          const txs = await walletTxs(address, verifier);
          const match = txs.find(tx => tx.comment === order.memo && tx.valueNanoton >= BigInt(order.amount_nanoton));
          // Never trust anything the client sends here. Only a transaction we found
          // ourselves on chain, matched by memo and amount, can confirm an order.
          if (match) {
            const result = await db.rpc('confirm_catalogue_ton_order', { p_order: orderId, p_tx_hash: match.hash, p_buyer: match.source });
            if (!result.error && typeof result.data === 'string') status = result.data as TonOrderStatus['status'];
            if (status === 'confirmed' || status === 'delivered') await logTonPaySuccess(db, clone, fan, order);
          }
        } catch { /* toncenter hiccup; the fan's next poll tries again */ }
      }
    }
  } else if (status === 'confirmed' || status === 'delivered') {
    await logTonPaySuccess(db, clone, fan, order);
  }
  return { orderId, status };
}

// Fans often get bounced out of the Mini App by their wallet app. Verifying only on the
// client's ton_status poll would strand a paid order, so the catalogue load also settles
// any of this fan's pending TON orders with a single chain lookup.
export async function reconcilePendingTonOrders({ db, clone, fan }: Context, verifier: TonVerifier = defaultTonVerifier): Promise<number> {
  const key = `fan:${fan.id}`;
  const now = Date.now();
  if (now - (lastVerifyAt.get(key) ?? 0) < VERIFY_MIN_INTERVAL_MS) return 0;
  lastVerifyAt.set(key, now);
  const orders: any[] = checked(await db.from('catalogue_ton_orders').select('id,memo,amount_nanoton,amount_stars,expires_at,media_type,media_id')
    .eq('clone_id', clone.id).eq('user_id', fan.id).eq('status', 'pending').order('created_at', { ascending: false }).limit(10)) ?? [];
  const live = orders.filter(order => Date.parse(order.expires_at) > now);
  if (!live.length) return 0;
  const settings: any = checked(await db.from('creator_catalogue_settings').select('ton_wallet_address').eq('clone_id', clone.id).maybeSingle());
  if (!settings?.ton_wallet_address) return 0;
  let confirmed = 0;
  try {
    const txs = await walletTxs(settings.ton_wallet_address, verifier);
    for (const order of live) {
      const match = txs.find(tx => tx.comment === order.memo && tx.valueNanoton >= BigInt(order.amount_nanoton));
      if (!match) continue;
      const result = await db.rpc('confirm_catalogue_ton_order', { p_order: order.id, p_tx_hash: match.hash, p_buyer: match.source });
      if (!result.error && result.data === 'confirmed') { confirmed++; await logTonPaySuccess(db, clone, fan, order); }
    }
  } catch { /* toncenter hiccup; next load tries again */ }
  return confirmed;
}
