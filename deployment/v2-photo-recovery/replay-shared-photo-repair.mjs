// Real-model verification of the shared repair. Production-shaped requests and untouched
// responses, isolated catalogue/history copies, synthetic downloads and fake Telegram.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {config} from './src/config.ts';import {catalogueFromRaw,requestedAttrs,ALTERNATIVE_PHOTO_CAPTION} from './src/media.ts';
import {girlFromRow} from './src/girls/index.ts';import {renderParts,previewParts} from './src/girls/template.ts';import {runAs} from './src/context.ts';
import {saveChat,loadChat} from './src/memory.ts';import {priceFor} from './src/payments.ts';import {trimCaption} from './src/deliver.ts';
import {turnRig,installModelStub,restoreFetch} from './scripts/lib/turn-rig.ts';
const fixture=JSON.parse(fs.readFileSync('/fixture/evidence.json','utf8')), output=process.env.PROBE_OUTPUT_DIR;
const manifest=JSON.parse(process.env.CANDIDATE_HASHES),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const [p,h]of Object.entries(manifest))assert.equal(hash(fs.readFileSync(p)),h,'reviewed source: '+p);
assert.equal(config.model,'deepseek/deepseek-v4.1-flash');assert.deepEqual(config.providerOrder,['deepinfra/fp8','together']);
assert.equal(config.maxTokens,400);assert(config.openrouterKey);assert(!config.supabaseKey);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'shared-photo-model-'));config.dataDir=path.join(temp,'data');config.logDir=path.join(temp,'logs');
const realFetch=globalThis.fetch;installModelStub();const fakeFetch=globalThis.fetch;
const results=[],exchanges=[],privateLog=[];const write=process.stdout.write.bind(process.stdout),writeErr=process.stderr.write.bind(process.stderr);
process.stdout.write=(chunk,enc,cb)=>{privateLog.push(String(chunk));if(typeof enc==='function')enc();else cb?.();return true};
process.stderr.write=(chunk,enc,cb)=>{privateLog.push(String(chunk));if(typeof enc==='function')enc();else cb?.();return true};
let current,requests=0,rigSeq=0,randomSeed=1;
const originalRandom=Math.random;Math.random=()=>((randomSeed=(Math.imul(randomSeed,1664525)+1013904223)>>>0)/4294967296);
globalThis.fetch=async(url,init)=>{
 const u=new URL(String(url));if(u.origin!=='https://openrouter.ai')return fakeFetch(url,init);
 assert.equal(u.pathname,'/api/v1/chat/completions');assert(current);assert(requests<78);requests++;
 const body=JSON.parse(init.body);assert.equal(body.model,config.model);assert.equal(body.max_tokens,400);
 assert.deepEqual(body.provider.order,config.providerOrder);assert.equal(body.provider.allow_fallbacks,false);
 assert.equal(body.provider.require_parameters,true);assert.equal(body.reasoning.enabled,false);assert.equal(body.response_format.json_schema.name,'twin_reply');
 assert.deepEqual(body.messages.slice(1),current.history,'saved history and newest input unchanged');
 const ex={case:current.name,request:body};exchanges.push(ex);const response=await realFetch(url,init);
 ex.status=response.status;ex.response=await response.clone().json().catch(()=>null);return response;
};
const ID=6814483810,mediaMethods=new Set(['sendPaidMedia','sendPhoto','sendVideo']);
function make(profile,route,seed=null,empty=false,freeOnly=false){
 const source=fixture.catalogues[profile.id];assert(source);
 const rig=turnRig('simulated','shared-model-'+(++rigSeq));rig.deps.girl=girlFromRow({...profile,slug:rig.slug},()=>profile.v2_vars);
 const catalogue=catalogueFromRaw(source);rig.deps.catalogue=empty?[]:freeOnly?catalogue.filter(x=>x.kind==='photo'&&x.isFree).slice(0,1):catalogue;
 const state={rig,route,profile,owned:new Set(),downloads:[],verifications:[],timeoutNext:false};
 rig.deps.download=async item=>{state.downloads.push({key:item.key,path:item.storagePath});return Buffer.from('synthetic media:'+item.key);};
 rig.deps.verifyPhoto=async(key,storagePath,id)=>{state.verifications.push({key,storagePath,id});const item=rig.deps.catalogue.find(x=>x.key===key&&x.storagePath===storagePath);return {photo:item?{ok:true,item}:{ok:false,reason:'missing'},ownership:{ok:true,keys:new Set(state.owned),at:Date.now()}};};
 rig.tg.handlers.push(call=>{if(state.timeoutNext&&mediaMethods.has(call.method)){state.timeoutNext=false;return {err:new Error('synthetic transport timeout')};}});
 const chat=seed?structuredClone(seed):{ageConfirmed:true,epoch:0,history:[],sent:[]};
 if(chat.photo){chat.photo.mode='simulated';chat.photo.bcid=route.bcid;}chat.bcid=route.bcid;
 runAs(rig.slug,()=>saveChat(ID,chat));return state;
}
async function say(s,name,input,rules={}){
 const before=runAs(s.rig.slug,()=>loadChat(ID)),modelBefore=requests,dl=s.downloads.length,tgBefore=s.rig.tg.calls.length;
 current={name,history:[...before.history,{role:'user',content:input}].slice(-config.historyLimit)};await s.rig.fan(ID,input,s.route);
 const row=s.rig.rows().at(-1),actual=runAs(s.rig.slug,()=>loadChat(ID)),calls=s.rig.tg.calls.slice(tgBefore),media=calls.filter(c=>mediaMethods.has(c.method));
 const text=(row.final??[]).join(' '),prepared=(row.generated??[]).join(' '),choices=exchanges.filter(e=>e.case===name).at(-1)?.request.response_format.json_schema.schema.properties.selection.enum;
 const checks={oneModelRequest:requests-modelBefore===1,normalContract:!row.selectionError&&!row.delivery?.fixedLine,
  noMechanicalLabel:!/alternative photo, not an exact match|does not show:|YOUR CONTENT READY/.test(text),
  noFalseStock:!/i only got that one|(?:no more|out of) (?:photos|pics)/.test(text)||!s.rig.deps.catalogue.some(x=>x.kind==='photo'&&!before.sent.includes(x.key)),
  noRecoveryGuarantee:!/fixes it like every time|always fixes|definitely.*fix/.test(text),
  noVisibilityPromise:!/should be right there|must be.*chat/.test(text),
  completeCleanup:!/rather u just$/.test(text),oneMediaAction:media.length<=1,
  noJSONLeak:!/"selection"|"reply"/.test(text)};
 if(rules.photo)checks.requiredPhoto=rules.timeout?row.selectedMedia?.kind==='photo'&&media.length===1:!!row.media&&row.media.kind==='photo';
 if(rules.noMedia)checks.noMedia=media.length===0&&!row.selectedMedia;
 if(rules.ackKey)checks.exactReference=row.selectedMedia?.key===rules.ackKey&&row.media?.key===rules.ackKey;
 if(rules.different)checks.differentFile=rules.timeout?!!row.selectedMedia&&row.selectedMedia.key!==rules.different:!!row.media&&row.media.key!==rules.different;
 if(rules.requiredChoices)checks.requiredPhotoChoices=Array.isArray(choices)&&choices.length>0&&choices.every(x=>/^photo [1-9]|^free photo$/.test(x));
 if(rules.generic)checks.genericNotAlternative=!row.photoAlternative;
 if(row.selectedMedia){
  const item=s.rig.deps.catalogue.find(x=>x.key===row.selectedMedia.key);
  const slot=row.menu.find(x=>x.slot===row.selection);
  checks.slotIdentity=!!slot&&slot.key===item?.key;
  checks.freshDownload=s.downloads.slice(dl).some(x=>x.key===item?.key&&x.path===item?.storagePath);
  checks.correctPrice=row.selectedMedia.free?row.media?.stars===0:media[0]?.payload.star_count===priceFor(item?.stars,{cloneId:s.profile.id,telegramId:ID,kind:item?.kind});
  checks.captionMatches=(media[0]?.payload.caption??'')===trimCaption(prepared);
  checks.receiptMatches=rules.timeout?row.delivery.media.status==='unknown'&&actual.photo.status==='unknown':row.delivery.media.status==='acknowledged'&&actual.photo?.key===item?.key;
  if(row.photoAlternative)checks.truthfulAlternative=prepared.startsWith(ALTERNATIVE_PHOTO_CAPTION);
  if(rules.owned)checks.ownedUnlocked=row.media?.free===true&&media[0]?.method==='sendPhoto';
  if(rules.timeout)checks.noAutomaticRetry=media.length===1&&!row.delivery.media.retried;
 }
 const passed=Object.values(checks).every(Boolean);
 results.push({case:name,passed,selection:row.selection,selected:row.selectedMedia?.key??null,provider:row.provider,checks,failedChecks:Object.entries(checks).filter(([,v])=>!v).map(([k])=>k),photoAlternative:!!row.photoAlternative});
 fs.writeFileSync(path.join(output,'progress.json'),JSON.stringify({completed:results.length,requests,failed:results.filter(r=>!r.passed).map(r=>({case:r.case,failed:r.failedChecks}))}));
 return {row,photo:actual.photo,text,prepared};
}
const riley=fixture.profiles.find(x=>x.slug==='riley-mae-lewis'),routes=[{}, {bcid:'synthetic-shared-business'}];
const plan={version:'shared-photo-repair-1',original:['A','B','C'],sequence:['generic','different','owned-resend','refusal','timeout-new','missing-after-timeout','tone-change'],edges:['empty','no-reference','specific-unavailable','free-only','retained-greeting'],otherCreators:['kyla-yesenosky','mrs-callace','briana-redd'],routes:['ordinary','business'],normalTurns:39};
fs.writeFileSync(path.join(output,'plan.json'),JSON.stringify(plan));
try{
 for(const route of routes){
  const prefix=route.bcid?'business':'ordinary';
  for(const letter of plan.original){
   const original=fixture.incident.find(r=>r.case===letter),s=make(riley,route,original.chat);
   const rules=letter==='A'?{photo:true,ackKey:original.priorKey}:letter==='C'?{photo:true,different:original.priorKey,requiredChoices:true,generic:true}:{};
   await say(s,prefix+'-incident-'+letter,original.input,rules);s.rig.stop();
  }
  const s=make(riley,route,fixture.incident.find(r=>r.case==='C').chat);
  let r=await say(s,prefix+'-sequence-generic','Can you send me a new photo?',{photo:true,requiredChoices:true,generic:true});
  const first=r.photo?.key;
  r=await say(s,prefix+'-sequence-different','Can I have a different one',{photo:true,different:first,requiredChoices:true,generic:true});
  const second=r.photo?.key;
  if(second){s.owned.add(second);fs.writeFileSync(path.join(s.rig.dir,'_live_owned.json'),JSON.stringify({[ID]:[second]}));}
  await say(s,prefix+'-sequence-owned-resend','Send that same photo again',{photo:true,ackKey:second,owned:true});
  await say(s,prefix+'-sequence-refusal','No more photos please, just chat with me',{noMedia:true});
  s.timeoutNext=true;r=await say(s,prefix+'-sequence-timeout-new','Can you send me a new photo?',{photo:true,different:second,timeout:true,requiredChoices:true,generic:true});
  await say(s,prefix+'-sequence-missing-after-timeout',"the photo didn't come through",{photo:true,ackKey:r.photo?.key});
  await say(s,prefix+'-sequence-tone-change','I want a different tone in your replies. Just chat, no photos',{noMedia:true});s.rig.stop();
  for(const edge of plan.edges){
   const empty=edge==='empty',free=edge==='free-only',source=edge==='retained-greeting'?fixture.incident.find(r=>r.case==='B').chat:null;
   const t=make(riley,route,source,empty,free);
   const absent=['wand','plug','genitals'].find(w=>!t.rig.deps.catalogue.some(x=>x.words.has(w)))??'wand';
   const input=empty?'Can you send me a photo?':edge==='no-reference'?'Send that same photo again':edge==='specific-unavailable'?'Can you send a photo with a '+absent+'?':free?'Can you send me a free photo?':'Hey, how are you today?';
   const rules=empty||edge==='no-reference'||edge==='retained-greeting'?{noMedia:true}:free?{photo:true,requiredChoices:true,generic:true}:{};
   const out=await say(t,prefix+'-edge-'+edge,input,rules);
   if(edge==='specific-unavailable'&&out.row.selectedMedia&&!out.row.photoAlternative){results.at(-1).passed=false;results.at(-1).failedChecks.push('unavailableSpecificItemNeedsAlternative');}
   t.rig.stop();
  }
 }
 for(const slug of plan.otherCreators){
  const p=fixture.profiles.find(x=>x.slug===slug);assert(p);const s=make(p,{bcid:'synthetic-shared-business'});
  await say(s,slug+'-greeting','Hey, how are you today?',{noMedia:true});
  let r=await say(s,slug+'-generic-photo','Can you send me a photo?',{photo:true,requiredChoices:true,generic:true});
  await say(s,slug+'-different-photo','Can I have a different one',{photo:true,different:r.photo?.key,requiredChoices:true,generic:true});s.rig.stop();
 }
 const promptChecks=fixture.profiles.filter(p=>p.engine==='v2'&&p.status==='active').map(p=>({slug:p.slug,displayUsesSharedRenderer:JSON.stringify(previewParts(p.v2_vars))===JSON.stringify(renderParts(p.v2_vars)),emojiSettingRetained:!!p.v2_vars.EMOJIS}));
 const summary={candidate:process.env.CANDIDATE_SHA,completedAt:new Date().toISOString(),cases:results.length,requests,passed:results.every(r=>r.passed)&&promptChecks.every(p=>p.displayUsesSharedRenderer),passedCases:results.filter(r=>r.passed).length,sourceHashes:manifest,fixtureHash:hash(fs.readFileSync('/fixture/evidence.json')),profilesChecked:promptChecks,results,messagesSent:0,productionWrites:0,transport:'synthetic Telegram/downloads/ownership; real production-shaped conversation-model requests'};
 assert.equal(results.length,39);fs.writeFileSync(path.join(output,'model.summary.json'),JSON.stringify(summary,null,2));
 fs.writeFileSync(path.join(output,'model.exchanges.private.json'),JSON.stringify(exchanges));fs.writeFileSync(path.join(output,'model.rows.private.json'),JSON.stringify(privateLog));
 write('SHARED_REPAIR_MODEL_JSON '+JSON.stringify(summary)+'\n');
 if(!summary.passed)process.exitCode=1;
}finally{Math.random=originalRandom;globalThis.fetch=realFetch;restoreFetch();process.stdout.write=write;process.stderr.write=writeErr;fs.rmSync(temp,{recursive:true,force:true});}
