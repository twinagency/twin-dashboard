// Separate V1 engine coverage. Frozen live configuration; all writes and sends are in memory.
import fs from 'node:fs';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {MemoryStore} from './src/data/memory-store.ts';import {handleMessage} from './src/handler.ts';import {config} from './src/config.ts';
const fixture=JSON.parse(fs.readFileSync('/fixture/legacy-evidence.json','utf8')),slug=process.env.SIM_CREATOR,out='/out';
assert((!config.mock||process.env.SIM_DRY_RUN==='1')&&!config.supabase.serviceKey&&!config.telegram.botToken&&process.env.TWIN_SIM_NO_WRITES==='1');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');for(const [p,h]of Object.entries(fixture.sourceHashes))assert.equal(hash(fs.readFileSync(p)),h);
const original=fixture.clones.find(c=>c.slug===slug);assert(original?.engine==='live');
const clone={...original,responseWaitMin:0,responseWaitMax:0,readReceiptsEnabled:false,reactionsEnabled:false,randomVoiceEnabled:false};
const logs=[],results=[],exchanges=[],histories=[],write=process.stdout.write.bind(process.stdout),writeErr=process.stderr.write.bind(process.stderr);
process.stdout.write=(c,e,cb)=>{logs.push(String(c));if(typeof e==='function')e();else cb?.();return true};process.stderr.write=process.stdout.write;
let current='',calls=0,updateId=Date.now(),mid=5000;const realFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 const u=new URL(String(typeof input==='string'?input:input?.url??input));
 assert.equal(u.origin,'https://openrouter.ai','All external traffic except the existing model is blocked');assert.equal(u.pathname,'/api/v1/chat/completions');assert(calls<100,'Bounded existing V1 model requests');calls++;
 const ex={case:current,request:JSON.parse(init.body)};exchanges.push(ex);const r=await realFetch(input,init);ex.status=r.status;ex.response=await r.clone().json().catch(()=>null);return r;
};
class Store extends MemoryStore{
 async getCloneBySlug(s){return s===slug?clone:null}async getCloneById(id){return id===clone.id?clone:null}async getCloneByBotToken(t){return t===clone.botToken?clone:null}async listActiveClones(){return[clone]}
 async listPhotos(id){assert.equal(id,clone.id);return structuredClone(fixture.catalogues[id].photos)}async listVideos(id){assert.equal(id,clone.id);return structuredClone(fixture.catalogues[id].videos)}
 async listSendableBundles(id){return structuredClone(fixture.bundles[id]??[])}async getOnboardingBundle(id){return structuredClone(fixture.onboarding[id]??null)}
 async getPromptTemplates(){return new Map(fixture.templates)}async getAppSettings(){return{}}async getMediaBytes(){return Buffer.from('synthetic-media')}async getMediaSignedUrl(p){return 'mock://'+p}
 async saveMediaFileId(){} // inherited in-memory writes only; never real data
}
class Capture{
 texts=[];media=[];commerce=[];
 async sendText(t,o){this.texts.push(t);if(o?.delivered)o.delivered.text=t}
 async sendVoice(){return null}async sendChatAction(){}async react(){}async markRead(){}async deleteInbound(){}async pin(){}
 async accept(opts){if(opts?.receipt){opts.receipt.transportStarted=true;opts.receipt.messageId=++mid;opts.receipt.fileId='sim-'+mid;await opts.receipt.onAccepted?.();}}
 async sendPaidMedia(item,type,source,opts){await this.accept(opts);this.media.push({id:item.id,type,stars:item.starValue,caption:opts&&'preparedCaption'in opts?opts.preparedCaption:item.teaserCaption??item.caption,free:false,path:item.storagePath});return'sim-'+mid}
 async sendFreeMedia(source,type,caption){this.media.push({type,caption,free:true,source:typeof source==='string'?source:'synthetic-bytes'});return'sim-free-'+(++mid)}
 async sendPaidPhotoGroup(sources,stars,caption,opts){await this.accept(opts);this.media.push({type:'bundle',stars,caption,files:sources.length,free:false});return++mid}
 async sendPaywall(p){this.commerce.push({type:'paywall',stars:p.priceStars});this.texts.push(p.message);if(p.delivered)Object.assign(p.delivered,{ok:true,text:p.message,messageId:++mid,certainty:'accepted'})}
 async sendSpoilMenu(p){this.commerce.push({type:'tip-menu'});}async sendSpoilInvoice(p){this.commerce.push({type:'tip-invoice',stars:p.stars});return true}
 async sendVipInvoice(){this.commerce.push({type:'vip-invoice'});return true}async sendVipMenu(){this.commerce.push({type:'vip-menu'});return true}async cancelStarSubscription(){return true}
}
const store=new Store();let userSeq=0;
async function fan(route,credits=100){const id=-(999000+userSeq++);const u=await store.createUser({cloneId:clone.id,telegramId:id,name:'Alex',username:'isolated_sim',languageCode:'en',chatId:id,businessConnectionId:route,startingCredits:credits});await store.setOnboardingComplete(u.id,true);return u}
async function turn(user,route,name,text,rules={}){
 current=name;const send=new Capture(),before=calls,hist=await store.getRecentHistory(clone.id,user.telegramId,1000);let error=null;
 try{await handleMessage(store,{updateId:updateId++,botToken:clone.botToken,telegramId:user.telegramId,chatId:user.telegramId,messageId:updateId,businessConnectionId:route,name:'Alex',username:'isolated_sim',languageCode:'en',text,isVoice:false,fanSentPhoto:false},()=>send)}catch(e){error=String(e.message??e).slice(0,400)}
 const reply=[...send.texts,...send.media.map(x=>x.caption??'')].join(' '),failed=[];
 if(error)failed.push('handler_error');if(rules.noMedia&&send.media.length)failed.push('unrequested_media');if(send.media.length>1)failed.push('multiple_media_actions');
 if(rules.photo&&!send.media.some(x=>x.type==='photo'))failed.push('requested_photo_not_sent');
 if(rules.different&&send.media.some(x=>x.id===rules.different))failed.push('new_request_repeated_file');
 if(rules.same&&send.media.some(x=>x.id&&x.id!==rules.same))failed.push('same_request_changed_file');
 if(rules.recall&&(!/alex/i.test(reply)||!/brisbane/i.test(reply)))failed.push('recent_fact_recall');
 if(rules.paywall&&!send.commerce.some(x=>x.type==='paywall'))failed.push('zero_credit_wall_missing');
 if(!reply.trim()&&!send.commerce.length&&!send.media.length)failed.push('no_response');
 const flags=[];if(/(?:alternative photo, not an exact match|"selection"\s*:|<think>)/i.test(reply))flags.push('internal_or_mechanical_text');
 const result={case:name,input:text,failed,flags,reply,media:send.media,commerce:send.commerce,modelCalls:calls-before,error};results.push(result);
 histories.push({case:name,before:hist,after:await store.getRecentHistory(clone.id,user.telegramId,1000)});
 fs.writeFileSync(out+'/progress.json',JSON.stringify({slug,completed:results.length,requests:calls}));fs.writeFileSync(out+'/exchanges.private.json',JSON.stringify(exchanges));fs.writeFileSync(out+'/histories.private.json',JSON.stringify(histories));return result;
}
const plan={casesPerCreator:20,scope:'Existing V1 handler; copied actual live persona/models/templates/catalogue; in-memory fan history/ownership/commerce; synthetic media/messenger',overrides:{responseWaitMin:0,responseWaitMax:0,readReceiptsEnabled:false,reactionsEnabled:false,randomVoiceEnabled:false},limits:['Existing-fan conversation starts after onboarding with 100 synthetic credits','No actual Telegram formatting, visibility, payment or storage downloads','Existing V1 architecture may make multiple model calls per turn; count them instead of changing it']};fs.writeFileSync(out+'/plan.json',JSON.stringify(plan));
let fatal=null;
try{
 for(const route of ['isolated-business',null]){
  const p=route?'business':'ordinary',u=await fan(route);
  await turn(u,route,p+'-greeting','Hello, how are you?',{noMedia:true});
  await turn(u,route,p+'-self-intro','My name is Alex. I live in Brisbane and enjoy hiking. Just chatting.',{noMedia:true});
  await turn(u,route,p+'-recall','What is my name and where do I live?',{noMedia:true,recall:true});
  let r=await turn(u,route,p+'-photo','Can you send me a photo?',{photo:true});let key=r.media.find(x=>x.type==='photo')?.id;
  await turn(u,route,p+'-card-description','What is in the photo you just sent?',{noMedia:true});
  await turn(u,route,p+'-card-price','What does that photo cost?',{noMedia:true});
  await turn(u,route,p+'-cannot-afford','I cannot afford it today. No more offers please.',{noMedia:true});
  r=await turn(u,route,p+'-different','Can you send me a different photo now?',{photo:true,different:key});key=r.media.find(x=>x.type==='photo')?.id;
  await turn(u,route,p+'-same','Send that same photo again',{same:key});
  await turn(u,route,p+'-subject-change','No more photos. How was your day?',{noMedia:true});
 }
}catch(e){fatal=String(e.stack??e).slice(0,1200)}finally{
 const summary={slug,engine:'live',runtime:fixture.runtime,at:new Date().toISOString(),cases:results.length,requests:calls,failedCases:results.filter(x=>x.failed.length).length,flaggedCases:results.filter(x=>x.flags.length).length,results,plan,fatal,cost:exchanges.reduce((a,x)=>a+(x.response?.usage?.cost??0),0)};
 fs.writeFileSync(out+'/summary.json',JSON.stringify(summary));fs.writeFileSync(out+'/runtime.private.log',logs.join(''));globalThis.fetch=realFetch;process.stdout.write=write;process.stderr.write=writeErr;
 write(JSON.stringify({slug,cases:results.length,requests:calls,failed:summary.failedCases,fatal})+'\n');if(fatal)process.exitCode=1;
}
