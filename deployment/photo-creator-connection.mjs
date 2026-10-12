import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {config} from './src/config.ts';
const ids=['20ef9407-83f2-4351-8d3c-48cc0ed54e0b','3484f7d9-0cda-4f52-84de-e104c238ce5e'];
const headers={apikey:config.supabaseKey,Authorization:'Bearer '+config.supabaseKey};
async function db(p){const r=await fetch(config.supabaseUrl+'/rest/v1/'+p,{headers,signal:AbortSignal.timeout(20000)});assert.ok(r.ok,'DB status '+r.status);return r.json();}
for(const id of ids){
 const [c]=await db('clones?select=id,slug,engine,bot_token&id=eq.'+id);
 const u=await db('users?select=business_connection_id&clone_id=eq.'+id+'&business_connection_id=not.is.null&order=last_message_received.desc.nullslast&limit=10');
 const connections=[];
 for(const bcid of [...new Set(u.map(v=>v.business_connection_id))].slice(0,3)){
  try {const r=await fetch('https://api.telegram.org/bot'+c.bot_token+'/getBusinessConnection',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({business_connection_id:bcid}),signal:AbortSignal.timeout(20000)});const v=await r.json();connections.push(v.ok?{enabled:v.result.is_enabled,can_reply:v.result.rights?.can_reply??v.result.can_reply,username:v.result.user?.username}:{ok:false,error_code:v.error_code,description:v.description});}
  catch{connections.push({ok:false,error:'Telegram request failed'});}
 }
 console.log(JSON.stringify({slug:c.slug,engine:c.engine,commit:process.env.GIT_SHA,connections}));
}
