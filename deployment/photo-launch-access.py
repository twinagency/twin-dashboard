"""Read-only post-deployment verification for the live Twin V2 reply release."""
import base64,gzip,json,os,pathlib,shlex,subprocess,sys,time,urllib.error,urllib.parse,urllib.request

INSTANCE='i-0584d283506f3f6be'
BRANCH='codex/v2-price-guard-postdeploy-20261014'
BACKUP='/home/ubuntu/twin-v2-backups/reply-baseline-771f713-1791916541369657274'
SHA='771f713b58c11d1b0fcf094595dc8f67ac898eb3'
IMAGE='sha256:ac361b6304d4fa20ee251177b01277e37c826173f1ecd2d2afc2f8cb04f7ca9c'
DEPLOY_RECEIPT=pathlib.Path('docs/price-guard-deployed-20261014.json')

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

remote="""import base64,datetime,gzip,importlib.util,json,pathlib,subprocess,time
p=pathlib.Path(%r)/'deploy-reply-release.py';spec=importlib.util.spec_from_file_location('reply_deploy',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
assert m.SHA==%r and m.TESTED==%r and m.EXPECTED_IMAGE==%r and m.IMAGE==%r
deployed=json.loads((pathlib.Path(%r)/'reply-deployed.json').read_text());assert deployed['deployed']==deployed['testedSource']==m.SHA and deployed['image']==m.IMAGE and deployed['rollbackTriggered'] is False
def readonly_node(source,label,container='twin-v2-bot-1',timeout=210):
 r=subprocess.run(['docker','exec','-i',container,'node','--import','tsx','--input-type=module'],input=source,text=True,capture_output=True,timeout=timeout)
 assert r.returncode==0,label+' failed'
 lines=[x[len('RELEASE_JSON '):] for x in r.stdout.splitlines() if x.startswith('RELEASE_JSON ')]
 assert len(lines)==1,label+' missing result'
 return json.loads(lines[0])
m.node=readonly_node
m.runtime(m.EXPECTED_IMAGE,m.SHA)
runtime=[]
for name in m.CONTAINERS:
 info=json.loads(m.out('docker','inspect',name))[0];runtime.append({'name':name,'image':info['Image'],'running':info['State']['Running'],'restarting':info['State'].get('Restarting',False),'revision':next((x.split('=',1)[1] for x in info['Config']['Env'] if x.startswith('GIT_SHA=')),None)})
assert all(x['running'] and not x['restarting'] and x['image']==m.IMAGE and x['revision']==m.SHA for x in runtime)
state=json.loads((m.ROOT/'data/_fleet.json').read_text());age=time.time()-datetime.datetime.fromisoformat(state['at'].replace('Z','+00:00')).timestamp();girls=state.get('girls',{})
assert age<90 and sorted(girls)==m.EXPECTED and all(girls[s].get('status')=='running' for s in m.EXPECTED),'Live fleet is not fresh and fully running'
settings=m.settings();assert settings['settingsHash']==m.PREP['settingsHash']
prompts=m.prompt_check();assert prompts['modelCalls']==prompts['messagesSent']==prompts['databaseWrites']==0
prior={x['slug']:x for x in deployed['promptVerification']['checks']};assert len(prompts['checks'])==len(prior)==17 and len(prompts['health'])==2 and all(x['status']==200 for x in prompts['health'])
for x in prompts['checks']:
 assert x['displayMatches'] and x['previewMatches']
 for key in ['settingsHash','emojiPolicy','testerPrice','normalPrice']:assert x[key]==prior[x['slug']][key],x['slug']+'/'+key
holds_source="import {config} from './src/config.ts';import {activeRequest} from './src/handover.ts';const expected=__EXPECTED__,active=expected.filter(s=>activeRequest(config.dataDir,s));console.log('RELEASE_JSON '+JSON.stringify({active,checked:expected.length}));"
holds=readonly_node(holds_source.replace('__EXPECTED__',json.dumps(m.EXPECTED)),'released-holds')
assert holds['checked']==17 and holds['active']==[],'Deployment holds remain active'
items=[x for x in m.MANIFEST if not x['path'].startswith('archive/')]
assert len(m.MANIFEST)==289 and len(items)==285
check="import fs from 'node:fs';import crypto from 'node:crypto';const items="+json.dumps(items)+";for(const x of items){const b=fs.readFileSync(x.path);if(crypto.createHash('sha1').update('blob '+b.length).update(Buffer.from([0])).update(b).digest('hex')!==x.sha)throw Error(x.path)}console.log('RELEASE_JSON '+JSON.stringify({verified:items.length}));"
bot=m.node(check,'postdeploy-bot-source',timeout=90);dash=m.node(check,'postdeploy-dash-source','twin-v2-dash-1',90);assert bot==dash and bot['verified']==285
value={'status':'complete','deployed':m.SHA,'testedSource':m.TESTED,'image':m.IMAGE,'verifiedAt':m.stamp(),'runtime':runtime,'fleetAt':state['at'],'fleetAgeSeconds':age,'creators':len(girls),'allRunning':True,'holdsReleased':True,'settings':settings,'promptVerification':prompts,'manifestFiles':len(m.MANIFEST),'verifiedSourceFilesPerContainer':bot['verified'],'modelCalls':0,'fanMessages':0,'databaseWrites':0,'productionWrites':0,'runtimeMutations':0,'containerRestarts':0}
print('REPLY_POSTDEPLOY_BASE64 '+base64.b64encode(gzip.compress(json.dumps(value).encode(),mtime=0)).decode())
""" % (BACKUP,SHA,SHA,IMAGE,IMAGE,BACKUP)

