import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dashboardOrigin, trustedFormOrigin } from "./form-origin";
import { catalogueEligible, catalogueItemVisible, DEFAULT_BLUR, projectItem, safeMiniAppUrl, validBlur, validateTelegramData, windowOpen } from "./catalogue-core";
import { projectBundle } from './catalogue-commerce';
import { TRENDING_WINDOW_DAYS, tagEmojis, trendingRanks, type TrendingSale } from './catalogue-trending';
import { cataloguePresentation } from './catalogue-presentation';
import { beginCatalogueCheckout, catalogueContentPath, catalogueOrderStatus, checkoutMode, CheckoutError, nativeOwnedItems, paidCatalogueItems, type InvoiceTransport } from './catalogue-checkout';
import { beginTonCheckout, reconcilePendingTonOrders, tonDiscountPercent, tonEnabled, tonOrderStatus } from './catalogue-ton';
export type CatalogueDependencies = {
  db(): SupabaseClient;
  invoice?: InvoiceTransport;
  content?(path: string): Promise<string>;
  admin(): Promise<boolean>;
  preview(path: string, blur: number): Promise<Buffer>;
  videoPreview(path: string, blur: number): Promise<Buffer>;
  videoSources(path: string, blur: number): Promise<{ url: string; posterUrl: string; seconds: number }>;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const noCache = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" };
const limits = new Map<string, { until: number; count: number }>();
function json(value: unknown, status = 200) { return NextResponse.json(value, { status, headers: noCache }); }
function checked<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw new Error("Catalogue temporarily unavailable. Please try again.");
  return result.data;
}
function rateLimit(key: string, max: number) {
  const now = Date.now();
  if (limits.size > 5000) for (const [k, v] of limits) if (v.until < now) limits.delete(k);
  const v = limits.get(key);
  if (!v || v.until < now) { limits.set(key, { until: now + 60_000, count: 1 }); return; }
  if (++v.count > max) throw new Error("Please wait a moment before trying again.");
}

