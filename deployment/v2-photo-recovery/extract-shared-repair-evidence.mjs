import fs from 'node:fs';import path from 'node:path';
import {config} from './src/config.ts';import {runAs} from './src/context.ts';import {loadChat} from './src/memory.ts';
import {loadRawCatalogue,catalogueFromRaw} from './src/media.ts';
const id=6814483810,slug='riley-mae-lewis';
const rr=await fetch(config.supabaseUrl+'/rest/v1/clones?select=id,slug,name,engine,status,v2_vars&order=slug',{headers:{apikey:config.supabaseKey,Authorization:'Bearer '+config.supabaseKey},signal:AbortSignal.timeout(15000)});
if(!rr.ok)throw Error('profiles-read-'+rr.status);const profiles=await rr.json(),chosen=profiles.filter(p=>['riley-mae-lewis','kyla-yesenosky','mrs-callace','briana-redd'].includes(p.slug)),catalogues={};
for(const p of chosen)catalogues[p.id]=await loadRawCatalogue(p.id);
const riley=chosen.find(p=>p.slug===slug),cat=catalogueFromRaw(catalogues[riley.id]),current=runAs(slug,()=>loadChat(id));
const file=path.join(config.logDir,slug,'requests.jsonl'),fd=fs.openSync(file,'r'),size=fs.fstatSync(fd).size,off=Math.max(0,size-24000000),b=Buffer.alloc(size-off);fs.readSync(fd,b,0,b.length,off);fs.closeSync(fd);
let lines=b.toString().split('\n');if(off)lines.shift();
const records=lines.flatMap(s=>{try{return[JSON.parse(s)]}catch{return[]}}).filter(r=>String(r.chatId)===String(id));
const ids=['3a7f1a2c-6339-454c-8ce0-450d3dae3931','298b790c-62d6-4339-a47e-61fcc6265425','7977ee98-031e-4892-97f0-d48b26d6df77'];
const byTurn=new Map(records.map(r=>[r.turnId,r])),incident=[];
for(let i=0;i<ids.length;i++){
 const r=byTurn.get(ids[i]);if(!r)throw Error('incident-row-unavailable-'+i);
 const history=structuredClone(r.history);if(history.at(-1)?.role!=='user'||history.at(-1)?.content!==r.fanText)throw Error('original-history-boundary');
 history.pop();
 const sent=current.sent.filter(key=>records.some(p=>p.ts<r.ts&&p.media?.key===key&&p.delivery?.media?.status==='acknowledged')||!records.some(p=>p.media?.key===key));
 const prior=i===0?byTurn.get(r.photoReference.sourceTurnId):byTurn.get(ids[0]);
 if(!prior?.media?.key||prior.delivery?.media?.status!=='acknowledged')throw Error('original-prior-receipt-unavailable-'+i);
 const it=cat.find(x=>x.key===prior.media.key);if(!it)throw Error('original-prior-asset-unavailable');
 if(!sent.includes(it.key))sent.push(it.key);
 const photo={v:1,cloneId:riley.id,key:it.key,storagePath:it.storagePath,epoch:r.epoch??0,turnId:prior.turnId,at:Date.parse(prior.ts),mode:'real',status:'acknowledged',bcid:r.bcid,messageId:prior.delivery.media.messageId};
 incident.push({case:['A','B','C'][i],input:r.fanText,originalTurn:r.turnId,priorKey:it.key,chat:{ageConfirmed:true,epoch:r.epoch??0,history,sent,photo},original:r});
}
console.log(JSON.stringify({preparedAt:new Date().toISOString(),runtime:process.env.GIT_SHA,profiles,catalogues,incident}));
