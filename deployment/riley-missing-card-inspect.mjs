import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {config} from './src/config.ts';
import {mapFromV1} from './src/girls/map-v1.ts';
import {validateVars} from './src/girls/template.ts';
const id='2e5eb05f-cc88-4ba6-870a-924948d4b09a';
const sb=async(route)=>{const r=await fetch(config.supabaseUrl+'/rest/v1/'+route,{headers:{apikey:config.supabaseKey,Authorization:'Bearer '+config.supabaseKey},signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('database read '+r.status);return r.json();};
const [c]=await sb('clones?id=eq.'+id+'&select=*');if(!c||c.slug!=='mrs-callace')throw new Error('creator identity mismatch');
const tg=async(method,body={})=>{const r=await fetch('https://api.telegram.org/bot'+c.bot_token+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});const p=await r.json();if(!p.ok)return {ok:false,code:p.error_code};return {ok:true,result:p.result};};
const me=await tg('getMe'),wh=await tg('getWebhookInfo');
const connections=new Set();let complete=false;
for(let offset=0;offset<10000;offset+=1000){const rows=await sb('users?clone_id=eq.'+id+'&select=business_connection_id&business_connection_id=not.is.null&order=id&limit=1000&offset='+offset);for(const r of rows)connections.add(r.business_connection_id);if(rows.length<1000){complete=true;break;}}
const bc=[];
for(const key of connections){const r=await tg('getBusinessConnection',{business_connection_id:key});bc.push({fingerprint:crypto.createHash('sha256').update(key).digest('hex').slice(0,12),ok:r.ok,code:r.code,enabled:r.result?.is_enabled,canReply:r.result?.rights?.can_reply??r.result?.can_reply,usernameMatchesConfigured:c.business_username?String(r.result?.user?.username??'').toLowerCase()===String(c.business_username).replace(/^@/,'').toLowerCase():null});}
const fp=path.join(config.dataDir,'_fleet.json');const fleet=fs.existsSync(fp)?JSON.parse(fs.readFileSync(fp,'utf8')):null;
const mapped=mapFromV1(c);
const view=Object.fromEntries(Object.entries(fleet?.girls??{}).map(([slug,v])=>[slug,{status:v.status,botUsername:v.botUsername,startedAt:v.startedAt,credits:v.credits?.applied?.enabled,tips:v.tips?.offersEnabled,memory:v.memory?.serving}]));
console.log(JSON.stringify({checkedAt:new Date().toISOString(),runtime:process.env.GIT_SHA,conversationModel:config.model,fleetAt:fleet?.at,fleet:view,creator:{id:c.id,slug:c.slug,engine:c.engine,status:c.status,credits:c.v2_credits_enabled,tips:c.tips_enabled,memory:c.v2_memory_enabled,hasV2Profile:!!c.v2_vars,profileMissing:validateVars(c.v2_vars??mapped.vars),voiceNeedsReview:/not all lowercase/i.test(c.persona?.PERSONA??'')},telegram:{getMeOk:me.ok,botUsername:me.result?.username,webhookPresent:wh.ok?!!wh.result.url:null,connectionReadComplete:complete,connections:bc}}));
