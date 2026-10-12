import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {config} from './src/config.ts';import {runAs} from './src/context.ts';import {rest,toItem,currentPhoto,eligible} from './src/media.ts';import {loadOwnershipRead,ownershipState,priceFor} from './src/payments.ts';import {render,renderParts,previewParts,validateVars} from './src/girls/template.ts';
assert.equal(process.env.STAR_PRICE,'real');
config.dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'photo-boundary-'));
const rows=JSON.parse(fs.readFileSync('/private/fleet-settings.json','utf8'));
const results=[],now=new Date('2026-10-12T14:50:00Z');
for(const row of rows){
 assert.equal(validateVars(row.v2_vars).length,0);
 const expected=render(row.v2_vars,now);
 assert.equal(renderParts(row.v2_vars,now).filter(x=>!x.optional).map(x=>x.text).join(''),expected);
 assert.equal(previewParts(row.v2_vars,now).filter(x=>!x.optional).map(x=>x.text).join(''),expected);
 const photos=await rest('photos',row.id),items=photos.map(x=>toItem('photo',x)),it=items.find(eligible);
 assert(it);assert(items.every(x=>x.storagePath.startsWith(row.id+'/')));
 const fresh=await currentPhoto(row.id,it);assert(fresh&&fresh.key===it.key&&fresh.storagePath===it.storagePath&&eligible(fresh));
 let ownership;
 if(['riley-mae-lewis','kyla-yesenosky'].includes(row.slug)){
  const d=path.join(config.dataDir,row.slug);fs.mkdirSync(d,{recursive:true});
  for(const f of ['purchases.jsonl','_bundle_offers.jsonl']){
   const p=path.join('/live-data',row.slug,f);if(fs.existsSync(p))fs.copyFileSync(p,path.join(d,f));
  }
  ownership=await runAs(row.slug,async()=>{const read=await loadOwnershipRead(row.id,6814483810,Date.now(),true);assert(read.ok&&read.source==='fresh',read.note);const own=ownershipState(6814483810);assert(own.complete);return {fresh:true,complete:true,locallyResolvedKeys:own.keys.size};});
  assert.equal(priceFor(2700,{cloneId:row.id,telegramId:6814483810,kind:'photo'}),5);
  assert.equal(priceFor(2700,{cloneId:row.id,telegramId:6814483811,kind:'photo'}),2700);
  assert.equal(priceFor(2700,{cloneId:row.id,telegramId:6814483810,kind:'video'}),2700);
 }else assert.equal(priceFor(2700,{cloneId:row.id,telegramId:6814483810,kind:'photo'}),2700);
 results.push({creator:row.slug,photos:photos.length,freshTarget:true,creatorPathsValid:true,promptDisplayEqual:true,...(ownership?{ownership}:{})});
}
console.log(JSON.stringify({checkedAt:new Date().toISOString(),candidate:'bcc68c7e801ad65310f43f4a4ce09f05d3e3b4f7',readOnlyProduction:true,localCache:'isolated temporary directory',results,modelCalls:0,telegramSends:0}));
