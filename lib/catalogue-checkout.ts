import type { SupabaseClient } from '@supabase/supabase-js';
import { catalogueItemVisible, projectItem } from './catalogue-core';
import { projectBundle } from './catalogue-commerce';

export const checkoutUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type CheckoutMediaType = 'photo' | 'video' | 'bundle';
export class CheckoutError extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}
function checked<T>(result: {data:T;error:unknown}):T {
  if (result.error) throw new CheckoutError('Could not load checkout. Please try again.', 503);
  return result.data;
}
export function checkoutMode(value:unknown):'chat'|'invoice' { return value === 'invoice' ? 'invoice' : 'chat'; }
export function checkoutType(value:unknown): value is CheckoutMediaType { return value === 'photo' || value === 'video' || value === 'bundle'; }

// Positive receipts are not sufficient after a refund. Never derive paid access
// from a browser callback or from the historical delivery-only table.
export async function paidCatalogueItems(db:SupabaseClient, cloneId:string, userId:string) {
  const receipts:any[] = checked(await db.from('star_transactions').select('id,media_type,media_id,invoice_payload')
    .eq('clone_id',cloneId).eq('user_id',userId).eq('kind','media').gt('amount_stars',0)
    .not('media_id','is',null).order('paid_at',{ascending:false}).limit(1000)) ?? [];
  if (!receipts.length) return [];
  const refunds:any[] = checked(await db.from('star_transactions').select('id').eq('clone_id',cloneId)
    .in('id',receipts.map(row=>`refund:${row.id}`))) ?? [];
  const refunded = new Set(refunds.map(row=>row.id));
  return receipts.filter(row=>!refunded.has(`refund:${row.id}`));
}

export async function nativeOwnedItems(db:SupabaseClient, userId:string, type:CheckoutMediaType):Promise<string[]> {
  const ids = checked(await db.rpc('catalogue_owned_checkout_assets',{p_user:userId,p_type:type}));
  return Array.isArray(ids) ? ids.filter((id:unknown):id is string=>typeof id==='string'&&checkoutUuid.test(id)) : [];
}

export type Context = {db:SupabaseClient; clone:any; fan:any};
export type Product = {type:CheckoutMediaType;id:string;stars:number;photoIds:string[];title:string;description:string};
// Shared by the Stars invoice flow and lib/catalogue-ton.ts's TON flow, so price and
// ownership are resolved identically regardless of payment rail.
export async function productForCheckout({db,clone,fan}:Context,type:CheckoutMediaType,id:string):Promise<Product> {
  if ((type==='video'&&!clone.videos_enabled)||(type!=='video'&&!clone.photos_enabled)||(type==='bundle'&&!clone.bundles_enabled))
    throw new CheckoutError('This item is not available.',404);
  const paid = await paidCatalogueItems(db,clone.id,fan.id);
  const receipts = new Set(paid.map(row=>`${row.media_type}:${row.media_id}`));
  const owned = new Set(await nativeOwnedItems(db,fan.id,type==='bundle'?'photo':type));
  const received:any[] = checked(await db.from('user_received_media').select('media_type,media_id')
    .eq('clone_id',clone.id).eq('user_id',fan.id).eq('media_type',type==='bundle'?'photo':type).limit(1000)) ?? [];
  for(const row of received) owned.add(row.media_id);
  const legacyBundles = paid.filter(row=>row.media_type==='bundle'&&!String(row.invoice_payload??'').startsWith('catalogue_order_')).map(row=>row.media_id);
  if(type!=='video'&&legacyBundles.length){
    const bundles:any[] = checked(await db.from('catalogue_bundles').select('photo_ids').eq('clone_id',clone.id).in('id',legacyBundles))??[];
    for(const bundle of bundles)for(const photoId of bundle.photo_ids??[])owned.add(photoId);
  }
  if (type==='bundle') {
    const row:any = checked(await db.from('catalogue_bundles').select('id,title,caption,photo_ids,price_stars,regular_stars')
      .eq('clone_id',clone.id).eq('id',id).eq('enabled',true).maybeSingle());
    if(!row)throw new CheckoutError('This bundle is not available.',404);
    const photos:any[] = checked(await db.from('photos').select('id,caption,auto_desc,star_value,is_free')
      .eq('clone_id',clone.id).in('id',row.photo_ids))??[];
    const bundle=projectBundle(row,photos.filter(photo=>catalogueItemVisible(photo,clone.slug)).map(photo=>projectItem(photo,'photo')));
    if(!bundle)throw new CheckoutError('The bundle changed. Refresh the collection before buying.');
    if(receipts.has(`bundle:${id}`)||bundle.photoIds.some(photoId=>owned.has(photoId)||receipts.has(`photo:${photoId}`)))
      throw new CheckoutError('You already own items in this bundle. Choose individual items to avoid paying twice.');
    return {type,id,stars:bundle.stars,photoIds:bundle.photoIds,title:String(bundle.title||`${bundle.photoIds.length}-photo bundle`).slice(0,32),description:String(row.caption||row.title||'Photo collection').slice(0,255)};
  }
  const row:any = checked(await db.from(type==='photo'?'photos':'videos').select('id,caption,auto_desc,star_value,is_free')
    .eq('clone_id',clone.id).eq('id',id).maybeSingle());
  if(!row||!catalogueItemVisible(row,clone.slug)||row.is_free||!Number.isInteger(row.star_value)||row.star_value<=0)
    throw new CheckoutError('This item is not available for purchase.',404);
  if(owned.has(id)||receipts.has(`${type}:${id}`))throw new CheckoutError('You already own this item. Refresh to view it.');
  return {type,id,stars:row.star_value,photoIds:[],title:type==='photo'?'Photo':'Video',description:projectItem(row,type).description.slice(0,255)};
}