result={'status':'not-started','candidate':SHA,'image':IMAGE,'workflowRun':os.environ.get('GITHUB_RUN_ID')}
try:
  deployed_receipt=json.loads(DEPLOY_RECEIPT.read_text())
  assert deployed_receipt.get('status')=='complete' and deployed_receipt.get('workflowRun')=='38449206004','Approved deploy receipt changed'
  assert deployed_receipt.get('deployed')==deployed_receipt.get('testedSource')==SHA and deployed_receipt.get('image')==IMAGE and deployed_receipt.get('rollbackTriggered') is False,'Approved deployment pins changed'
  output=ssm('python3 -c '+shlex.quote(remote))
  line=next(x for x in output.splitlines() if x.startswith('REPLY_POSTDEPLOY_BASE64 '))
  verified=json.loads(gzip.decompress(base64.b64decode(line.split(' ',1)[1])))
  assert verified['status']=='complete' and verified['deployed']==verified['testedSource']==SHA and verified['image']==IMAGE
  assert len(verified.get('runtime',[]))==2 and all(x.get('running') and not x.get('restarting') and x.get('image')==IMAGE and x.get('revision')==SHA for x in verified['runtime'])
  assert verified.get('creators')==17 and verified.get('allRunning') is True and verified.get('fleetAgeSeconds',999)>=0 and verified['fleetAgeSeconds']<90 and verified.get('holdsReleased') is True and verified.get('manifestFiles')==289 and verified.get('verifiedSourceFilesPerContainer')==285
  assert verified.get('settings')==deployed_receipt.get('settings')
  prompts=verified.get('promptVerification',{});assert len(prompts.get('checks',[]))==17 and all(x.get('displayMatches') and x.get('previewMatches') for x in prompts['checks']) and len(prompts.get('health',[]))==2 and all(x.get('status')==200 for x in prompts['health'])
  prior={x['slug']:x for x in deployed_receipt['promptVerification']['checks']}
  assert all(all(x.get(k)==prior[x['slug']].get(k) for k in ['settingsHash','emojiPolicy','testerPrice','normalPrice']) for x in prompts['checks'])
  assert verified.get('modelCalls')==verified.get('fanMessages')==verified.get('databaseWrites')==verified.get('productionWrites')==verified.get('runtimeMutations')==verified.get('containerRestarts')==0
  result.update(verified)
except Exception as exc:result.update(status='verification-failed',error=str(exc)[-1000:])

url='https://api.github.com/repos/jesse98/twin-dashboard/contents/docs/price-guard-postdeploy-20261014.json'
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
