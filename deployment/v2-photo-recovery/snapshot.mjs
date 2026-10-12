import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import readline from 'node:readline';
import {config} from './src/config.ts';
const OUT=path.join(config.dataDir,'_operator_backups/photo-recovery-20261013/input');
fs.mkdirSync(OUT,{recursive:true,mode:0o700});
const stable=(x)=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const hash=(x)=>crypto.createHash('sha256').update(JSON.stringify(stable(x))).digest('hex');
async function read(route){const r=await fetch(config.supabaseUrl+'/rest/v1/'+route,{headers:{apikey:config.supabaseKey,Authorization:'Bearer '+config.supabaseKey},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('read-only snapshot '+r.status);return r.json();}
const targetTimes=["2026-10-12T10:21:27.462Z","2026-10-12T10:21:51.209Z","2026-10-12T10:22:16.297Z","2026-10-12T10:23:05.565Z","2026-10-12T10:38:39.342Z"];
const wanted=new Set(targetTimes), found=new Map();
const lines=readline.createInterface({input:fs.createReadStream(path.join(config.logDir,'riley-mae-lewis/requests.jsonl')),crlfDelay:Infinity});
for await (const line of lines){let x;try{x=JSON.parse(line)}catch{continue}if(wanted.has(x.ts)&&String(x.chatId)==='6814483810')found.set(x.ts,{ts:x.ts,fanText:x.fanText,raw:x.raw,menu:x.menu});}
if(found.size!==5)throw Error('Retained incident records missing; do not invent replacements');
const [oldPhoto]=await read('photos?id=eq.53e2786f-c6e6-4c84-b4ff-c089457b1933&clone_id=eq.20ef9407-83f2-4351-8d3c-48cc0ed54e0b&select=id,visual_description,star_value,is_free,analysis_status');
if(!oldPhoto||hash(oldPhoto)!=="bfa3b265cfda42cc21a078391c62b4a563d7aa134e487dd452c30d29edeb1982")throw Error('Frozen photo evidence changed');
const fixture={runtime:'45931b6f56db9f97cc8406154e35a0d216f5de65',records:targetTimes.map(t=>found.get(t)),oldPhoto};
if(hash(fixture)!=="43beca8a983f03f6aad45041814bf9bed637d98ffc69d94ac0372404a96903b7")throw Error('Retained incident content hash mismatch');
const [profile]=await read('clones?id=eq.20ef9407-83f2-4351-8d3c-48cc0ed54e0b&select=id,slug,name,v2_vars');
if(!profile?.v2_vars)throw Error('Current Riley profile absent');
const rows=await read('clones?engine=eq.v2&status=eq.active&select=id,slug,name,engine,status,v2_credits_enabled,tips_enabled,v2_memory_enabled,vision_model,photo_vision_model,sell_via_mini_app,v2_vars');
const expected=['sania-mallory','kyla-yesenosky','riley-mae-lewis','briana-redd','fit-sid','mrs-callace'].sort();
if(JSON.stringify(rows.map(x=>x.slug).sort())!==JSON.stringify(expected))throw Error('Current active V2 fleet changed');
if(rows.some(x=>x.v2_credits_enabled||x.tips_enabled||x.v2_memory_enabled))throw Error('Feature switches changed');
const fleet=JSON.parse(fs.readFileSync(path.join(config.dataDir,'_fleet.json'),'utf8'));
if(Date.now()-Date.parse(fleet.at)>90000||expected.some(s=>fleet.girls[s]?.status!=='running'))throw Error('Live fleet not freshly running');
for(const [name,value] of [['incident.json',fixture],['riley-profile.json',profile],['fleet-settings.json',rows],['fleet-status.json',fleet]])fs.writeFileSync(path.join(OUT,name),JSON.stringify(value),{mode:0o600});
console.log(JSON.stringify({snapshotAt:new Date().toISOString(),frozenIncidentHash:hash(fixture),profileHash:hash(profile),fleet:expected,model:config.model,providerOrder:config.providerOrder,featuresOff:true,liveStateMutations:0}));