export function createCatalogueHandler(deps: CatalogueDependencies) {
return async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    if (!trustedFormOrigin(request)) return json({ error: "Untrusted request origin." }, 403);
    if (Number(request.headers.get("content-length")) > 16_384) return json({ error: "Request too large." }, 413);
    const raw = await request.text();
    if (raw.length > 16_384) return json({ error: "Request too large." }, 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { return json({ error: "Invalid request." }, 400); }
    if (!body || typeof body !== "object") return json({ error: "Invalid request." }, 400);
    const { slug } = await context.params;
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) return json({ error: "Catalogue not found." }, 404);
    const db = deps.db();
    // Identity resolution only; credentials never enter the returned projection.
    const clone = checked(await db.from("clones").select("id,name,slug,bot_token,browse_enabled,photos_enabled,videos_enabled,bundles_enabled,business_username,status")
      .eq("slug", slug).maybeSingle());
    if (!clone || clone.status !== "active") return json({ error: "Catalogue unavailable." }, 404);
    const admin = body.preview === true && await deps.admin();
    // Operators can prepare a catalogue before any discovery messages are enabled.
    if (!admin && !clone.browse_enabled) return json({ error: "Catalogue unavailable." }, 404);
    let fan: any = null;
    if (!admin) {
      if (body.preview === true) return json({ error: "Sign in to the operator dashboard to preview." }, 401);
      const initData = request.headers.get("x-telegram-init-data") ?? "";
      if (initData.length > 12_000) return json({ error: "Invalid Telegram session." }, 401);
      let telegramId: number;
      try { telegramId = validateTelegramData(initData, clone.bot_token); }
      catch (e) { return json({ error: e instanceof Error ? e.message : "Invalid session." }, 401); }
      rateLimit(`fan:${clone.id}:${telegramId}`, 180);
      fan = checked(await db.from("users").select("id,telegram_id,clone_id,blocked_at,paused,minor_flagged_at,business_connection_id,last_message_received")
        .eq("clone_id", clone.id).eq("telegram_id", telegramId).maybeSingle());
      if (!catalogueEligible(fan)) return json({ error: "This catalogue is unavailable for this account." }, 403);
    }
    const settingsColumns = "blur_strength,enabled,mini_app_url,display_name,show_verified_badge,featured_bundle_id,presentation_variant,checkout_mode";
    // ton_wallet_address/ton_nanoton_per_star land in a migration that may not be applied
    // yet; fall back to the plain select so the catalogue keeps working either way.
    const settingsWithTon = await db.from("creator_catalogue_settings").select(`${settingsColumns},ton_wallet_address,ton_nanoton_per_star,ton_discount_percent`).eq("clone_id", clone.id).maybeSingle();
    const settings: (Record<string, any> & { ton_wallet_address?: string | null; ton_nanoton_per_star?: number | null }) | null =
      settingsWithTon.error?.code === '42703'
        ? checked(await db.from("creator_catalogue_settings").select(settingsColumns).eq("clone_id", clone.id).maybeSingle())
        : checked(settingsWithTon);
    if (!admin && !settings?.enabled) return json({ error: "This catalogue is not open yet." }, 403);
    const blur = validBlur(settings?.blur_strength) ? settings.blur_strength : DEFAULT_BLUR;
    const action = body.action;
    const invoiceCheckout = checkoutMode(settings?.checkout_mode) === 'invoice';
    if (action === 'catalogue' && fan && !admin && invoiceCheckout && tonEnabled(settings)) {
      try { await reconcilePendingTonOrders({db,clone,fan}); } catch { /* never block the catalogue on chain lookups */ }
    }
    if (['checkout','checkout_status','content'].includes(String(action))) {
      if (admin || !fan) return json({error:'Owner preview cannot purchase or unlock content.'},403);
      if (!invoiceCheckout) return json({error:'In-app checkout is not enabled for this collection.'},403);
      const checkoutContext = {db,clone,fan};
      if(action === 'checkout') {
        rateLimit(`checkout:${fan.id}`,20);
        return json(await beginCatalogueCheckout(checkoutContext,body,deps.invoice));
      }
      if(action === 'checkout_status') {
        if(typeof body.orderId!=='string')return json({error:'Invalid checkout request.'},400);
        return json(await catalogueOrderStatus(checkoutContext,body.orderId));
      }
      if(!['photo','video'].includes(String(body.type))||typeof body.id!=='string'||!deps.content)
        return json({error:'Item not found.'},404);
      const path=await catalogueContentPath(checkoutContext,body.type as 'photo'|'video',body.id);
      return json({type:body.type,url:await deps.content(path)});
    }
    if (['ton_checkout','ton_status'].includes(String(action))) {
      if (admin || !fan) return json({error:'Owner preview cannot purchase or unlock content.'},403);
      if (!invoiceCheckout) return json({error:'In-app checkout is not enabled for this collection.'},403);
      if (!tonEnabled(settings)) return json({error:'Pay with TON is not available for this collection.'},403);
      const checkoutContext = {db,clone,fan};
      if (action === 'ton_checkout') {
        rateLimit(`checkout:${fan.id}`,20);
        const result = await beginTonCheckout(checkoutContext,body,settings!);
        return json({ tonEnabled: true, ...result });
      }
      if (typeof body.orderId !== 'string') return json({error:'Invalid checkout request.'},400);
      const result = await tonOrderStatus(checkoutContext,body.orderId);
      return json({ tonEnabled: true, ...result });
    }
    if (action === "settings") {
      if (!admin) return json({ error: "Administrator access required." }, 403);
      if (!validBlur(body.blur)) return json({ error: "Blur must be an integer from 4 to 40." }, 400);
      const update: Record<string, unknown> = { clone_id: clone.id, blur_strength: body.blur };
      if (body.tonWalletAddress !== undefined) {
        const addr = typeof body.tonWalletAddress === 'string' ? body.tonWalletAddress.trim() : '';
        if (addr && !/^[A-Za-z0-9_-]{40,68}$/.test(addr)) return json({ error: "That does not look like a TON wallet address." }, 400);
        update.ton_wallet_address = addr || null;
      }
      if (body.tonPerStar !== undefined) {
        const raw = body.tonPerStar;
        const blank = raw === '' || raw === null;
        const n = Number(raw);
        if (!blank && (!Number.isFinite(n) || n <= 0)) return json({ error: "TON per Star must be a positive number." }, 400);
        update.ton_nanoton_per_star = blank ? null : Math.round(n * 1_000_000_000);
      }
      checked(await db.from("creator_catalogue_settings").upsert(update, { onConflict: "clone_id" }));
      return json({ blur: body.blur, saved: true });
    }
    if (action === "setup") {
      if (!admin) return json({ error: "Administrator access required." }, 403);
      const res = await fetch(`https://api.telegram.org/bot${clone.bot_token}/getMe`, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
      const me = await res.json();
      if (!me.ok) return json({ error: "Could not verify Telegram setup." }, 502);
      return json({ username: me.result.username, hasMainApp: me.result.has_main_web_app === true,
        appUrl: `${dashboardOrigin(request)}/catalogue/${slug}` });
    }
    if (action === "activate") {
      if (!admin) return json({ error: "Administrator access required." }, 403);
      const res = await fetch(`https://api.telegram.org/bot${clone.bot_token}/getMe`, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
      const me = await res.json();
      if (!me.ok || !me.result.has_main_web_app) return json({ error: "Set this catalogue as the Main Mini App in BotFather first." }, 409);
      const url = safeMiniAppUrl(`https://t.me/${me.result.username}?startapp`);
      if (!url) return json({ error: "Invalid app link." }, 400);
      checked(await db.from("creator_catalogue_settings").upsert({ clone_id: clone.id, blur_strength: blur, enabled: true, mini_app_url: url }));
      // Publish the verified app link before enabling discovery, so new creators
      // never receive the legacy text menu during catalogue setup.
      checked(await db.from("clones").update({ browse_enabled: true }).eq("id", clone.id));
      return json({ enabled: true, url });
    }
    if (action === "catalogue") {
      const bundleRows = checked(await db.from('catalogue_bundles').select('id,title,caption,photo_ids,price_stars,regular_stars').eq('clone_id',clone.id).eq('enabled',true).order('sort_order')) ?? [];
      const program = checked(await db.from('catalogue_loyalty_programs').select('points_cost,starts_at,reward_photo_ids,reward_video_ids,welcome_bonus_points').eq('clone_id',clone.id).eq('enabled',true).maybeSingle());
      const columns = "id,caption,auto_desc,teaser_caption,tags,star_value,is_free,created_at";
      const [photos, videos, received, purchases, nativePhotos, nativeVideos] = await Promise.all([
        clone.photos_enabled ? db.from("photos").select(columns).eq("clone_id", clone.id).order("created_at", { ascending: false }).limit(1000) : Promise.resolve({ data: [], error: null }),
        clone.videos_enabled ? db.from("videos").select(columns).eq("clone_id", clone.id).order("created_at", { ascending: false }).limit(1000) : Promise.resolve({ data: [], error: null }),
        fan ? db.from("user_received_media").select("media_type,media_id").eq("clone_id", clone.id).eq("user_id", fan.id).limit(1000) : Promise.resolve({ data: [], error: null }),
        fan ? (invoiceCheckout ? paidCatalogueItems(db,clone.id,fan.id).then(data=>({data,error:null})) : db.from("star_transactions").select("media_type,media_id").eq("clone_id", clone.id).eq("user_id", fan.id).eq("kind", "media").gt("amount_stars", 0).not("media_id", "is", null).order("paid_at", { ascending: false }).limit(1000)) : Promise.resolve({ data: [], error: null }),
        fan && invoiceCheckout ? nativeOwnedItems(db,fan.id,'photo') : Promise.resolve([]),
        fan && invoiceCheckout ? nativeOwnedItems(db,fan.id,'video') : Promise.resolve([]),
      ]);
      const owned = new Set((checked(received) ?? []).map((r: any) => `${r.media_type}:${r.media_id}`));
      const bought = new Set((checked(purchases) ?? []).map((r: any) => `${r.media_type}:${r.media_id}`));
      for(const id of nativePhotos)bought.add(`photo:${id}`);
      for(const id of nativeVideos)bought.add(`video:${id}`);
      const legacyBundleIds = new Set((checked(purchases) ?? []).filter((r:any)=>!String(r.invoice_payload??'').startsWith('catalogue_order_')).map((r:any)=>r.media_id));
      for (const b of bundleRows) if (bought.has(`bundle:${b.id}`) && legacyBundleIds.has(b.id)) for (const id of b.photo_ids) bought.add(`photo:${id}`);
      const tagsByKey = new Map<string, unknown>();
      for (const r of (checked(photos) ?? []) as any[]) tagsByKey.set(`photo:${r.id}`, r.tags);
      for (const r of (checked(videos) ?? []) as any[]) tagsByKey.set(`video:${r.id}`, r.tags);
      const items = [...(checked(photos) ?? []).filter((r: any) => catalogueItemVisible(r, slug)).map((r: any) => projectItem(r, "photo", bought.has(`photo:${r.id}`), owned.has(`photo:${r.id}`))),
        ...(checked(videos) ?? []).filter((r: any) => catalogueItemVisible(r, slug)).map((r: any) => projectItem(r, "video", bought.has(`video:${r.id}`), owned.has(`video:${r.id}`)))].filter(r => r.free || Number.isInteger(r.stars) && r.stars > 0);
      // Trending: rank by confirmed paid sales in the last 30 days. Only the rank leaves the server.
      try {
        const since = new Date(Date.now() - TRENDING_WINDOW_DAYS * 86_400_000).toISOString();
        const sales = checked(await db.from('star_transactions').select('id,media_type,media_id,telegram_id')
          .eq('clone_id', clone.id).eq('kind', 'media').gt('amount_stars', 0).gte('paid_at', since).limit(5000)) ?? [];
        const refunds = sales.length ? (checked(await db.from('star_transactions').select('id').eq('clone_id', clone.id)
          .in('id', sales.map((row: any) => `refund:${row.id}`))) ?? []).map((row: any) => row.id) : [];
        const ranks = trendingRanks(items, sales as TrendingSale[], refunds, bundleRows as any[]);
        for (const item of items) {
          const rank = ranks.get(`${item.type}:${item.id}`);
          if (rank) item.rank = rank;
          const emojis = tagEmojis(tagsByKey.get(`${item.type}:${item.id}`));
          if (emojis.length) item.emojis = emojis;
        }
      } catch { /* trending is decoration; never block the catalogue on it */ }
      items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      const bundles = clone.bundles_enabled ? bundleRows.map((b:any)=>projectBundle(b,items)).filter(Boolean) : [];
      const points = program && fan ? checked(await db.rpc('catalogue_reward_balance',{p_clone:clone.id,p_user:fan.id})) : null;
      const rewards = program ? { ...(points || {balance:program.welcome_bonus_points ?? 0,earned:0,spent:0,welcomeBonus:program.welcome_bonus_points ?? 0,cost:program.points_cost,startsAt:program.starts_at}),
        photoIds:clone.photos_enabled ? items.filter(p=>p.type==='photo'&&!p.purchased&&!p.received&&program.reward_photo_ids.includes(p.id)).map(p=>p.id) : [],
        videoIds:clone.videos_enabled ? items.filter(p=>p.type==='video'&&!p.purchased&&!p.received&&(program.reward_video_ids??[]).includes(p.id)).map(p=>p.id) : [] } : null;
      const username = String(clone.business_username ?? "").replace(/^@/, "");
      return json({ name: settings?.display_name?.trim() || clone.name, items, blur, admin, enabled: settings?.enabled === true,
        verified: settings?.show_verified_badge === true,
        presentation: cataloguePresentation(settings?.presentation_variant),
        checkoutMode: checkoutMode(settings?.checkout_mode),
        tonEnabled: tonEnabled(settings),
        tonNanotonPerStar: tonEnabled(settings) ? Number((settings as any).ton_nanoton_per_star) : null,
        tonDiscountPercent: tonEnabled(settings) ? tonDiscountPercent(settings as any) : 0,
        tonReturnUrl: typeof settings?.mini_app_url === 'string' && /^https:\/\/t\.me\//.test(settings.mini_app_url) ? settings.mini_app_url : null,
        ...(admin ? { tonWalletAddress: (settings as any)?.ton_wallet_address ?? '', tonPerStar: (settings as any)?.ton_nanoton_per_star ? (settings as any).ton_nanoton_per_star / 1_000_000_000 : null } : {}),
        featuredBundleId: bundles.find(b => b?.id === settings?.featured_bundle_id)?.id ?? null,
        canSend: !!fan?.business_connection_id && windowOpen(fan.last_message_received) && clone.status === "active",
        chatUrl: /^[a-zA-Z0-9_]{5,32}$/.test(username) ? `https://t.me/${username}` : null,
        purchaseNote: invoiceCheckout ? "Your purchases appear here. Tap an item to view the original." : "Purchases linked to catalogue items appear here. Your unlocked originals remain in your chat history.",
        bundlesAvailable: bundles.length>0, bundles, rewards });
    }
    if (action === "preview") {
      if (!['photo', 'video'].includes(String(body.type)) || typeof body.id !== "string" || !uuid.test(body.id) ||
        (body.type === 'video' ? !clone.videos_enabled : !clone.photos_enabled))
        return json({ error: "Preview unavailable." }, 404);
      // Requested strength is accepted only for an independently authenticated operator preview.
      let strength = admin && validBlur(body.blur) ? body.blur : blur;
      const video = body.type === 'video';
      const item = checked(await db.from(video ? 'videos' : 'photos').select("storage_path,caption").eq("clone_id", clone.id).eq("id", body.id).maybeSingle());
      if (!item?.storage_path || !catalogueItemVisible(item, slug)) return json({ error: "Preview unavailable." }, 404);
      // A photo the fan has paid for shows clear in the grid; everything else stays blurred.
      if (!video && !admin && fan && invoiceCheckout &&
        await catalogueContentPath({db,clone,fan},'photo',body.id).then(()=>true,()=>false)) strength = 0;
      try {
        if (video && body.delivery === 'native') return json(await deps.videoSources(item.storage_path, strength));
        const bytes = await (video ? deps.videoPreview : deps.preview)(item.storage_path, strength);
        return new NextResponse(new Uint8Array(bytes), { headers: { ...noCache, "Content-Type": video ? 'video/mp4' : 'image/webp' } });
      } catch (error) {
        const reason=error instanceof Error && /busy/i.test(error.message) ? 'busy' : 'render-failed';
        console.warn('catalogue_preview_failed', {type:video?'video':'photo',reason});
        return json({error:reason==='busy'?'Preview busy. Retrying shortly.':'Preview unavailable. Please try again.'},503);
      }
    }
    if (action === "status") {
      if (!fan || typeof body.id !== "string" || !uuid.test(body.id)) return json({ error: "Invalid request." }, 400);
      const result = checked(await db.from("catalogue_requests").select("id,status,result,created_at").eq("id", body.id).eq("clone_id", clone.id).eq("user_id", fan.id).maybeSingle());
      if (!result) return json({ error: "Request not found." }, 404);
      return json(result);
    }
    if (action === "request") {
      if(invoiceCheckout && body.type !== 'reward') return json({error:'Checkout has changed. Reopen the Mini App to pay and unlock here.'},409);
      if (admin || !fan) return json({ error: "Preview mode cannot send or purchase content." }, 403);
      if (!fan.business_connection_id || !windowOpen(fan.last_message_received) || clone.status !== "active")
        return json({ error: "Send a message in the creator's chat first, then reopen the catalogue." }, 409);
      if (!['photo', 'video','bundle','reward'].includes(String(body.type)) || typeof body.id !== 'string' || !uuid.test(body.id) ||
        typeof body.requestKey !== 'string' || !uuid.test(body.requestKey)) return json({ error: "Invalid item." }, 400);
      if (body.type === 'reward') {
        const rewardType=body.rewardType ?? 'photo';
        if(rewardType!=='photo' && rewardType!=='video') return json({error:'Invalid reward type.'},400);
        if(rewardType==='photo' ? !clone.photos_enabled : !clone.videos_enabled) return json({error:'Reward unavailable.'},404);
        if (slug === 'alanna-pow') {
          const reward = checked(await db.from(rewardType === 'video' ? 'videos' : 'photos').select('caption').eq('clone_id', clone.id).eq('id', body.id).maybeSingle());
          if (!catalogueItemVisible(reward, slug)) return json({error:'Reward unavailable.'},404);
        }
        rateLimit(`send:${fan.id}`,10);
        const claim=await db.rpc(rewardType==='video'?'catalogue_claim_video_reward':'catalogue_claim_reward',{p_clone:clone.id,p_user:fan.id,[rewardType==='video'?'p_video':'p_photo']:body.id,p_request:body.requestKey});
        if(claim.error) return json({error:'Reward not available. Refresh your points and check your chat before trying again.'},409);
        return json(claim.data);
      }
      if (body.type === 'bundle') {
        if(!clone.bundles_enabled || !clone.photos_enabled) return json({error:'Bundle unavailable.'},404);
        const b=checked(await db.from('catalogue_bundles').select('id,title,caption,photo_ids,price_stars,regular_stars').eq('clone_id',clone.id).eq('id',body.id).eq('enabled',true).maybeSingle());
        if(!b) return json({error:'Bundle unavailable.'},404);
        const p=checked(await db.from('photos').select('id,caption,star_value,is_free').eq('clone_id',clone.id).in('id',b.photo_ids));
        if(!projectBundle(b,(p??[]).filter((r:any)=>catalogueItemVisible(r,slug)).map((r:any)=>projectItem(r,'photo')))) return json({error:'Bundle price or contents changed. Please refresh.'},409);
        const owned=checked(await db.from('user_received_media').select('media_id').eq('clone_id',clone.id).eq('user_id',fan.id).eq('media_type','photo').in('media_id',b.photo_ids));
        const paid=checked(await db.from('star_transactions').select('media_id').eq('clone_id',clone.id).eq('telegram_id',fan.telegram_id).gt('amount_stars',0).in('media_id',[...b.photo_ids,b.id]));
        if(owned?.length||paid?.length) return json({error:'You already own content in this bundle. Choose individual items to avoid duplicates.'},409);
      } else {
      if (body.type === 'photo' ? !clone.photos_enabled : !clone.videos_enabled) return json({ error: "Item unavailable." }, 404);
      const table = body.type === 'photo' ? 'photos' : 'videos';
      const asset = checked(await db.from(table).select("id,caption,star_value,is_free").eq("clone_id", clone.id).eq("id", body.id).maybeSingle());
      if (!asset || !catalogueItemVisible(asset, slug) || (!asset.is_free && (!Number.isInteger(asset.star_value) || asset.star_value <= 0))) return json({ error: "Item unavailable." }, 404);
      const owned = checked(await db.from("user_received_media").select("id").eq("clone_id", clone.id).eq("user_id", fan.id).eq("media_type", body.type).eq("media_id", body.id).limit(1));
      if (owned?.length) return json({ error: "You already have this item in your chat history." }, 409);
      }
      rateLimit(`send:${fan.id}`, 10);
      // A network retry retains its key. Terminal failures require a fresh tap/key.
      const exact = checked(await db.from("catalogue_requests").select("id,status,result,media_type,media_id")
        .eq("id", body.requestKey).eq("clone_id", clone.id).eq("user_id", fan.id).maybeSingle());
      if (exact) {
        if (exact.media_type !== body.type || exact.media_id !== body.id) return json({ error: "Invalid request key." }, 409);
        return json({ id: exact.id, status: exact.status, result: exact.result });
      }
      const active = checked(await db.from("catalogue_requests").select("id,status,result,media_type,media_id")
        .eq("clone_id", clone.id).eq("user_id", fan.id).in("status", ["pending", "sending"]).limit(1));
      if (active?.length) {
        if (active[0].media_type !== body.type || active[0].media_id !== body.id) return json({ error: "Please wait for your current item to finish sending." }, 409);
        return json({ id: active[0].id, status: active[0].status, result: active[0].result });
      }
      // Delivered/uncertain outcomes are not replayed on a second device or tap.
      let previous = db.from("catalogue_requests").select("id,status,result").eq("clone_id", clone.id).eq("user_id", fan.id).eq("media_type", body.type).eq("media_id", body.id)
        .in("status", ["delivered", "uncertain"]);
      if (body.type !== 'bundle') previous=previous.gte('created_at',new Date(Date.now()-10*60_000).toISOString());
      const existing = checked(await previous.order("created_at", { ascending: false }).limit(1));
      if (existing?.length) return json({...existing[0],reused:true});
      const inserted = await db.from("catalogue_requests").insert({ id: body.requestKey, clone_id: clone.id, user_id: fan.id, media_type: body.type, media_id: body.id }).select("id,status,result").single();
      if (inserted.error?.code === '23505') {
        const prior = checked(await db.from("catalogue_requests").select("id,status,result").eq("clone_id", clone.id).eq("user_id", fan.id).eq("media_type", body.type).eq("media_id", body.id).order("created_at", { ascending: false }).limit(1));
        if (prior?.[0]) return json(prior[0]);
        return json({ error: "Please wait for your current item to finish sending." }, 409);
      }
      return json(checked(inserted));
    }
    return json({ error: "Unknown action." }, 400);
  } catch (error) {
    if(error instanceof CheckoutError)return json({error:error.message},error.status);
    // No credentials, raw SQL errors, file paths or fan data in client-facing failures.
    const text = error instanceof Error && /^(Please wait|Preview busy|Preview unavailable|Catalogue temporarily)/.test(error.message)
      ? error.message : "Catalogue temporarily unavailable. Please try again.";
    return json({ error: text }, 503);
  }
}

}
