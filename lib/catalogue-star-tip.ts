import type { Context, InvoiceTransport } from './catalogue-checkout';
import { CheckoutError, checkoutUuid, createCatalogueInvoice } from './catalogue-checkout';
import { TIP_PRESET_USD, tipStarsForUsd } from './catalogue-ton-price';

type Settings = { stars_tips_enabled?: unknown; ton_star_usd?: unknown };
function tipRequest(context: Context, body: Record<string, unknown>, settings: Settings) {
  if (settings.stars_tips_enabled !== true) throw new CheckoutError('Stars tips are not available for this collection.', 403);
  if (typeof body.usd !== 'number' || !TIP_PRESET_USD.some(value => value === body.usd) ||
      typeof body.requestKey !== 'string' || !checkoutUuid.test(body.requestKey)) throw new CheckoutError('Invalid tip request.', 400);
  const stars = tipStarsForUsd(body.usd, settings.ton_star_usd);
  if (stars === null) throw new CheckoutError('Tips are not available for this collection.', 503);
  // Keep the existing tip_ namespace: the bot's reconciler records this as a tip
  // and applies the creator's existing tip-credit policy, never a media purchase.
  const payload = `tip_catalogue_${context.fan.telegram_id}_${body.usd}_${body.requestKey}`;
  return { payload, stars };
}

export async function catalogueStarTipStatus(context: Context, body: Record<string, unknown>, settings: Settings) {
  const { db, clone, fan } = context;
  const { payload } = tipRequest(context, body, settings);
  const receipt = await db.from('star_transactions').select('id,amount_stars')
    .eq('clone_id', clone.id).eq('user_id', fan.id).eq('telegram_id', fan.telegram_id)
    .eq('kind', 'tip').eq('invoice_payload', payload).gt('amount_stars', 0).order('paid_at', { ascending: false }).limit(1).maybeSingle();
  if (receipt.error) throw new CheckoutError('Could not check your tip. Please try again.', 503);
  if (!receipt.data) return { status: 'pending' as const };
  const refund = await db.from('star_transactions').select('id').eq('clone_id', clone.id).eq('id', `refund:${receipt.data.id}`).maybeSingle();
  if (refund.error) throw new CheckoutError('Could not check your tip. Please try again.', 503);
  return { status: refund.data ? 'refunded' as const : 'paid' as const, amountStars: receipt.data.amount_stars };
}

export async function beginCatalogueStarTip(context: Context, body: Record<string, unknown>, settings: Settings, invoice: InvoiceTransport = createCatalogueInvoice) {
  const { payload, stars } = tipRequest(context, body, settings);
  if (!context.fan.business_connection_id) throw new CheckoutError('Open the creator’s chat once before your first tip.');
  const status = await catalogueStarTipStatus(context, body, settings);
  // A retry after a lost response must never reopen an already-paid invoice.
  if (status.status !== 'pending') return status;
  const invoiceUrl = await invoice(context.clone.bot_token, {
    business_connection_id: context.fan.business_connection_id,
    title: 'Send a tip', description: `A one-time tip of ${stars.toLocaleString()} Stars.`,
    payload, provider_token: '', currency: 'XTR', prices: [{ label: 'Tip', amount: stars }],
  });
  return { status: 'pending' as const, invoiceUrl, amountStars: stars };
}
