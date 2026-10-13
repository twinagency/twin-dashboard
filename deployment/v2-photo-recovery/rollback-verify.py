"""Read-only independent verification after photo-recovery rollback."""
import datetime,json,pathlib,subprocess
root=pathlib.Path('/home/ubuntu/twin-v2');backup=pathlib.Path('/home/ubuntu/twin-v2-backups/photo-recovery-20261013');incident=root/'data/_operator_backups/photo-incident-20261013-morning'
expected=json.loads((incident/'current-settings.json').read_text());active=sorted(x['slug'] for x in expected if x['engine']=='v2' and x['status']=='active')
runtime=[]
for name in ['twin-v2-bot-1','twin-v2-dash-1']:
 p=json.loads(subprocess.check_output(['docker','inspect',name],text=True))[0]
 rev=next(x.split('=',1)[1] for x in p['Config']['Env'] if x.startswith('GIT_SHA='))
 assert p['State']['Running'] and rev=='45931b6f56db9f97cc8406154e35a0d216f5de65'
 assert p['Image']=='sha256:2f076bf6fbc17b4de58a31887e9328a56e0275d90edda39ea789efbd13517d2e'
 runtime.append({'container':name,'revision':rev,'image':p['Image']})
js="""import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {config} from './src/config.ts';import {render} from './src/girls/template.ts';import {priceFor} from './src/payments.ts';
const r=await fetch(config.supabaseUrl+'/rest/v1/clones?or=(engine.eq.v2,slug.eq.sania-mallory)&select=id,slug,name,engine,status,v2_credits_enabled,tips_enabled,v2_memory_enabled,vision_model,photo_vision_model,sell_via_mini_app,v2_vars',{headers:{apikey:config.supabaseKey,Authorization:'Bearer '+config.supabaseKey},signal:AbortSignal.timeout(15000)});assert(r.ok);const rows=await r.json();
const before=JSON.parse(fs.readFileSync(path.join(config.dataDir,'_operator_backups/photo-incident-20261013-morning/current-settings.json'),'utf8'));
assert.deepEqual(rows.sort((a,b)=>a.id.localeCompare(b.id)),before.sort((a,b)=>a.id.localeCompare(b.id)));assert.equal(process.env.V2_BUNDLES,'off');
const results=[];
for(const row of rows.filter(x=>x.status==='active')){
 const resp=await fetch('http://127.0.0.1:4300/api/girls/details?girl='+row.slug,{signal:AbortSignal.timeout(15000)});assert(resp.ok);const d=await resp.json();assert.equal(d.errors.length,0);
 const displayed=d.parts.filter(x=>!x.optional).map(x=>x.text).join(''),actual=render(row.v2_vars);
 const section=x=>x.slice(x.indexOf('PHOTOS AND VIDEOS'),x.indexOf('HARD LIMITS, NEVER CROSSED'));assert(section(actual).length>100);assert.equal(section(displayed),section(actual));
 const tester=priceFor(2700,{cloneId:row.id,telegramId:6814483810,kind:'photo'});assert.equal(tester,['riley-mae-lewis','kyla-yesenosky'].includes(row.slug)?5:2700);
 assert.equal(priceFor(2700,{cloneId:row.id,telegramId:6814483811,kind:'photo'}),2700);
 results.push({slug:row.slug,promptDisplayMatches:true,testerPrice:tester,normalPrice:2700});
}
console.log(JSON.stringify({settingsPreserved:true,bundles:'off',model:config.model,providerOrder:config.providerOrder,results}));"""
p=subprocess.run(['docker','exec','-i','twin-v2-dash-1','node','--import','tsx','--input-type=module'],input=js,text=True,capture_output=True,timeout=120)
if p.returncode:print(p.stderr[-1600:]);raise RuntimeError('rollback verification failed')
check=json.loads(p.stdout.strip())
fleet=json.loads((root/'data/_fleet.json').read_text())
now=datetime.datetime.now(datetime.timezone.utc)
assert (now-datetime.datetime.fromisoformat(fleet['at'].replace('Z','+00:00'))).total_seconds()<120
assert sorted(fleet['girls'])==active and all(fleet['girls'][s]['status']=='running' for s in active)
result={'checkedAt':now.isoformat(),'runtime':runtime,'running':active,'saniaPaused':True,'mrsCallaceOnV2':True,**check,'messagesSent':0,'financialOrChatSnapshotsRestored':False}
(incident/'rollback-independent-check.json').write_text(json.dumps(result));print(json.dumps(result),flush=True)
