"""Read current runtime/settings and saved synthetic reply failures; zero model, Telegram or production writes."""
import base64,gzip,json,os,pathlib,shlex,subprocess,time,urllib.request
INSTANCE='i-0584d283506f3f6be'
BRANCH='codex/v2-card-model-validation-v2-20261013'
host=r'''
import base64,datetime,gzip,hashlib,json,pathlib,subprocess
work=pathlib.Path('/home/ubuntu/twin-v2-validation/existing-card-candidate-1791886409126200455')
summary=json.loads((work/'summary.json').read_text())
assert summary['candidate']=='cae54ad62434d6f804ddb9d81b5da51e89fde506'
runtime=[]
for name in ['twin-v2-bot-1','twin-v2-dash-1']:
 x=json.loads(subprocess.check_output(['docker','inspect',name],text=True))[0]
 runtime.append({'name':name,'image':x['Image'],'running':x['State']['Running'],'revision':next((v.split('=',1)[1] for v in x['Config']['Env'] if v.startswith('GIT_SHA=')),None)})
probe="""import fs from 'node:fs';import crypto from 'node:crypto';import {config} from './src/config.ts';
const r=await fetch(config.supabaseUrl+'/rest/v1/clones?select=id,slug,engine,status,v2_vars&status=eq.active&order=slug',{headers:{apikey:config.supabaseKey,Authorization:'Bearer '+config.supabaseKey},signal:AbortSignal.timeout(15000)});
if(!r.ok)throw Error('settings read '+r.status);console.log('PROBE '+JSON.stringify({profiles:await r.json(),sourceHashes:Object.fromEntries(['src/turn.ts','src/media.ts','src/grounding.ts','src/girls/template.ts'].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]))}));"""
p=subprocess.run(['docker','exec','-i','twin-v2-bot-1','node','--import','tsx','--input-type=module'],input=probe,text=True,capture_output=True,timeout=35)
assert p.returncode==0,'Live read failed'
fresh=json.loads(next(s[6:] for s in p.stdout.splitlines() if s.startswith('PROBE ')))
fixture=json.loads((work/'fixture/evidence.json').read_text())
canonical=lambda profiles:{x['slug']:{k:x[k] for k in ['id','slug','engine','status','v2_vars']} for x in profiles}
rows={};cases=[]
for flag in summary['flaggedTurns']:
 slug,case=flag['slug'],flag['case']
 if slug not in rows:rows[slug]={t['case']:t for t in json.loads((work/slug/'turns.private.json').read_text())}
 t=rows[slug][case];r=t['row']
 cases.append({'slug':slug,'case':case,'flags':flag['flags'],'input':r.get('fanText'),'raw':r.get('raw'),'final':r.get('final'),
  'grounding':r.get('grounding'),'selected':r.get('selectedMedia'),'menu':r.get('menu'),'reference':r.get('photoReference'),'prior':t['before'].get('photo')})
result={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'runtime':runtime,'sourceHashes':fresh['sourceHashes'],
 'activeV2':sorted(x['slug'] for x in fresh['profiles'] if x['engine']=='v2'),
 'settingsMatchFixture':canonical(fresh['profiles'])==canonical(fixture['profiles']),
 'settingsHash':hashlib.sha256(json.dumps(canonical(fresh['profiles']),sort_keys=True).encode()).hexdigest(),
 'cases':cases,'productionWrites':0,'modelCalls':0,'telegramCalls':0}
packed=base64.b64encode(gzip.compress(json.dumps(result).encode(),mtime=0)).decode()
assert len(packed)<23000,'Evidence exceeds bounded transport'
print('REPLY_BASE64 '+packed,flush=True)
'''
payload=base64.b64encode(gzip.compress(host.encode(),mtime=0)).decode()
program="import base64,gzip;exec(compile(gzip.decompress(base64.b64decode("+repr(payload)+")),'<reply-readonly>','exec'))"
params=pathlib.Path('/tmp')/('reply-read-'+str(time.time_ns())+'.json')
params.write_text(json.dumps({'commands':['python3 -c '+shlex.quote(program)],'executionTimeout':['90']}))
cid=subprocess.check_output(['aws','ssm','send-command','--instance-ids',INSTANCE,'--document-name','AWS-RunShellScript','--parameters','file://'+str(params),'--comment','Read V2 reply repair baseline; no model or production writes','--query','Command.CommandId','--output','text'],text=True).strip()
for _ in range(36):
 try:r=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cid,'--instance-id',INSTANCE,'--output','json'],text=True,stderr=subprocess.DEVNULL))
 except subprocess.CalledProcessError:time.sleep(3);continue
 if r['Status'] in ['Success','Failed','Cancelled','TimedOut']:break
 time.sleep(3)
else:raise RuntimeError('Read incomplete')
if r['Status']!='Success':raise RuntimeError('Read '+r['Status']+': '+r.get('StandardErrorContent','')[-600:])
line=next(x for x in r['StandardOutputContent'].splitlines() if x.startswith('REPLY_BASE64 '))
result=json.loads(gzip.decompress(base64.b64decode(line.split(' ',1)[1])))
url='https://api.github.com/repos/jesse98/twin-dashboard/contents/docs/reply-repair-live-baseline.json'
body=json.dumps({'message':'Record reply repair live baseline and saved failures [skip ci]','branch':BRANCH,'content':base64.b64encode((json.dumps(result,indent=2)+'\n').encode()).decode()}).encode()
req=urllib.request.Request(url,data=body,method='PUT',headers={'Authorization':'Bearer '+os.environ['GITHUB_TOKEN'],'Accept':'application/vnd.github+json','Content-Type':'application/json'})
with urllib.request.urlopen(req,timeout=20) as response:assert response.status==201
print('REPLY_READ_SAVED '+json.dumps({'at':result['at'],'cases':len(result['cases']),'settingsMatchFixture':result['settingsMatchFixture']}),flush=True)
