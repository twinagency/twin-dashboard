import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {config} from './src/config.ts';
import {activeRequest,requestHandover,readResult,clearHandover} from './src/handover.ts';
import {validateVars} from './src/girls/template.ts';
import {loadRawCatalogue,catalogueFromRaw} from './src/media.ts';
import {testPhotoPrice} from './src/test-photo-pricing.ts';
const stable=v=>v&&typeof v==='object'?(Array.isArray(v)?v.map(stable):Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]))):v;
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
const id='2e5eb05f-cc88-4ba6-870a-924948d4b09a',slug='mrs-callace',dir=path.join(config.dataDir,'_operator_backups','mrs-callace-v2-20261012');
const backup=JSON.parse(fs.readFileSync(path.join(dir,'settings.json'),'utf8'));
const fleet=()=>JSON.parse(fs.readFileSync(path.join(config.dataDir,'_fleet.json'),'utf8'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const sb=async(route,method='GET',body)=>{const r=await fetch(config.supabaseUrl+'/rest/v1/'+route,{method,headers:{apikey:config.supabaseKey,Authorization:'Bearer '+config.supabaseKey,'Content-Type':'application/json',Prefer:'return=representation'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error('database '+method+' '+r.status);return r.json();};
const read=async()=>{const rows=await sb('clones?id=eq.'+id+'&select=id,slug,engine,status,v2_vars,tips_enabled,v2_credits_enabled,v2_memory_enabled,vision_model,photo_vision_model,sell_via_mini_app');if(rows.length!==1)throw new Error('creator row missing');return rows[0];};
const mon=async(engine)=>{const r=await fetch('http://127.0.0.1:4300/api/girls/engine',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,engine}),signal:AbortSignal.timeout(85000)});if(!r.ok)throw new Error('monitor '+r.status);const p=await r.json();if(p.ok!==true)throw new Error('engine switch refused: '+String(p.error??'unknown').slice(0,300));return p;};
const journal={at:new Date().toISOString(),creator:slug,runtime:process.env.GIT_SHA,status:'preparing',backup:path.join(dir,'settings.json')};
const record=()=>{const p=path.join(dir,'activation.json'),tmp=p+'.tmp';fs.writeFileSync(tmp,JSON.stringify(journal,null,2),{mode:0o600});fs.renameSync(tmp,p);};
const before=await read(),initial=fleet();
if(process.env.GIT_SHA!=='45931b6f56db9f97cc8406154e35a0d216f5de65'||before.slug!==slug||before.engine!=='live'||before.status!=='active'||before.v2_credits_enabled!==false||before.v2_memory_enabled!==false||before.tips_enabled!==true||hash(before.v2_vars)!==backup.preparedProfileHash||validateVars(before.v2_vars).length)throw new Error('preconditions changed');
if(activeRequest(config.dataDir,slug)||initial.girls?.[slug])throw new Error('existing runner or handover requires review');
if(Date.now()-Date.parse(initial.at)>60000)throw new Error('fleet heartbeat stale');
if(testPhotoPrice(id,6814483810,'photo')!==null)throw new Error('unexpected photo price override');
const originalFleet=Object.keys(initial.girls);
const raw=await loadRawCatalogue(id),items=catalogueFromRaw(raw);
if(!items.length)throw new Error('empty usable catalogue');
const req=requestHandover(config.dataDir,slug);journal.handoverRequest=req.id;record();
let released=false,committed=false;
try{
 let response;
 for(let i=0;i<15;i++){response=readResult(config.dataDir,slug,req.id);if(response)break;await wait(1000);}
 if(!response?.ok||fleet().girls?.[slug])throw new Error('fleet did not confirm the creator start hold');
 const flags=await sb('clones?id=eq.'+id+'&engine=eq.live&tips_enabled=eq.true&select=id,tips_enabled','PATCH',{tips_enabled:false});
 if(flags.length!==1||flags[0].tips_enabled!==false)throw new Error('tip switch changed concurrently');
 journal.engineRequestedAt=new Date().toISOString();record();
 await mon('v2');committed=true;journal.status='waiting-for-v1-drain';record();
 const message='clone "'+slug+'" switched to the external V2 engine; polling stopped';
 const until=Date.now()+90000;let receipt;
 while(Date.now()<until){
  if(activeRequest(config.dataDir,slug)?.id!==req.id)throw new Error('creator start hold changed');
  const rows=await sb('system_logs?clone_id=eq.'+id+'&source=eq.runtime&ts=gte.'+encodeURIComponent(journal.engineRequestedAt)+'&message=eq.'+encodeURIComponent(message)+'&select=id,ts&order=ts.desc&limit=1');
  if(rows.length){receipt=rows[0];break;}await wait(2000);
 }
 if(!receipt)throw new Error('V1 drain acknowledgement not observed');
 journal.v1Drained=receipt;record();
 const current=await read();
 if(current.engine!=='v2'||current.tips_enabled!==false||current.v2_credits_enabled!==false||current.v2_memory_enabled!==false||hash(current.v2_vars)!==backup.preparedProfileHash)throw new Error('settings changed during handover');
 if(activeRequest(config.dataDir,slug)?.id!==req.id)throw new Error('handover start hold lost');
 clearHandover(config.dataDir,slug);released=true;
 const startDeadline=Date.now()+75000;let state;
 while(Date.now()<startDeadline){
  const f=fleet(),s=f.girls?.[slug];
  if(s?.status==='error')throw new Error('V2 runner reported startup error');
  if(Date.now()-Date.parse(f.at)<45000&&s?.status==='running'&&s.credits?.applied?.enabled===false&&s.tips?.offersEnabled===false&&s.memory?.serving===false&&originalFleet.every(k=>f.girls[k]?.status==='running')){state=s;break;}
  await wait(2000);
 }
 if(!state)throw new Error('V2 running state and disabled features not confirmed');
 const after=await read();
 if(after.engine!=='v2'||hash(after.v2_vars)!==backup.preparedProfileHash)throw new Error('post-switch database mismatch');
 journal.status='confirmed';journal.confirmedAt=new Date().toISOString();journal.v2StartedAt=state.startedAt;journal.botUsername=state.botUsername;journal.existingFleetPreserved=originalFleet;record();
 console.log(JSON.stringify({...journal,engine:after.engine,conversationModel:config.model,visionModel:after.vision_model,photoVisionModel:after.photo_vision_model,credits:state.credits.applied.enabled,tips:state.tips.offersEnabled,memory:state.memory.serving,catalogue:{usable:items.length,photos:items.filter(x=>x.kind==='photo').length,videos:items.filter(x=>x.kind==='video').length},photoTestPriceOverride:testPhotoPrice(id,6814483810,'photo'),telegramSendsByScript:0,modelCallsByScript:0}));
}catch(e){
 journal.status='failed';journal.reason=String(e.message??e).slice(0,400);record();
 try{
  const current=await read();
  if(current.engine==='v2'){await mon('live');committed=false;}
  const restored=await read();
  if(restored.engine==='live'&&restored.tips_enabled===false){
   const payload={tips_enabled:backup.before.tips_enabled};
   await sb('clones?id=eq.'+id+'&engine=eq.live&tips_enabled=eq.false&select=id,tips_enabled','PATCH',payload);
  }
  journal.rollbackEngine=(await read()).engine;record();
 }catch(rollback){journal.rollbackError=String(rollback.message??rollback).slice(0,300);record();}
 console.log(JSON.stringify(journal));process.exitCode=1;
}finally{
 if(activeRequest(config.dataDir,slug)?.id===req.id&&(!committed||released))clearHandover(config.dataDir,slug);
}