export type InvoiceTransport = (token:string, body:Record<string,unknown>)=>Promise<string>;
export const createCatalogueInvoice:InvoiceTransport = async(token,body)=>{
  const response=await fetch(`https://api.telegram.org/bot${token}/createInvoiceLink`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(12_000),cache:'no-store',
  });
  const result=await response.json();
  if(!response.ok||!result.ok||typeof result.result!=='string')throw new CheckoutError('Payment could not open. Please try again.',502);
  const url=new URL(result.result);
  if(url.protocol!=='https:'||url.hostname!=='t.me'||url.username||url.password||url.port)throw new CheckoutError('Payment could not open. Please try again.',502);
  return result.result;
};

const orderColumns='id,clone_id,user_id,telegram_id,media_type,media_id,amount_stars,photo_ids,business_connection_id,status,invoice_url,expires_at,charge_id';
export async function beginCatalogueCheckout(context:Context,body:Record<string,unknown>,invoice:InvoiceTransport=createCatalogueInvoice) {
  const {db,clone,fan}=context;
  if(!checkoutType(body.type)||typeof body.id!=='string'||!checkoutUuid.test(body.id)||typeof body.requestKey!=='string'||!checkoutUuid.test(body.requestKey))
    throw new CheckoutError('Invalid checkout request.',400);
  if(!fan.business_connection_id)throw new CheckoutError('Open the creator’s chat once before your first purchase.');
  let order:any=checked(await db.from('catalogue_checkout_orders').select(orderColumns).eq('id',body.requestKey)
    .eq('clone_id',clone.id).eq('user_id',fan.id).maybeSingle());
  if(order&&(order.media_type!==body.type||order.media_id!==body.id))throw new CheckoutError('Invalid checkout request.',409);
  if(order?.status==='paid')return {orderId:order.id,status:(await catalogueOrderStatus(context,order.id)).status};
  if(order&&['expired','refunded'].includes(order.status))return {orderId:order.id,status:order.status};
  if(!order){
    order=checked(await db.from('catalogue_checkout_orders').select(orderColumns).eq('clone_id',clone.id).eq('user_id',fan.id)
      .eq('media_type',body.type).eq('media_id',body.id).in('status',['pending','checkout']).maybeSingle());
  }
  if(order?.status==='pending'&&Date.parse(order.expires_at)<=Date.now()){
    checked(await db.from('catalogue_checkout_orders').update({status:'expired'}).eq('id',order.id).eq('status','pending').lte('expires_at',new Date().toISOString()));
    order=checked(await db.from('catalogue_checkout_orders').select(orderColumns).eq('id',order.id).eq('clone_id',clone.id).eq('user_id',fan.id).maybeSingle());
    // A lost first response leaves the browser holding this request key without
    // its order id. Return the terminal order so it can discard that key. Never
    // try to insert the same primary key again after marking it expired.
    if(order&&['expired','refunded'].includes(order.status)) {
      if(order.id===body.requestKey)return {orderId:order.id,status:order.status};
      // A fresh click can discover a stale order from an earlier session. Its
      // unaccepted invoice was expired atomically, so continue on this new key.
      order=null;
    }
    // Reservation/settlement may win the conditional expiry update. Its receipt
    // remains authoritative; do not treat the completed purchase as a new one.
    if(order?.status==='paid')return {orderId:order.id,status:(await catalogueOrderStatus(context,order.id)).status};
  }
  // Revalidate price and ownership before opening an existing unpaid invoice.
  const product=await productForCheckout(context,body.type,body.id);
  if(order&&(order.amount_stars!==product.stars||JSON.stringify(order.photo_ids)!==JSON.stringify(product.photoIds)))
    throw new CheckoutError('The item changed. Close checkout and refresh the collection.');
  if(!order){
    const inserted=await db.from('catalogue_checkout_orders').insert({id:body.requestKey,clone_id:clone.id,user_id:fan.id,telegram_id:fan.telegram_id,
      media_type:product.type,media_id:product.id,amount_stars:product.stars,photo_ids:product.photoIds,business_connection_id:fan.business_connection_id,
      expires_at:new Date(Date.now()+15*60_000).toISOString()}).select(orderColumns).single();
    if(inserted.error?.code==='23505'){
      order=checked(await db.from('catalogue_checkout_orders').select(orderColumns).eq('clone_id',clone.id).eq('user_id',fan.id)
        .eq('media_type',product.type).eq('media_id',product.id).in('status',['pending','checkout']).maybeSingle());
      if(!order)throw new CheckoutError('This checkout is already in progress. Please refresh.');
    }else order=checked(inserted);
  }
  if(!order)throw new CheckoutError('Payment could not open. Please try again.',503);
  if(order.status==='checkout')return {orderId:order.id,status:'checkout',invoiceUrl:order.invoice_url};
  if(!order.invoice_url){
    const url=await invoice(clone.bot_token,{business_connection_id:order.business_connection_id,title:product.title,
      description:product.description,payload:`catalogue_order_${order.id}`,provider_token:'',currency:'XTR',prices:[{label:product.title,amount:order.amount_stars}]});
    checked(await db.from('catalogue_checkout_orders').update({invoice_url:url}).eq('id',order.id).eq('clone_id',clone.id).eq('user_id',fan.id).eq('status','pending'));
    order.invoice_url=url;
  }
  return {orderId:order.id,invoiceUrl:order.invoice_url,status:order.status};
}

