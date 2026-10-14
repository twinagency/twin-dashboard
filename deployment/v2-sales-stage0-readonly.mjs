import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {config} from './src/config.ts';
import {render,validateVars} from './src/girls/template.ts';
import {loadRawCatalogue,catalogueFromRaw} from './src/media.ts';
const nativeFetch=globalThis.fetch;
globalThis.fetch=(url,opts={})=>{
  if((opts.method??'GET')!=='GET')throw new Error('read-only audit refused mutation');
  return nativeFetch(url,opts);
};
const project=new URL(config.supabaseUrl).hostname.split('.')[0];
if(project!=='aouaenqayfltoqrmpitg')throw new Error('unexpected database target');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const get=async route=>{
  const r=await fetch(config.supabaseUrl+'/rest/v1/'+route,{headers:{apikey:config.supabaseKey,Authorization:'Bearer '+config.supabaseKey},signal:AbortSignal.timeout(20000)});
  if(!r.ok)return {error:'HTTP '+r.status};
  return r.json();
};
const read=f=>{try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch{return null;}};
const commercial=p=>p.slice(p.indexOf('PHOTOS AND VIDEOS'),p.indexOf('HARD LIMITS'));
const fleet=read(path.join(config.dataDir,'_fleet.json'));
const cols='id,slug,status,engine,v2_vars,v2_credits_enabled,v2_credits_pack_quantity,v2_credits_pack_stars,v2_memory_enabled,tips_enabled,tip_max_stars,discounts_enabled,discount_max_photo,discount_max_video,discount_max_bundle,offer_pending_minutes,discount_slowdown_minutes,vision_model,photo_vision_model';
const rows=await get('clones?status=eq.active&select='+cols+'&order=slug');
if(!Array.isArray(rows))throw new Error('creator settings unreadable '+JSON.stringify(rows));
const creators=[];
for(const row of rows){
  const {v2_vars,...fields}=row;
  const rt=fleet?.girls?.[row.slug];
  const out={...fields,runtime:rt?{status:rt.status,credits:rt.credits?.applied??null,tips:rt.tips?.applied??null,memory:rt.memory?.enabled??null}:null};
  if(row.engine==='v2'){
    out.promptErrors=v2_vars?validateVars(v2_vars):['missing vars'];
    if(!out.promptErrors.length){
      const p=render(v2_vars,new Date(),{ageVerified:false});
      out.commercialPromptHash=sha(commercial(p));
      if(row.slug==='riley-mae-lewis')out.commercialPrompt=commercial(p);
    }
    try{
      const raw=await loadRawCatalogue(row.id); const all=catalogueFromRaw(raw);
      const eligible=all.filter(x=>!['pending','failed','needs_review'].includes(x.analysis));
      out.catalogue={photos:all.filter(x=>x.kind==='photo').length,videos:all.filter(x=>x.kind==='video').length,eligiblePhotos:eligible.filter(x=>x.kind==='photo').length,eligibleVideos:eligible.filter(x=>x.kind==='video').length,freePhotos:eligible.filter(x=>x.kind==='photo'&&x.isFree).length,freeVideos:eligible.filter(x=>x.kind==='video'&&x.isFree).length};
    }catch{out.catalogue={error:'catalogue read failed'};}
    const cached=read(path.join(config.dataDir,row.slug,'_bundle_exclusions.json'));
    out.bundleCache=cached?{at:cached.at,listed:cached.listed?.length??0,excluded:cached.excluded?.length??0}:null;
  }
  creators.push(out);
}
const sources={};
for(const f of ['src/girls/template.ts','src/media.ts','src/turn.ts','src/deliver.ts','src/memory.ts','src/payments.ts','src/fleet.ts','src/runner.ts','src/tips/policy.ts','dashboard/server.ts'])sources[f]=sha(fs.readFileSync(f));
const result={at:new Date().toISOString(),project,revision:process.env.GIT_SHA??null,bundles:process.env.V2_BUNDLES??null,starPrice:process.env.STAR_PRICE??null,model:config.model,providerOrder:config.providerOrder,mergeMs:config.mergeMs,fleetAt:fleet?.at??null,fleetAgeSeconds:fleet?.at?(Date.now()-Date.parse(fleet.at))/1000:null,creators,sources,readOnly:{databaseWrites:0,modelCalls:0,fanMessages:0,containerRestarts:0}};
console.log('SALES_STAGE0 '+JSON.stringify(result));
