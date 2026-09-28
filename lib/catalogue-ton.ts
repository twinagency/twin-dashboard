import type { SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { Cell } from '@ton/core';
import { CheckoutError, checkoutType, checkoutUuid, productForCheckout, type Context } from './catalogue-checkout';

export type TonSettings = { ton_wallet_address?: string | null; ton_nanoton_per_star?: number | string | null };

export function tonEnabled(settings: TonSettings | null | undefined): boolean {
  return !!settings?.ton_wallet_address && Number(settings?.ton_nanoton_per_star ?? 0) > 0;
}

export function starsToNanoton(stars: number, nanotonPerStar: number | string): number {
  const amount = Math.round(Number(stars) * Number(nanotonPerStar));
  if (!Number.isFinite(amount) || !Number.isSafeInteger(amount) || amount <= 0)
    throw new CheckoutError('Payment amount is invalid. Please try again.', 503);
  return amount;
}

const memoAlphabet = 'abcdefghijklmnopqrstuvwxyz234567';
function randomMemo(): string {
  const bytes = randomBytes(12);
  let body = '';
  for (let i = 0; i < 12; i++) body += memoAlphabet[bytes[i] % memoAlphabet.length];
  return `cc_${body}`;
}

const orderColumns = 'id,clone_id,user_id,telegram_id,business_connection_id,media_type,media_id,amount_stars,amount_nanoton,photo_ids,memo,status,expires_at';
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
  const amountNanoton = starsToNanoton(product.stars, settings.ton_nanoton_per_star!);
  const toAddress = settings.ton_wallet_address!;
  for (let attempt = 0; attempt < 5; attempt++) {
    const memo = randomMemo();
    const inserted = await db.from('catalogue_ton_orders').insert({
      clone_id: clone.id, user_id: fan.id, telegram_id: fan.telegram_id,
      business_connection_id: fan.business_connection_id, media_type: product.type, media_id: product.id,
      photo_ids: product.photoIds, amount_stars: product.stars, amount_nanoton: amountNanoton, memo,
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

export type TonOrderStatus = { orderId: string; status: 'pending' | 'confirmed' | 'delivered' | 'expired' };
export async function tonOrderStatus({ db, clone, fan }: Context, orderId: string, verifier: TonVerifier = defaultTonVerifier): Promise<TonOrderStatus> {
  if (!checkoutUuid.test(orderId)) throw new CheckoutError('Invalid checkout request.', 400);
  const order: any = checked(await db.from('catalogue_ton_orders').select('id,status,memo,amount_nanoton,expires_at')
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
          const txs = await verifier(address);
          const match = txs.find(tx => tx.comment === order.memo && tx.valueNanoton >= BigInt(order.amount_nanoton));
          // Never trust anything the client sends here. Only a transaction we found
          // ourselves on chain, matched by memo and amount, can confirm an order.
          if (match) {
            const result = await db.rpc('confirm_catalogue_ton_order', { p_order: orderId, p_tx_hash: match.hash, p_buyer: match.source });
            if (!result.error && typeof result.data === 'string') status = result.data as TonOrderStatus['status'];
          }
        } catch { /* toncenter hiccup; the fan's next poll tries again */ }
      }
    }
  }
  return { orderId, status };
}
