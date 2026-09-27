import assert from 'node:assert/strict';
import {rewardProgress,projectBundle} from '../lib/catalogue-commerce';
import { catalogueAppearance } from '../lib/catalogue-appearance';
import { createHmac } from 'node:crypto';
import sharp from 'sharp';
import { NextRequest } from 'next/server';
import { createCatalogueHandler } from '../lib/catalogue-api';
import { blurPreview } from '../lib/catalogue-preview';
import { validateTelegramData, projectItem, windowOpen, catalogueItemVisible } from '../lib/catalogue-core';
import { catalogueDisplayOrder } from '../lib/catalogue-display-order';

assert.equal(catalogueAppearance('briana-redd')?.profilePhoto, '/brand/catalogue/briana-redd-profile.webp');
assert.ok(catalogueAppearance('alanna-pow'), 'Alanna uses the same compact catalogue layout');
assert.equal(catalogueAppearance('unrelated-creator'), null, 'other creators retain their existing layout');

const cloneId='00000000-0000-0000-0000-000000000001', fanId='00000000-0000-0000-0000-000000000002';
const itemId='00000000-0000-0000-0000-000000000003', requestId='00000000-0000-0000-0000-000000000004';
const token='123456:test-only-token';
function sign(id=123456, age=0) {
  const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)-age),user:JSON.stringify({id,first_name:'Test'})});
  const secret=createHmac('sha256','WebAppData').update(token).digest();
  p.set('hash',createHmac('sha256',secret).update([...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n')).digest('hex'));
  return p.toString();
}
const clone={id:cloneId,slug:'test-creator',name:'Test Creator',bot_token:token,browse_enabled:true,photos_enabled:true,videos_enabled:false,bundles_enabled:false,business_username:'test_creator',status:'active'};
const fan={id:fanId,clone_id:cloneId,telegram_id:123456,blocked_at:null,paused:false,minor_flagged_at:null,business_connection_id:'test-business',last_message_received:new Date().toISOString()};
const photo={id:itemId,clone_id:cloneId,caption:'A portrait in a blue jacket',auto_desc:'',star_value:630,is_free:false,created_at:new Date().toISOString(),storage_path:'private-original.jpg'};
let rows:Record<string,any[]>;let owner=false;let rendered:{path:string;blur:number}|undefined;
function reset(){owner=false;rendered=undefined;rows={clones:[{...clone}],users:[{...fan}],photos:[{...photo}],videos:[],creator_catalogue_settings:[{clone_id:cloneId,enabled:true,blur_strength:16}],user_received_media:[],star_transactions:[],catalogue_requests:[],catalogue_bundles:[],catalogue_loyalty_programs:[]};}
let rpcCall:any=null;
const db:any={rpc:async(name:string,args:any)=>{rpcCall={name,args};return {data:{balance:2290,earned:1890,spent:0,welcomeBonus:400,cost:2500,startsAt:new Date().toISOString()},error:null};},from(table:string){
  const filters:Array<(r:any)=>boolean>=[];let single=false;let take=Infinity;let change:any;let selected='*';let insertion=false;let updating=false;
  const q:any={select(s='*'){selected=s;return q},eq(k:string,v:any){filters.push(r=>r[k]===v);return q},in(k:string,v:any[]){filters.push(r=>v.includes(r[k]));return q},gt(k:string,v:any){filters.push(r=>r[k]>v);return q},gte(k:string,v:any){filters.push(r=>r[k]>=v);return q},not(k:string,_op:string,v:any){filters.push(r=>r[k]!==v);return q},order(){return q},limit(n:number){take=n;return q},maybeSingle(){single=true;return q},single(){single=true;return q},insert(v:any){change=v;insertion=true;return q},upsert(v:any){change=v;return q},update(v:any){change=v;updating=true;return q},then(resolve:any,reject:any){
    try {
      if(change){if(updating){for(const row of rows[table].filter(r=>filters.every(f=>f(r))))Object.assign(row,change)}else if(insertion){rows[table].push({...change,status:'pending',created_at:new Date().toISOString()})}else{const row=rows[table].find(r=>r.clone_id===change.clone_id);if(row)Object.assign(row,change);else rows[table].push(change)}}
      const result=rows[table].filter(r=>filters.every(f=>f(r))).slice(0,take).map(r=>selected==='*'?{...r}:Object.fromEntries(selected.split(',').map(k=>[k,r[k]])));
      return Promise.resolve({data:single?(result[0]??null):result,error:null}).then(resolve,reject);
    }catch(e){return Promise.reject(e).then(resolve,reject)}
  }};return q;
}};
const post=createCatalogueHandler({db:()=>db,admin:async()=>owner,preview:async(path,blur)=>{rendered={path,blur};return Buffer.from('transformed-only')},videoPreview:async(path,blur)=>{rendered={path,blur};return Buffer.from('protected-video-only')},videoSources:async(path,blur)=>{rendered={path,blur};return {url:'https://storage.test/protected.mp4',posterUrl:'https://storage.test/protected.webp',seconds:5}}});
const origin='http://localhost:3107';
async function call(action:string,body:Record<string,unknown>={},init=sign(),source=origin){
 const slug=rows.clones[0]?.slug??'test-creator';
 const request=new NextRequest(`${origin}/api/catalogue/${slug}`,{method:'POST',headers:{origin:source,'content-type':'application/json','x-telegram-init-data':init},body:JSON.stringify({action,...body})});
 return post(request,{params:Promise.resolve({slug})});
}
async function main(){
 reset();assert.equal((await call('catalogue',{},'')).status,401);
 assert.equal((await call('catalogue',{},sign().replace('Test','Fake'))).status,401);
 assert.equal((await call('catalogue',{},sign(123456,7200))).status,401);
 assert.equal((await call('catalogue',{preview:true})).status,401);
 assert.equal((await call('catalogue',{},sign(),'https://untrusted.test')).status,403);
 assert.throws(()=>validateTelegramData(`${sign()}&user={}`,token));
 assert.equal(windowOpen(new Date(Date.now()+300000).toISOString()),false);
 reset();rows.users[0].minor_flagged_at=new Date().toISOString();assert.equal((await call('catalogue')).status,403);
 reset();rows.clones[0].status='paused';assert.equal((await call('catalogue')).status,404);
 reset();rows.clones[0].browse_enabled=false;rows.creator_catalogue_settings[0].enabled=false;
 assert.equal((await call('catalogue')).status,404,'unpublished catalogue is blocked for fans');
 assert.equal((await call('catalogue',{preview:true})).status,404,'preview flag does not grant operator access');
 owner=true;assert.equal((await call('catalogue',{preview:true})).status,200,'operator can prepare without enabling discovery');
 assert.equal(rows.clones[0].browse_enabled,false);
  const originalFetch=globalThis.fetch;
 try {
  globalThis.fetch=async()=>Response.json({ok:true,result:{username:'test_catalogue_bot',has_main_web_app:false}});
  assert.equal((await call('activate',{preview:true})).status,409);
  assert.equal(rows.clones[0].browse_enabled,false);assert.equal(rows.creator_catalogue_settings[0].enabled,false);
  globalThis.fetch=async()=>Response.json({ok:true,result:{username:'test_catalogue_bot',has_main_web_app:true}});
  assert.equal((await call('activate',{preview:true})).status,200);
  assert.equal(rows.creator_catalogue_settings[0].mini_app_url,'https://t.me/test_catalogue_bot?startapp');
  assert.equal(rows.clones[0].browse_enabled,true);assert.equal(rows.creator_catalogue_settings[0].enabled,true);
 } finally {globalThis.fetch=originalFetch;}
 reset();Object.assign(rows.creator_catalogue_settings[0],{display_name:'Alana Powell',show_verified_badge:true,featured_bundle_id:fanId,presentation_variant:'compact'});
 const styled=await (await call('catalogue')).json();
 assert.equal(styled.name,'Alana Powell');assert.equal(styled.verified,true);assert.equal(styled.presentation,'compact');
 assert.equal(styled.featuredBundleId,null,'foreign or unavailable featured bundles are not exposed');
 reset();const res=await call('catalogue');assert.equal(res.status,200);const data=await res.json();
 assert.equal(data.verified,false);assert.equal(data.featuredBundleId,null);assert.equal(data.name,clone.name);assert.equal(data.presentation,'standard');
 assert.equal(data.items[0].description,photo.caption);assert.equal(data.items[0].stars,630);assert.equal(data.items[0].purchased,false);
 for(const forbidden of ['bot_token','storage_path','business_connection_id','telegram_id']) assert(!JSON.stringify(data).includes(forbidden));
 assert.equal(projectItem({...photo,caption:'   ',auto_desc:'Fallback'},'photo').description,'Fallback');
 assert.equal((await call('settings',{blur:4})).status,403);
 assert.equal((await call('preview',{type:'photo',id:itemId,blur:4})).status,200);assert.equal(rendered?.blur,16,'fan cannot lower blur');
 assert.equal((await call('preview',{type:'photo',id:cloneId})).status,404);
 // Videos share signed identity, creator scope, feature gates and server-enforced blur.
 assert.equal((await call('preview',{type:'video',id:itemId})).status,404);
 rows.clones[0].videos_enabled=true;rows.videos.push({...photo,storage_path:'private-video.mp4'});
 const clip=await call('preview',{type:'video',id:itemId,blur:0,start:100,duration:999});
 assert.equal(clip.status,200);assert.equal(clip.headers.get('content-type'),'video/mp4');
 assert.equal(await clip.text(),'protected-video-only');assert.equal(rendered?.blur,16);assert.equal(rendered?.path,'private-video.mp4');
 const native=await call('preview',{type:'video',id:itemId,blur:0,delivery:'native'});
 assert.equal(native.status,200);assert.deepEqual(await native.json(),{url:'https://storage.test/protected.mp4',posterUrl:'https://storage.test/protected.webp',seconds:5});assert.equal(rendered?.blur,16);
 assert.equal((await call('preview',{type:'video',id:itemId},'')).status,401);
 rows.videos[0].clone_id=fanId;assert.equal((await call('preview',{type:'video',id:itemId})).status,404);
 rows.videos[0].clone_id=cloneId;rows.users[0].minor_flagged_at='flagged';assert.equal((await call('preview',{type:'video',id:itemId})).status,403);rows.users[0].minor_flagged_at=null;
 rows.clones[0].videos_enabled=false;
 owner=true;assert.equal((await call('preview',{preview:true,type:'photo',id:itemId,blur:6})).status,200);assert.equal(rendered?.blur,6);
 assert.equal((await call('settings',{preview:true,blur:0})).status,400);
 assert.equal((await call('settings',{preview:true,blur:30})).status,200);assert.equal(rows.creator_catalogue_settings[0].enabled,true);
 assert.equal((await call('request',{preview:true,type:'photo',id:itemId,requestKey:requestId})).status,403);
 reset();rows.users[0].last_message_received=new Date(Date.now()-25*3600000).toISOString();assert.equal((await call('request',{type:'photo',id:itemId,requestKey:requestId})).status,409);assert.equal(rows.catalogue_requests.length,0);
 reset();const request={type:'photo',id:itemId,requestKey:requestId};assert.equal((await call('request',request)).status,200);assert.equal(rows.catalogue_requests.length,1);
 await call('request',request);assert.equal(rows.catalogue_requests.length,1,'network retry must not enqueue twice');
 await call('request',{...request,requestKey:cloneId});assert.equal(rows.catalogue_requests.length,1,'double tap must not enqueue twice');
 rows.catalogue_requests[0].status='uncertain';await call('request',{...request,requestKey:cloneId});assert.equal(rows.catalogue_requests.length,1,'uncertain send must not replay');
 reset();rows.catalogue_requests.push({id:requestId,clone_id:cloneId,user_id:'another-fan',status:'delivered'});assert.equal((await call('status',{id:requestId})).status,404);
 reset();rows.catalogue_loyalty_programs.push({clone_id:cloneId,enabled:true,points_cost:2500,welcome_bonus_points:400,starts_at:new Date().toISOString(),reward_photo_ids:[itemId],reward_video_ids:[requestId]});
 const loyalty=await (await call('catalogue')).json();assert.equal(loyalty.rewards.balance,2290);assert.equal(loyalty.rewards.earned,1890);assert.equal(loyalty.rewards.welcomeBonus,400);assert.equal(rpcCall.args.p_user,fanId);assert.equal(rpcCall.args.p_clone,cloneId);assert.equal(rewardProgress(loyalty.rewards).remaining,210);assert.equal(rewardProgress({...loyalty.rewards,balance:-500}).percent,0);assert.equal(rewardProgress({...loyalty.rewards,balance:6000}).percent,100);
 assert.equal((await (await call('catalogue')).json()).rewards.balance,2290,'reopening must not add another bonus to the server balance');
 assert.deepEqual(rewardProgress({...loyalty.rewards,balance:400}),{percent:16,remaining:2100,ready:false});
 assert.equal(rewardProgress({...loyalty.rewards,balance:2499}).ready,false);assert.equal(rewardProgress({...loyalty.rewards,balance:2500}).ready,true);
 owner=true;const ownerRewards=(await (await call('catalogue',{preview:true})).json()).rewards;assert.equal(ownerRewards.balance,400);assert.equal(ownerRewards.welcomeBonus,400);assert.equal(ownerRewards.earned,0);owner=false;
 await call('request',{type:'reward',id:itemId,requestKey:requestId,userId:'someone-else',points:0});assert.equal(rpcCall.name,'catalogue_claim_reward');assert.equal(rpcCall.args.p_user,fanId);assert.equal(rpcCall.args.p_photo,itemId);assert.equal(rpcCall.args.points,undefined);
 rows.clones[0].videos_enabled=true;rows.videos.push({...photo,id:requestId});
 const videoRewards=await (await call('catalogue')).json();assert.deepEqual(videoRewards.rewards.videoIds,[requestId]);
 await call('request',{type:'reward',rewardType:'video',id:requestId,requestKey:cloneId,userId:'other',points:1});assert.equal(rpcCall.name,'catalogue_claim_video_reward');assert.equal(rpcCall.args.p_video,requestId);assert.equal(rpcCall.args.p_user,fanId);assert.equal(rpcCall.args.points,undefined);
 rows.user_received_media.push({clone_id:cloneId,user_id:fanId,media_type:'video',media_id:requestId});assert.deepEqual((await (await call('catalogue')).json()).rewards.videoIds,[]);
 rows.clones[0].videos_enabled=false;assert.equal((await call('request',{type:'reward',rewardType:'video',id:requestId,requestKey:cloneId})).status,404);
 assert.equal((await call('request',{type:'reward',rewardType:'other',id:requestId,requestKey:cloneId})).status,400);
 reset();const ids=Array.from({length:5},(_,i)=>`00000000-0000-0000-0000-${String(i+40).padStart(12,'0')}`);rows.photos=ids.map(id=>({...photo,id}));rows.clones[0].bundles_enabled=true;
 const bundle={id:requestId,clone_id:cloneId,enabled:true,title:'Five photo bundle',photo_ids:ids,price_stars:2200,regular_stars:3150};rows.catalogue_bundles.push(bundle);
 const bundleData=await (await call('catalogue')).json();assert.equal(bundleData.bundles.length,1);assert.equal(bundleData.bundles[0].stars,2200);assert.equal(projectBundle({...bundle,price_stars:1},bundleData.items),null);
 assert.equal((await call('request',{type:'bundle',id:requestId,requestKey:itemId,stars:1})).status,200);assert.equal(rows.catalogue_requests[0].media_type,'bundle');
 rows.catalogue_requests[0].status='delivered';rows.catalogue_requests[0].created_at='2020-01-01T00:00:00Z';await call('request',{type:'bundle',id:requestId,requestKey:cloneId});assert.equal(rows.catalogue_requests.length,1,'a delivered bundle never generates a second payable card');
 rows.user_received_media.push({clone_id:cloneId,user_id:fanId,media_type:'photo',media_id:ids[0]});assert.equal((await call('request',{type:'bundle',id:requestId,requestKey:cloneId})).status,409);
 // Alanna's missing captions are hidden, not deleted, including cached actions.
 for(const caption of [null,undefined,'','  \n\t',42]) assert.equal(catalogueItemVisible({caption},'alanna-pow'),false);
 assert.equal(catalogueItemVisible({caption:' Saved caption '},'alanna-pow'),true);
 assert.equal(catalogueItemVisible({caption:null},'briana-redd'),true,'Bri keeps her existing publishing rules');
 reset();rows.clones[0].slug='alanna-pow';rows.clones[0].videos_enabled=true;rows.clones[0].bundles_enabled=true;
 rows.photos=ids.map(id=>({...photo,id}));rows.photos[0].caption=null;rows.photos[0].auto_desc='Imported folder label';rows.photos[0].teaser_caption='A separate teaser is not a saved caption';
 rows.videos=[{...photo,id:requestId,caption:'   ',auto_desc:'Imported video label'},{...photo,id:cloneId,caption:'A captioned video'}];
 rows.catalogue_bundles.push({...bundle,photo_ids:ids});
 rows.catalogue_loyalty_programs.push({clone_id:cloneId,enabled:true,points_cost:2500,welcome_bonus_points:400,starts_at:new Date().toISOString(),reward_photo_ids:ids,reward_video_ids:[requestId,cloneId]});
 const before=JSON.stringify({photos:rows.photos,videos:rows.videos});
 const captioned=await (await call('catalogue')).json();
 assert.equal(captioned.items.length,5);assert(!captioned.items.some((i:any)=>i.id===ids[0]||i.id===requestId));
 assert.equal(captioned.bundles.length,0,'a bundle cannot advertise a hidden member');
 assert.deepEqual(captioned.rewards.photoIds,ids.slice(1));assert.deepEqual(captioned.rewards.videoIds,[cloneId]);
 assert.equal(JSON.stringify({photos:rows.photos,videos:rows.videos}),before,'catalogue filtering never mutates uploads');
 for(const [type,id] of [['photo',ids[0]],['video',requestId]]) {
   assert.equal((await call('preview',{type,id})).status,404);
   assert.equal((await call('request',{type,id,requestKey:itemId})).status,404);
   assert.equal((await call('request',{type:'reward',rewardType:type,id,requestKey:itemId})).status,404);
 }
 assert.equal((await call('request',{type:'bundle',id:requestId,requestKey:itemId})).status,409);
 assert.equal(rows.catalogue_requests.length,0,'hidden media cannot be queued from a stale page');
 rows.photos[0].caption='A newly saved caption';rows.videos[0].caption='A newly saved video caption';
 const restored=await (await call('catalogue')).json();assert.equal(restored.items.length,7);assert.equal(restored.bundles.length,1);
 // Mixed All grid: both formats in the opening row, spread throughout with no
 // missing/duplicated items; single-format tabs and Bri's chosen positions stay.
 for(const [photoCount,videoCount] of [[304,102],[2,20],[20,2],[1,1],[3,0],[0,3],[0,0]]) {
   const input=[...Array.from({length:photoCount},(_,i)=>projectItem({...photo,id:`p${i}`},'photo')),...Array.from({length:videoCount},(_,i)=>projectItem({...photo,id:`v${i}`},'video'))];
   const ordered=catalogueDisplayOrder(input,'alanna-pow',true);
   assert.equal(ordered.length,input.length);assert.equal(new Set(ordered.map(i=>`${i.type}:${i.id}`)).size,input.length);
   for(const type of ['photo','video']) assert.deepEqual(ordered.filter(i=>i.type===type),input.filter(i=>i.type===type));
   if(photoCount&&videoCount)assert.deepEqual(ordered.slice(0,2).map(i=>i.type),['photo','video']);
   if(photoCount===304)for(let start=0;start<ordered.length-12;start+=12)assert.equal(new Set(ordered.slice(start,start+12).map(i=>i.type)).size,2,'each page contains both types');
   assert.deepEqual(catalogueDisplayOrder(input,'alanna-pow',false),input);
 }
 const briIds=['20171234-7d0b-465f-8c6f-3496b509f415','bedb2ff6-bd23-4b21-b329-43ed3284cbd3','other','1be04367-92bf-4f74-aa98-6fd3b86d07b5','3a9c8e5a-f953-4fc2-bf93-ce2a6bce62a6'];
 assert.deepEqual(catalogueDisplayOrder(briIds.map(id=>projectItem({...photo,id},'video')),'briana-redd',true).map(i=>i.id),[briIds[1],briIds[4],briIds[2],briIds[0],briIds[3]]);
 // Real server transformation: strips metadata, limits size and changes pixels.
 const input=await sharp(Buffer.from('<svg width="840" height="840"><rect width="420" height="840" fill="red"/><rect x="420" width="420" height="840" fill="blue"/></svg>')).jpeg().withMetadata().toBuffer();
 const light=await blurPreview(input,6),heavy=await blurPreview(input,30);const meta=await sharp(heavy).metadata();
 assert.equal(meta.format,'webp');assert(meta.width!<=420 && meta.height!<=560);assert.equal(meta.exif,undefined);assert.notDeepEqual(light,heavy);assert.notDeepEqual(heavy,input);
 await assert.rejects(blurPreview(input,0));
 console.log('Catalogue checks passed: signed auth, expiry, origin, minor gate, scope, owner-only blur, original protection, captions, price, dedup and delivery window.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