export async function catalogueOrderStatus({db,clone,fan}:Context,orderId:string) {
  if(!checkoutUuid.test(orderId))throw new CheckoutError('Invalid checkout request.',400);
  const order:any=checked(await db.from('catalogue_checkout_orders').select('id,status,charge_id,expires_at').eq('id',orderId)
    .eq('clone_id',clone.id).eq('user_id',fan.id).maybeSingle());
  if(!order)throw new CheckoutError('Checkout not found.',404);
  let status=order.status;
  if(status==='paid'){
    const proof=await paidCatalogueItems(db,clone.id,fan.id);
    if(!proof.some(row=>row.id===order.charge_id&&row.invoice_payload===`catalogue_order_${order.id}`))status='refunded';
  }
  if(status==='pending'&&Date.parse(order.expires_at)<=Date.now())status='expired';
  let retryAfterSeconds = 0;
  if(status === 'checkout') {
    const attempts:any[] = checked(await db.from('catalogue_checkout_attempts').select('created_at')
      .eq('order_id',order.id).order('created_at',{ascending:false}).limit(1)) ?? [];
    retryAfterSeconds = attempts[0] ? Math.max(0,Math.ceil((Date.parse(attempts[0].created_at)+60_000-Date.now())/1000)) : 60;
  }
  return {orderId:order.id,status,retryAfterSeconds};
}

export async function catalogueContentPath({db,clone,fan}:Context,type:'photo'|'video',id:string):Promise<string> {
  if(!checkoutUuid.test(id))throw new CheckoutError('Item not found.',404);
  if(type==='photo'?!clone.photos_enabled:!clone.videos_enabled)throw new CheckoutError('Item not found.',404);
  const asset:any=checked(await db.from(type==='photo'?'photos':'videos').select('storage_path,caption,is_free').eq('id',id).eq('clone_id',clone.id).maybeSingle());
  if(!asset?.storage_path||!catalogueItemVisible(asset,clone.slug))throw new CheckoutError('Item not found.',404);
  if(asset.is_free)return asset.storage_path;
  const native=await nativeOwnedItems(db,fan.id,type);
  if(native.includes(id))return asset.storage_path;
  const paid=await paidCatalogueItems(db,clone.id,fan.id);
  if(paid.some(row=>row.media_type===type&&row.media_id===id&&!String(row.invoice_payload??'').startsWith('catalogue_order_')))return asset.storage_path;
  if(type==='photo'){
    const bundleIds=paid.filter(row=>row.media_type==='bundle'&&!String(row.invoice_payload??'').startsWith('catalogue_order_')).map(row=>row.media_id);
    if(bundleIds.length){
      const bundles:any[]=checked(await db.from('catalogue_bundles').select('photo_ids').eq('clone_id',clone.id).in('id',bundleIds))??[];
      if(bundles.some(bundle=>bundle.photo_ids.includes(id)))return asset.storage_path;
    }
  }
  throw new CheckoutError('Purchase this item to view the original.',403);
}
