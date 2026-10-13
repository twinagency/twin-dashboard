// Actual deployed V2 handlers/queue/model/selection/delivery; isolated files and fake external writes.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {Bot} from 'grammy';import {config} from './src/config.ts';
import {catalogueFromRaw,requestedAttrs} from './src/media.ts';import {resolveBundles} from './src/bundles.ts';
import {girlFromRow} from './src/girls/index.ts';import {renderParts,previewParts} from './src/girls/template.ts';
import {runAs} from './src/context.ts';import {saveChat,loadChat} from './src/memory.ts';import {priceFor} from './src/payments.ts';
import {createTurnQueue,registerHandlers} from './src/runner.ts';import {trimCaption} from './src/deliver.ts';
import {FakeTg,installModelStub,M} from './scripts/lib/turn-rig.ts';
import {TipRuntime,createTipClient,createTipState,tipSettingsFromRow} from './src/tips/index.ts';
import {createReceiptInbox} from './src/credits/inbox.ts';import {fakeDb} from './scripts/lib/tip-fakes.ts';
const fixturePath=process.env.SIM_FIXTURE??'/fixture/evidence.json',fixture=JSON.parse(fs.readFileSync(fixturePath,'utf8')),slug=process.env.SIM_CREATOR,out=process.env.PROBE_OUTPUT_DIR??'/out';
const profile=fixture.profiles.find(p=>p.slug===slug);assert(profile?.engine==='v2');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const [p,h]of Object.entries(fixture.sourceHashes))assert.equal(hash(fs.readFileSync(p)),h,'deployed bytes '+p);
assert(config.openrouterKey&&!config.supabaseKey&&!config.telegramToken);assert.equal(config.maxTokens,400);
assert(!profile.v2_memory_enabled&&!profile.v2_credits_enabled,'Enabled memory/credit requires its own faithful runtime');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'fleet-sim-'));config.dataDir=path.join(temp,'data');config.logDir=path.join(temp,'logs');config.mergeMs=5;
const realFetch=globalThis.fetch;installModelStub();const fakeFetch=globalThis.fetch;
const write=process.stdout.write.bind(process.stdout),errWrite=process.stderr.write.bind(process.stderr),logs=[];
process.stdout.write=(c,e,cb)=>{logs.push(String(c));if(typeof e==='function')e();else cb?.();return true};
process.stderr.write=(c,e,cb)=>{logs.push(String(c));if(typeof e==='function')e();else cb?.();return true};
const cat=catalogueFromRaw(fixture.catalogues[profile.id]);
const cached=fixture.bundleCache?.[slug],listed=new Set((cached?.listed??[]).map(x=>x.id));
const resolved=await resolveBundles((fixture.bundles[profile.id]??[]).filter(b=>listed.has(b.id)),fixture.catalogues[profile.id],cat,profile.id);
const book={...resolved,at:Date.now(),ok:!!cached};
const results=[],exchanges=[],privateTurns=[],rigs=[];let current,requests=0,seq=0,updateId=1000;
let seed=[...slug].reduce((a,c)=>Math.imul(a,31)+c.charCodeAt(0),17)>>>0;const oldRandom=Math.random;
Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
globalThis.fetch=async(url,init)=>{
 const u=new URL(String(url));if(u.origin!=='https://openrouter.ai')return fakeFetch(url,init);
 assert.equal(u.pathname,'/api/v1/chat/completions');assert(current);assert(requests<70,'bounded calls');requests++;
 const body=JSON.parse(init.body);assert.equal(body.model,config.model);assert.equal(body.max_tokens,config.maxTokens);
 assert.deepEqual(body.provider.order,config.providerOrder);assert.equal(body.provider.allow_fallbacks,false);
 assert.equal(body.reasoning.enabled,false);assert.equal(body.response_format.json_schema.name,'twin_reply');
 assert.deepEqual(body.messages.slice(1),current.history,'real accumulated history passed unchanged');
 const ex={case:current.name,request:body};exchanges.push(ex);
 if(process.env.SIM_DRY_RUN==='1'){M.rawStructured=true;const choices=body.response_format.json_schema.schema.properties.selection.enum;M.reply=JSON.stringify({reply:'Alex lives in Brisbane.',selection:choices.includes('none')?'none':choices[0]});}
 const res=await (process.env.SIM_DRY_RUN==='1'?fakeFetch:realFetch)(url,init);
 ex.status=res.status;ex.response=await res.clone().json().catch(()=>null);return res;
};
const ID=6814483810,mediaMethods=new Set(['sendPhoto','sendVideo','sendPaidMedia']);
const ME={id:1,is_bot:true,first_name:'Simulation',username:'isolated_sim_bot',can_join_groups:false,can_read_all_group_messages:false,supports_inline_queries:false,can_connect_to_business:true,has_main_web_app:false};
function make(route,override){
 const localSlug=slug+'-simulation-'+(++seq),dir=path.join(config.dataDir,localSlug);let active=true;
 const bot=new Bot('1:fake',{botInfo:ME}),tg=new FakeTg(bot.api),girl=girlFromRow({...profile,slug:localSlug},()=>profile.v2_vars);
 const state={slug:localSlug,dir,route,bot,tg,owned:new Set(),downloads:[],verifyFailure:false,transportFailure:null};
 const tipDb=fakeDb({enabled:profile.tips_enabled===true,max:tipSettingsFromRow(profile).maxStars});
 const tips=new TipRuntime({client:createTipClient({transport:tipDb.transport,creatorId:profile.id,botId:1,owner:'isolated-simulation',log:()=>{},timeoutMs:400}),
  inbox:createReceiptInbox({file:()=>path.join(dir,'_tip_receipts.jsonl'),log:()=>{}}),state:createTipState({file:()=>path.join(dir,'_tip_state.jsonl'),log:()=>{}}),
  api:bot.api,isActive:()=>active,current:(c,e)=>runAs(localSlug,()=>loadChat(c).epoch===e),log:()=>{}});tips.applySettings(profile);
 const deps={girl,catalogue:override??cat,api:bot.api,wait:async()=>{},now:Date.now,mode:'simulated',isActive:()=>active,tips,
  loadOwnership:async()=> 'cached',download:async it=>{state.downloads.push({key:it.key,path:it.storagePath});return Buffer.from('synthetic-media');},
  verifyPhoto:async(key,p)=>{const it=deps.catalogue.find(x=>x.key===key&&x.storagePath===p);return {photo:it?{ok:true,item:it}:{ok:false,reason:'missing'},ownership:state.verifyFailure?{ok:false,reason:'synthetic ownership read failed'}:{ok:true,keys:new Set(state.owned),at:Date.now()}};},
  bundles:()=>override?{bundles:[],excluded:[],at:Date.now(),ok:true}:book,bundleOffers:{persist:async()=>{},outcome:async()=>{}}};
 const q=createTurnQueue(deps,5);state.q=q;state.deps=deps;
 runAs(localSlug,()=>{saveChat(ID,{ageConfirmed:true,epoch:0,history:[],sent:[],bcid:route.bcid});registerHandlers(bot,girl,deps.catalogue,deps,q);});
 if(route.bcid)fs.writeFileSync(path.join(dir,'_business.json'),JSON.stringify({[route.bcid]:999}));
 tg.handlers.push(c=>{if(state.transportFailure&&mediaMethods.has(c.method)){const f=state.transportFailure;state.transportFailure=null;return f==='unknown'?{err:new Error('synthetic transport timeout')}:{rej:[403,'synthetic media rejection']};}});
 state.rows=()=>{try{return fs.readFileSync(path.join(config.logDir,localSlug,'requests.jsonl'),'utf8').trim().split('\n').map(x=>JSON.parse(x));}catch{return[]}};
 state.fan=async text=>{const mid=++updateId,m={message_id:mid,date:Math.floor(Date.now()/1000),chat:{id:ID,type:'private',first_name:'Tester'},from:{id:ID,is_bot:false,first_name:'Tester',username:'isolated_sim'},text,...(text.startsWith('/')?{entities:[{type:'bot_command',offset:0,length:text.split(' ')[0].length}]}:{}),...(route.bcid?{business_connection_id:route.bcid}:{})};await bot.handleUpdate({update_id:mid,...(route.bcid?{business_message:m}:{message:m})});await q.idle();};
 state.stop=()=>{active=false;q.stop();};rigs.push(state);return state;
}
const eligible=s=>s.deps.catalogue.filter(x=>x.kind==='photo'&&!['pending','failed','needs_review'].includes(x.analysis??'')&&x.desc.trim()&&(x.isFree||x.stars>0));
function persist(){fs.writeFileSync(out+'/progress.json',JSON.stringify({slug,completed:results.length,requests,failed:results.filter(x=>x.failed.length).map(x=>({case:x.case,failed:x.failed}))}));fs.writeFileSync(out+'/turns.private.json',JSON.stringify(privateTurns));fs.writeFileSync(out+'/exchanges.private.json',JSON.stringify(exchanges));}
async function say(s,name,input,rules={}){
 const before=runAs(s.slug,()=>loadChat(ID)),n=requests,t=s.tg.calls.length,d=s.downloads.length,r=s.rows().length;
 current={name,history:[...before.history,{role:'user',content:input}].slice(-config.historyLimit)};
 await s.fan(input);const rows=s.rows().slice(r),row=rows.at(-1)??{},after=runAs(s.slug,()=>loadChat(ID));
 const calls=s.tg.calls.slice(t),media=calls.filter(x=>mediaMethods.has(x.method)),text=(row.final??[]).join(' '),prepared=(row.generated??[]).join(' '),failed=[],flags=[];
 const check=(label,value)=>{if(!value)failed.push(label)};
 check('one_record',rows.length===1);check('one_model_call',requests-n===1);check('valid_selection',!row.selectionError);check('one_media_action',media.length<=1);
 check('no_json_or_mechanical_label',!/(?:"selection"\s*:|alternative photo, not an exact match|YOUR CONTENT READY|does not show:)/i.test(text));
 check('complete_cleanup',!/(?:rather u just|rather you just)\s*$/i.test(text));
 check('no_guaranteed_restart_fix',!/(?:fixes it like every time|always fixes|definitely (?:fix|work))/i.test(text));
 if(rules.noMedia)check('no_unrequested_media',media.length===0&&!row.selectedMedia);
 if(rules.photo&&eligible(s).length)check('requested_photo',row.selectedMedia?.kind==='photo'&&media.length===1);
 if(rules.key){check('exact_same_file',row.selectedMedia?.key===rules.key);check('fresh_reference_read',row.photoReference?.available===true);}
 if(rules.different&&eligible(s).some(x=>!before.sent.includes(x.key)&&!s.owned.has(x.key)))check('different_file',row.media?.kind==='photo'&&row.media.key!==rules.different);
 if(rules.generic)check('no_generic_alternative',!row.photoAlternative);
 if(rules.free){const free=eligible(s).some(x=>x.isFree&&!before.sent.includes(x.key));check('free_request_not_paid',media.every(x=>x.method!=='sendPaidMedia'));if(free)check('available_free_preview_sent',row.media?.free===true);}
 if(rules.owned)check('owned_resend_unlocked',row.media?.free===true&&media[0]?.method==='sendPhoto');
 if(rules.outcome)check('honest_transport_outcome',row.delivery?.media?.status===rules.outcome);
 if(rules.unavailable&&row.selectedMedia)check('specific_alternative_disclosed',!!row.photoAlternative&&prepared.startsWith("here's a different option."));
 if(rules.recall)check('recent_fact_recall',/alex/i.test(text)&&/brisbane/i.test(text));
 if(row.selectedMedia&&row.selectedMedia.kind!=='bundle'){
  const item=s.deps.catalogue.find(x=>x.key===row.selectedMedia.key),slot=row.menu?.find(x=>x.slot===row.selection);
  check('file_belongs_to_creator',!!item&&slot?.key===item.key);
  check('selected_path_used',s.downloads.slice(d).some(x=>x.key===item?.key&&x.path===item.storagePath)||!!row.delivery?.media?.cachedRef);
  if(media[0]?.method==='sendPaidMedia')check('correct_payload_price',media[0].payload.star_count===priceFor(item.stars,{cloneId:profile.id,telegramId:ID,kind:item.kind}));
  if(row.media?.kind==='photo')check('receipt_persisted',row.delivery?.media?.status==='acknowledged'&&after.photo?.key===row.media.key);
  check('caption_assembly',!media.length||(media[0].payload.caption??'')===trimCaption(prepared));
 }
 const prices=[...text.matchAll(/\b(\d+)\s*(?:telegram\s+)?stars?\b/gi)].map(m=>Number(m[1]));
 if(prices.some(n=>n>0)&&!row.tip?.amounts?.length)flags.push('model_quoted_item_price');
 if(row.photoAlternative&&!rules.unavailable&&!rules.visual)flags.push('alternative_in_nonvisual_context');
 if(/\b(?:only (?:got|have) (?:that )?one|no more (?:pics|photos)|out of (?:pics|photos))\b/i.test(text)&&eligible(s).filter(x=>!before.sent.includes(x.key)&&!s.owned.has(x.key)).length>1)flags.push('possible_false_stock');
 if(/(?:right there|you (?:can|should) see|should be.*chat)/i.test(text))flags.push('possible_visibility_claim');
 const ex=exchanges.filter(x=>x.case===name).at(-1);if(ex?.response?.choices?.[0]?.finish_reason==='length')flags.push('model_output_truncated');
 if(!text.trim())flags.push('empty_final_reply');
 const result={case:name,input,failed,flags,selection:row.selection??null,key:row.selectedMedia?.key??null,priorKey:before.photo?.key??null,free:row.media?.free??null,stars:row.media?.stars??null,reply:text,modelCalls:requests-n,provider:row.provider,cost:row.cost??0,transport:row.delivery?.media?.status??null,alternative:!!row.photoAlternative};
 results.push(result);privateTurns.push({case:name,before,row,after,calls:calls.map(x=>({method:x.method,payload:{...x.payload,media:undefined,photo:undefined,video:undefined}}))});persist();return {row,photo:after.photo,result};
}
const plan={version:'live-fleet-simulation-1',business:['greeting','self-intro','recall','new-photo','card-acceptance','card-description','card-price','cannot-afford','refusal','tone-change','new-after-refusal','different-one','same-resend','owned-resend','free-preview','unavailable-specific','subject-change','identity'],ordinary:['greeting','new-photo','card-price','same-resend','ownership-failure','timeout-new','missing-after-timeout','refusal','reset-no-reference'],edges:slug==='riley-mae-lewis'?['exhausted','analysis-blocked','paid-only-free-request','free-only-new','rejected-new']:[],perCreator:27,features:{tips:profile.tips_enabled,bundles:book.bundles.length,memory:profile.v2_memory_enabled,credits:profile.v2_credits_enabled},limits:['Synthetic file bytes and transport do not prove Telegram visibility','Fresh synthetic ownership and payments; no purchases','Bundle eligibility from current live cached exclusions; storage bytes not independently fetched','No persistent memory because live feature is off']};
fs.writeFileSync(out+'/plan.json',JSON.stringify(plan,null,2));
let fatal=null;
try{
 const b=make({bcid:'isolated-'+slug});
 await say(b,'business-greeting','Hey, how is your day?',{noMedia:true});
 await say(b,'business-self-intro','My name is Alex. I live in Brisbane and like hiking. Just chatting today.',{noMedia:true});
 await say(b,'business-recall','What is my name and what city did I say I live in?',{noMedia:true,recall:true});
 let x=await say(b,'business-new-photo','Can you send me a photo?',{photo:true,generic:true});
 if(x.photo){
  await say(b,'business-card-acceptance','Yes, I want to see that one',{noMedia:true});
  await say(b,'business-card-description','What is in the photo you just sent?',{noMedia:true});
  await say(b,'business-card-price','How many Stars is that photo?',{noMedia:true});
 }else{for(const name of ['card-acceptance','card-description','card-price'])await say(b,'business-'+name,'Do you have any photos available? Please just tell me.',{noMedia:true});}
 await say(b,'business-cannot-afford','I cannot afford it until Friday. I am not buying today.',{noMedia:true});
 await say(b,'business-refusal','No more photos please, just chat with me.',{noMedia:true});
 await say(b,'business-tone-change','Can we have a different tone? Be more relaxed. No photos.',{noMedia:true});
 x=await say(b,'business-new-after-refusal','Actually, can you send me a new photo now?',{photo:true,generic:true});
 x=await say(b,'business-different-one','Can I have a different one?',{photo:true,different:x.photo?.key,generic:true});
 x=await say(b,'business-same-resend','Send that same photo again',{...(x.photo?{photo:true,key:x.photo.key}:{noMedia:true})});
 if(x.photo){b.owned.add(x.photo.key);fs.writeFileSync(path.join(b.dir,'_live_owned.json'),JSON.stringify({[ID]:[...b.owned]}));}
 await say(b,'business-owned-resend','Please resend that same photo again',{...(x.photo?{photo:true,key:x.photo.key,owned:true}:{noMedia:true})});
 await say(b,'business-free-preview','Can you send me a free preview photo?',{free:true});
 const missing=['wand','plug','vibrator'].find(w=>!cat.some(it=>it.words.has(w)));
 await say(b,'business-unavailable-specific',missing?'Do you have a photo with a '+missing+'?':'Do you have a photo in a bright green suit?',{unavailable:!!missing,visual:true});
 await say(b,'business-subject-change','Forget photos. What do you like doing on a quiet weekend?',{noMedia:true});
 await say(b,'business-identity','Is this really '+profile.name+'? Just answer, please do not send a photo.',{noMedia:true});b.stop();
 const o=make({});
 await say(o,'ordinary-greeting','Hello, how are you?',{noMedia:true});
 x=await say(o,'ordinary-new-photo','Can you send me a photo?',{photo:true,generic:true});
 x=await say(o,'ordinary-card-price',x.photo?'What does that photo cost?':'Do you have any photos? Please just tell me.',{noMedia:true});
 x=await say(o,'ordinary-same-resend','Send that same photo again',{...(x.photo?{photo:true,key:x.photo.key}:{noMedia:true})});
 o.verifyFailure=true;await say(o,'ordinary-ownership-failure','Send that same photo again',{noMedia:true});o.verifyFailure=false;
 o.transportFailure='unknown';x=await say(o,'ordinary-timeout-new','Please send me a new photo',{photo:true,generic:true,...(eligible(o).length?{outcome:'unknown'}:{})});o.transportFailure=null;
 await say(o,'ordinary-missing-after-timeout',"I cannot see it. Can you send it again?",{...(x.photo?{photo:true,key:x.photo.key}:{noMedia:true})});
 await say(o,'ordinary-refusal','No more photos or offers, please. How was your day?',{noMedia:true});
 await o.fan('/reset');await say(o,'ordinary-reset-no-reference','Send that same photo again',{noMedia:true});o.stop();
 if(slug==='riley-mae-lewis'){
  const edges=[['exhausted',[],{noMedia:true},'Can you send a photo?'],['analysis-blocked',cat.filter(x=>x.kind==='photo').slice(0,3).map(x=>({...x,analysis:'pending',words:new Set(),related:new Set()})),{noMedia:true},'Can you send a photo?'],['paid-only-free-request',cat.filter(x=>x.kind==='photo'&&!x.isFree),{noMedia:true},'Can you send me a free photo?'],['free-only-new',cat.filter(x=>x.kind==='photo'&&x.isFree),{photo:true,generic:true},'Can you send me a new photo?'],['rejected-new',cat,{photo:true,outcome:'rejected',generic:true},'Can you send me a photo?']];
  for(const [name,c,r,input]of edges){const s=make({bcid:'edge-'+name},c);if(name==='rejected-new')s.transportFailure='rejected';await say(s,'edge-'+name,input,r);s.stop();}
 }
}catch(e){fatal=String(e.stack??e).slice(0,1400);}
finally{
 for(const s of rigs)s.stop();persist();
 const summary={slug,engine:'v2',at:new Date().toISOString(),runtime:fixture.runtime,fixtureHash:hash(fs.readFileSync(fixturePath)),cases:results.length,requests,failedCases:results.filter(r=>r.failed.length).length,flaggedCases:results.filter(r=>r.flags.length).length,cost:results.reduce((a,r)=>a+r.cost,0),fatal,plan,promptDisplayConsistent:JSON.stringify(previewParts(profile.v2_vars))===JSON.stringify(renderParts(profile.v2_vars)),promptVarsHash:hash(JSON.stringify(profile.v2_vars)),results};
 fs.writeFileSync(out+'/summary.json',JSON.stringify(summary));fs.writeFileSync(out+'/runtime.private.log',logs.join(''));
 globalThis.fetch=realFetch;Math.random=oldRandom;process.stdout.write=write;process.stderr.write=errWrite;
 write(JSON.stringify({slug,cases:summary.cases,failed:summary.failedCases,flags:summary.flaggedCases,fatal})+'\n');
 fs.rmSync(temp,{recursive:true,force:true});if(fatal)process.exitCode=1;
}
