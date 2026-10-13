"""Read-only shared V2 repair baseline; no model calls, sends, settings writes or deployment."""
import json,subprocess
runtime=[]
for name in ['twin-v2-bot-1','twin-v2-dash-1']:
 info=json.loads(subprocess.check_output(['docker','inspect',name],text=True))[0]
 runtime.append({'container':name,'running':info['State']['Running'],'image':info['Image'],'revision':next((x.split('=',1)[1] for x in info['Config']['Env'] if x.startswith('GIT_SHA=')),None)})
js=r"""
import fs from 'node:fs';import {createHash} from 'node:crypto';
import {config} from './src/config.ts';import {render} from './src/girls/template.ts';import {priceFor} from './src/payments.ts';
const sha=s=>createHash('sha256').update(s).digest('hex');
const rsp=await fetch(config.supabaseUrl+'/rest/v1/clones?select=id,slug,name,engine,status,v2_vars,v2_credits_enabled,tips_enabled,v2_memory_enabled&order=slug',{headers:{apikey:config.supabaseKey,Authorization:'Bearer '+config.supabaseKey},signal:AbortSignal.timeout(15000)});
if(!rsp.ok)throw Error('clones-read-'+rsp.status);
const rows=await rsp.json(), results=[];
const sec=t=>t.slice(t.indexOf('PHOTOS AND VIDEOS'),t.indexOf('HARD LIMITS, NEVER CROSSED'));
for(const row of rows.filter(r=>r.engine==='v2'&&r.status==='active')){
 const check={id:row.id,slug:row.slug,settingsHash:sha(JSON.stringify(row)),testerPrice:priceFor(2700,{cloneId:row.id,telegramId:6814483810,kind:'photo'}),normalPrice:priceFor(2700,{cloneId:row.id,telegramId:6814483811,kind:'photo'})};
 try{
  const response=await fetch('http://127.0.0.1:'+Number(process.env.DASH_PORT??4300)+'/api/girls/details?girl='+encodeURIComponent(row.slug),{signal:AbortSignal.timeout(8000)});
  check.displayHttp=response.status;
  if(response.ok){const d=await response.json();check.displayMatches=Array.isArray(d.parts)&&Array.isArray(d.errors)&&!d.errors.length&&sec(d.parts.filter(p=>!p.optional).map(p=>p.text).join(''))===sec(render(row.v2_vars));}
 }catch(e){check.error=e?.name??'Error';}
 results.push(check);
}
console.log('SHARED_REPAIR_BASELINE_JSON '+JSON.stringify({checkedAt:new Date().toISOString(),model:config.model,providerOrder:config.providerOrder,bundles:process.env.V2_BUNDLES,sourceHashes:Object.fromEntries(['src/media.ts','src/turn.ts','src/grounding.ts','src/girls/template.ts','src/llm.ts'].map(p=>[p,sha(fs.readFileSync(p))])),creators:rows.map(r=>({id:r.id,slug:r.slug,engine:r.engine,status:r.status})),checks:results,settingsHash:sha(JSON.stringify(rows)),modelCalls:0,messagesSent:0,productionWrites:0}));
""";
p=subprocess.run(['docker','exec','-i','twin-v2-dash-1','node','--import','tsx','--input-type=module'],input=js,text=True,capture_output=True,timeout=150)
if p.returncode:raise RuntimeError(p.stderr[-500:])
line=next(x for x in p.stdout.splitlines() if x.startswith('SHARED_REPAIR_BASELINE_JSON '))
data=json.loads(line.split(' ',1)[1]);data['runtime']=runtime
print('SHARED_REPAIR_BASELINE_JSON '+json.dumps(data),flush=True)
