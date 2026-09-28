import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { createCatalogueHandler } from '../lib/catalogue-api';
import { beginCatalogueCheckout, catalogueContentPath, catalogueOrderStatus } from '../lib/catalogue-checkout';

const id=(n:number)=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const clone={id:id(1),slug:'fixture',name:'Creator',bot_token:'1234:fixture',status:'active',browse_enabled:true,photos_enabled:true,videos_enabled:true,bundles_enabled:true};
const fan={id:id(2),clone_id:clone.id,telegram_id:42,business_connection_id:'creator-business',paused:false,blocked_at:null,minor_flagged_at:null};
let rows:Record<string,any[]>, invoiceCalls:any[], contentCalls:string[], owner:boolean;
function reset(){
  rows={clones:[clone],users:[fan],creator_catalogue_settings:[{clone_id:clone.id,enabled:true,checkout_mode:'invoice'}],
    photos:Array.from({length:5},(_,i)=>({id:id(10+i),clone_id:clone.id,caption:`Photo ${i+1}`,star_value:350,is_free:false,storage_path:`private/${i}.jpg`})),
    videos:[{id:id(20),clone_id:clone.id,caption:'Video',star_value:500,is_free:false,storage_path:'private/video.mp4'}],
    catalogue_bundles:[{id:id(30),clone_id:clone.id,title:'Collection',caption:'Five portraits',enabled:true,photo_ids:Array.from({length:5},(_,i)=>id(10+i)),price_stars:1400,regular_stars:1750}],
    star_transactions:[],user_received_media:[],catalogue_checkout_orders:[],catalogue_checkout_attempts:[]};
  invoiceCalls=[];contentCalls=[];owner=false;
}
const db:any={rpc:async(name:string,args:any)=>{
  assert.equal(name,'catalogue_owned_checkout_assets');
  const assets=rows.catalogue_checkout_orders.filter(o=>o.user_id===args.p_user&&o.status==='paid'&&rows.star_transactions.some(t=>t.id===o.charge_id&&t.invoice_payload===`catalogue_order_${o.id}`)&&!rows.star_transactions.some(t=>t.id===`refund:${o.charge_id}`))
    .flatMap(o=>args.p_type==='photo'&&o.media_type==='bundle'?o.photo_ids:o.media_type===args.p_type?[o.media_id]:[]);
  return {data:assets,error:null};
},from(table:string){
  const filters:((r:any)=>boolean)[]=[];let single=false,take=Infinity,selection='*',change:any,insert=false;
  const q:any={select(s='*'){selection=s;return q},eq(k:string,v:any){filters.push(r=>r[k]===v);return q},in(k:string,v:any[]){filters.push(r=>v.includes(r[k]));return q},gt(k:string,v:any){filters.push(r=>r[k]>v);return q},lte(k:string,v:any){filters.push(r=>r[k]<=v);return q},not(k:string,_:string,v:any){filters.push(r=>r[k]!==v);return q},order(){return q},limit(n:number){take=n;return q},maybeSingle(){single=true;return q},single(){single=true;return q},insert(v:any){change=v;insert=true;return q},update(v:any){change=v;return q},then(resolve:any,reject:any){
    try{
      if(insert){
        if(rows[table].some(r=>r.id===change.id||(table==='catalogue_checkout_orders'&&r.user_id===change.user_id&&r.media_id===change.media_id&&['pending','checkout'].includes(r.status))))return Promise.resolve({data:null,error:{code:'23505'}}).then(resolve,reject);
        rows[table].push({status:'pending',invoice_url:null,...change});
        filters.push(r=>r.id===change.id); // INSERT RETURNING returns only the new row.
      }else if(change)rows[table].filter(r=>filters.every(f=>f(r))).forEach(r=>Object.assign(r,change));
      const data=(rows[table]??[]).filter(r=>filters.every(f=>f(r))).slice(0,take).map(r=>selection==='*'?{...r}:Object.fromEntries(selection.split(',').map(k=>[k,r[k]])));
      return Promise.resolve({data:single?(data[0]??null):data,error:null}).then(resolve,reject);
    }catch(e){return Promise.reject(e).then(resolve,reject)}
  }};return q;
}};
const context={db,clone,fan};
const invoice=async(token:string,body:Record<string,unknown>)=>{assert.equal(token,clone.bot_token);invoiceCalls.push(body);return 'https://t.me/$test-invoice';};
function pay(orderId:string,charge='real-charge'){
  const order=rows.catalogue_checkout_orders.find(o=>o.id===orderId);order.status='paid';order.charge_id=charge;
  rows.star_transactions.push({id:charge,clone_id:clone.id,user_id:fan.id,kind:'media',amount_stars:order.amount_stars,media_type:order.media_type,media_id:order.media_id,invoice_payload:`catalogue_order_${order.id}`});
}
const handler=createCatalogueHandler({db:()=>db,admin:async()=>owner,invoice,content:async path=>{contentCalls.push(path);return 'https://storage.test/signed-original';},preview:async()=>Buffer.from('protected'),videoPreview:async()=>Buffer.from('protected'),videoSources:async()=>({url:'protected',posterUrl:'protected',seconds:5})});
function signed(){
  const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:42})});
  const secret=createHmac('sha256','WebAppData').update(clone.bot_token).digest();
  p.set('hash',createHmac('sha256',secret).update([...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n')).digest('hex'));return p.toString();
}
async function api(action:string,body:any={},init=signed()){
  return handler(new NextRequest('http://localhost:3001/api/catalogue/fixture',{method:'POST',headers:{origin:'http://localhost:3001','content-type':'application/json','x-telegram-init-data':init},body:JSON.stringify({action,...body})}),{params:Promise.resolve({slug:'fixture'})});
}
async function main(){
  reset();
  const request={type:'photo',id:id(10),requestKey:id(100),amount:1,paid:true};
  assert.equal((await api('checkout',request,'')).status,401,'unsigned payer denied');
  assert.equal((await api('content',{type:'photo',id:id(10)})).status,403,'unpaid original denied');
  assert.equal((await api('request',{type:'photo',id:id(10),requestKey:id(100)})).status,409,'Stale chat UI cannot enqueue paid media after native checkout activation');
  assert.equal(contentCalls.length,0);
  owner=true;assert.equal((await api('checkout',{...request,preview:true})).status,403,'owner cannot buy');owner=false;
  rows.creator_catalogue_settings[0].checkout_mode='chat';assert.equal((await api('checkout',request)).status,403,'other creator legacy flow unchanged');rows.creator_catalogue_settings[0].checkout_mode='invoice';
  const result=await (await api('checkout',request)).json();assert.equal(result.status,'pending');
  assert.equal(invoiceCalls[0].business_connection_id,'creator-business');assert.equal(invoiceCalls[0].currency,'XTR');
  assert.deepEqual(invoiceCalls[0].prices,[{label:'Photo',amount:350}],'client cannot set price');
  assert.equal(invoiceCalls[0].payload,`catalogue_order_${id(100)}`);
  assert.equal((await api('checkout',request)).status,200);assert.equal(invoiceCalls.length,1,'network retry reuses invoice');
  const second=await beginCatalogueCheckout(context,{...request,requestKey:id(101)},invoice);assert.equal(second.orderId,id(100),'second device reuses pending order');
  assert.equal((await catalogueOrderStatus(context,id(100))).status,'pending','client paid flag grants nothing');
  assert.equal((await api('checkout_status',{orderId:id(999)})).status,404);
  const otherFan={...fan,id:id(99),telegram_id:99};await assert.rejects(()=>catalogueOrderStatus({...context,fan:otherFan},id(100)),/not found/);
  pay(id(100));assert.equal((await catalogueOrderStatus(context,id(100))).status,'paid');
  const original=await (await api('content',{type:'photo',id:id(10)})).json();assert.equal(original.url,'https://storage.test/signed-original');assert.deepEqual(contentCalls,['private/0.jpg']);
  assert.equal((await api('content',{type:'video',id:id(10)})).status,404,'wrong media type denied');
  rows.star_transactions.push({id:'refund:real-charge',clone_id:clone.id,amount_stars:-350});
  assert.equal((await catalogueOrderStatus(context,id(100))).status,'refunded');
  assert.equal((await api('content',{type:'photo',id:id(10)})).status,403,'refund revokes original even before order state repair');
  reset();const bundle=await beginCatalogueCheckout(context,{type:'bundle',id:id(30),requestKey:id(110)},invoice);
  assert.equal(invoiceCalls[0].prices[0].amount,1400);assert.equal(rows.catalogue_checkout_orders[0].photo_ids.length,5);
  pay(bundle.orderId);rows.catalogue_bundles[0].photo_ids=[id(50),id(51),id(52),id(53),id(54)];
  assert.equal(await catalogueContentPath(context,'photo',id(14)),'private/4.jpg','bundle entitlement uses paid snapshot');
  await assert.rejects(()=>catalogueContentPath(context,'photo',id(50)),/not found/);
  reset();rows.photos[0].clone_id=id(999);assert.equal((await api('checkout',request)).status,404,'cross creator item denied');
  reset();rows.user_received_media.push({clone_id:clone.id,user_id:fan.id,media_type:'photo',media_id:id(10)});
  await assert.rejects(()=>beginCatalogueCheckout(context,request,invoice),/already own/,'received item cannot be charged twice');
  await assert.rejects(()=>catalogueContentPath(context,'photo',id(10)),/Purchase/,'received marker alone is not paid proof');
  reset();rows.photos[0].is_free=true;assert.equal(await catalogueContentPath(context,'photo',id(10)),'private/0.jpg');
  await assert.rejects(()=>beginCatalogueCheckout(context,request,invoice),/not available/,'free item never charged');
  reset();await assert.rejects(()=>beginCatalogueCheckout(context,request,async()=>{throw new Error('transport')}));
  assert.equal(rows.catalogue_checkout_orders.length,1);await beginCatalogueCheckout(context,request,invoice);assert.equal(rows.catalogue_checkout_orders.length,1,'invoice network failure preserves order');
  rows.catalogue_checkout_orders[0].status='checkout';const confirming=await beginCatalogueCheckout(context,request,invoice);assert.equal(confirming.status,'checkout');
  rows.catalogue_checkout_attempts.push({order_id:request.requestKey,created_at:new Date().toISOString()});
  assert.ok((await catalogueOrderStatus(context,request.requestKey)).retryAfterSeconds>0);
  rows.catalogue_checkout_attempts[0].created_at=new Date(Date.now()-61_000).toISOString();
  assert.equal((await catalogueOrderStatus(context,request.requestKey)).retryAfterSeconds,0,'Failed accepted payment can reopen the same invoice after reconciliation window');assert.equal(invoiceCalls.length,1,'reserved payment does not create another invoice');
  // The server completed the first request, but its response never reached the
  // browser. It knows only its original key when retrying after fifteen minutes.
  reset();await beginCatalogueCheckout(context,request,invoice);
  rows.catalogue_checkout_orders[0].expires_at=new Date(Date.now()-1).toISOString();
  const expired=await beginCatalogueCheckout(context,request,invoice);
  assert.deepEqual(expired,{orderId:request.requestKey,status:'expired'},'lost-response retry returns the expired order rather than reinserting its primary key');
  assert.equal(rows.catalogue_checkout_orders.length,1);
  assert.equal(invoiceCalls.length,1,'an expired retry never creates another invoice');
  assert.deepEqual(await beginCatalogueCheckout(context,request,invoice),expired,'terminal response is idempotent on repeated retries');
  const restarted=await beginCatalogueCheckout(context,{...request,requestKey:id(120)},invoice);
  assert.equal(restarted.status,'pending');assert.equal(restarted.orderId,id(120),'fresh key recovers checkout');
  assert.equal(rows.catalogue_checkout_orders.length,2);assert.equal(invoiceCalls.length,2);
  console.log('Native catalogue checkout checks passed: signed authentication, scope, exact server price, business binding, idempotency, ownership, bundle snapshots, refunds and protected originals. No live payment or fan message.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
