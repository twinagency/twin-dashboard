"""Read-only post-deployment verification for the live Twin V2 reply release."""
import base64,gzip,json,os,pathlib,shlex,subprocess,sys,time,urllib.error,urllib.parse,urllib.request

INSTANCE='i-0584d283506f3f6be'
BRANCH='codex/v2-reply-postdeploy-v1-20261013'
BACKUP='/home/ubuntu/twin-v2-backups/reply-baseline-9138db6-1791897287594888697'
SHA='9138db6f956ed383d18fe33bce6577b2f5d74d4a'
IMAGE='sha256:5e9cc935054f8040da95d1437cea69b4e1244810eb7a99f971d926e022d27283'

def ssm(command,timeout=420):
  params=pathlib.Path('/tmp')/('reply-postdeploy-'+str(time.time_ns())+'.json')
  params.write_text(json.dumps({'commands':[command],'executionTimeout':[str(timeout)]}))
  cid=subprocess.check_output(['aws','ssm','send-command','--instance-ids',INSTANCE,'--document-name','AWS-RunShellScript',
    '--parameters','file://'+str(params),'--comment','Read-only verification of deployed V2 reply release',
    '--query','Command.CommandId','--output','text'],text=True).strip()
  print(json.dumps({'commandId':cid,'phase':'read-only post-deployment verification'}),flush=True)
  for _ in range(timeout//3+20):
    try:r=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cid,'--instance-id',INSTANCE,'--output','json'],text=True,stderr=subprocess.DEVNULL))
    except subprocess.CalledProcessError:time.sleep(3);continue
    if r['Status'] in ['Success','Failed','Cancelled','TimedOut']:break
    time.sleep(3)
  else:raise RuntimeError('Post-deployment verification incomplete')
  print(r.get('StandardOutputContent',''),flush=True)
  if r['Status']!='Success':raise RuntimeError('Post-deployment verification '+r['Status']+': '+r.get('StandardErrorContent','')[-700:])
  return r.get('StandardOutputContent','')

remote="""import base64,datetime,gzip,importlib.util,json,pathlib,time
p=pathlib.Path(%r)/'deploy-reply-release.py';spec=importlib.util.spec_from_file_location('reply_deploy',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
assert m.SHA==%r and m.TESTED==%r and m.EXPECTED_IMAGE==%r and m.IMAGE==%r
m.runtime(m.EXPECTED_IMAGE,m.SHA)
state=json.loads((m.ROOT/'data/_fleet.json').read_text());age=time.time()-datetime.datetime.fromisoformat(state['at'].replace('Z','+00:00')).timestamp();girls=state.get('girls',{})
assert age<90 and sorted(girls)==m.EXPECTED and all(girls[s].get('status')=='running' for s in m.EXPECTED),'Live fleet is not fresh and fully running'
settings=m.settings();assert settings['settingsHash']==m.PREP['settingsHash']
prompts=m.prompt_check();assert prompts['modelCalls']==prompts['messagesSent']==prompts['databaseWrites']==0
items=[x for x in m.MANIFEST if not x['path'].startswith('archive/')]
check="import fs from 'node:fs';import crypto from 'node:crypto';const items="+json.dumps(items)+";for(const x of items){const b=fs.readFileSync(x.path);if(crypto.createHash('sha1').update('blob '+b.length).update(Buffer.from([0])).update(b).digest('hex')!==x.sha)throw Error(x.path)}console.log('RELEASE_JSON '+JSON.stringify({verified:items.length}));"
bot=m.node(check,'postdeploy-bot-source',timeout=90);dash=m.node(check,'postdeploy-dash-source','twin-v2-dash-1',90);assert bot==dash and bot['verified']==285
value={'status':'complete','deployed':m.SHA,'testedSource':m.TESTED,'image':m.IMAGE,'verifiedAt':m.stamp(),'fleetAt':state['at'],'fleetAgeSeconds':age,'creators':len(girls),'allRunning':True,'settings':settings,'promptVerification':prompts,'verifiedSourceFilesPerContainer':bot['verified'],'modelCalls':0,'fanMessages':0,'databaseWrites':0,'productionWrites':0}
print('REPLY_POSTDEPLOY_BASE64 '+base64.b64encode(gzip.compress(json.dumps(value).encode(),mtime=0)).decode())
""" % (BACKUP,SHA,SHA,IMAGE,IMAGE)

result={'status':'not-started','candidate':SHA,'image':IMAGE,'workflowRun':os.environ.get('GITHUB_RUN_ID')}
try:
  output=ssm('python3 -c '+shlex.quote(remote))
  line=next(x for x in output.splitlines() if x.startswith('REPLY_POSTDEPLOY_BASE64 '))
  verified=json.loads(gzip.decompress(base64.b64decode(line.split(' ',1)[1])))
  assert verified['status']=='complete' and verified['deployed']==verified['testedSource']==SHA and verified['image']==IMAGE
  result.update(verified)
except Exception as exc:result.update(status='verification-failed',error=str(exc)[-1000:])

url='https://api.github.com/repos/jesse98/twin-dashboard/contents/docs/reply-postdeploy-v1.json'
payload={'message':'Record read-only V2 reply post-deployment verification [skip ci]','branch':BRANCH,
  'content':base64.b64encode((json.dumps(result,indent=2)+'\n').encode()).decode()}
try:
  current=urllib.request.Request(url+'?ref='+urllib.parse.quote(BRANCH,safe=''),headers={'Authorization':'Bearer '+os.environ['GITHUB_TOKEN'],'Accept':'application/vnd.github+json'})
  with urllib.request.urlopen(current,timeout=30) as response:payload['sha']=json.load(response)['sha']
except urllib.error.HTTPError as existing:
  if existing.code!=404:raise
request=urllib.request.Request(url,data=json.dumps(payload).encode(),method='PUT',headers={'Authorization':'Bearer '+os.environ['GITHUB_TOKEN'],'Accept':'application/vnd.github+json','Content-Type':'application/json'})
with urllib.request.urlopen(request,timeout=30) as response:assert response.status in [200,201]
print('REPLY_POSTDEPLOY_STATUS '+json.dumps({k:result.get(k) for k in ['status','deployed','image','creators','allRunning','error']}),flush=True)
if result['status']!='complete':sys.exit(1)
