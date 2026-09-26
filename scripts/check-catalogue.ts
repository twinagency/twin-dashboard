import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import sharp from 'sharp';
import { NextRequest } from 'next/server';
import { createCatalogueHandler } from '../lib/catalogue-api';
import { blurPreview } from '../lib/catalogue-preview';
import { validateTelegramData, projectItem, windowOpen } from '../lib/catalogue-core';

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
function reset(){owner=false;rendered=undefined;rows={clones:[{...clone}],users:[{...fan}],photos:[{...photo}],videos:[],creator_catalogue_settings:[{clone_id:cloneId,enabled:true,blur_strength:16}],user_received_media:[],star_transactions:[],catalogue_requests:[]};}
const db:any={from(table:string){
  const filters:Array<(r:any)=>boolean>=[];let single=false;let take=Infinity;let change:any;let selected='*';let insertion=false;
  const q:any={select(s='*'){selected=s;return q},eq(k:string,v:any){filters.push(r=>r[k]===v);return q},in(k:string,v:any[]){filters.push(r=>v.includes(r[k]));return q},gt(k:string,v:any){filters.push(r=>r[k]>v);return q},gte(k:string,v:any){filters.push(r=>r[k]>=v);return q},not(k:string,_op:string,v:any){filters.push(r=>r[k]!==v);return q},order(){return q},limit(n:number){take=n;return q},maybeSingle(){single=true;return q},single(){single=true;return q},insert(v:any){change=v;insertion=true;return q},upsert(v:any){change=v;return q},then(resolve:any,reject:any){
    try {
      if(change){if(insertion){rows[table].push({...change,status:'pending',created_at:new Date().toISOString()})}else{const row=rows[table].find(r=>r.clone_id===change.clone_id);if(row)Object.assign(row,change);else rows[table].push(change)}}
      const result=rows[table].filter(r=>filters.every(f=>f(r))).slice(0,take).map(r=>selected==='*'?{...r}:Object.fromEntries(selected.split(',').map(k=>[k,r[k]])));
      return Promise.resolve({data:single?(result[0]??null):result,error:null}).then(resolve,reject);
    }catch(e){return Promise.reject(e).then(resolve,reject)}
  }};return q;
}};
const post=createCatalogueHandler({db:()=>db,admin:async()=>owner,preview:async(path,blur)=>{rendered={path,blur};return Buffer.from('transformed-only')}});
const origin='http://localhost:3107';
async function call(action:string,body:Record<string,unknown>={},init=sign(),source=origin){
 const request=new NextRequest(`${origin}/api/catalogue/test-creator`,{method:'POST',headers:{origin:source,'content-type':'application/json','x-telegram-init-data':init},body:JSON.stringify({action,...body})});
 return post(request,{params:Promise.resolve({slug:'test-creator'})});
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
 reset();const res=await call('catalogue');assert.equal(res.status,200);const data=await res.json();
 assert.equal(data.items[0].description,photo.caption);assert.equal(data.items[0].stars,630);assert.equal(data.items[0].purchased,false);
 for(const forbidden of ['bot_token','storage_path','business_connection_id','telegram_id']) assert(!JSON.stringify(data).includes(forbidden));
 assert.equal(projectItem({...photo,caption:'   ',auto_desc:'Fallback'},'photo').description,'Fallback');
 assert.equal((await call('settings',{blur:4})).status,403);
 assert.equal((await call('preview',{type:'photo',id:itemId,blur:4})).status,200);assert.equal(rendered?.blur,16,'fan cannot lower blur');
 assert.equal((await call('preview',{type:'photo',id:cloneId})).status,404);
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
 // Real server transformation: strips metadata, limits size and changes pixels.
 const input=await sharp(Buffer.from('<svg width="840" height="840"><rect width="420" height="840" fill="red"/><rect x="420" width="420" height="840" fill="blue"/></svg>')).jpeg().withMetadata().toBuffer();
 const light=await blurPreview(input,6),heavy=await blurPreview(input,30);const meta=await sharp(heavy).metadata();
 assert.equal(meta.format,'webp');assert(meta.width!<=420 && meta.height!<=560);assert.equal(meta.exif,undefined);assert.notDeepEqual(light,heavy);assert.notDeepEqual(heavy,input);
 await assert.rejects(blurPreview(input,0));
 console.log('Catalogue checks passed: signed auth, expiry, origin, minor gate, scope, owner-only blur, original protection, captions, price, dedup and delivery window.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
