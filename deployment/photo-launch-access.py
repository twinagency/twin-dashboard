"""Transfer and deploy the approved reply release, then retain its sanitized receipt."""
import base64,gzip,hashlib,json,os,pathlib,shlex,subprocess,sys,time,urllib.error,urllib.parse,urllib.request

INSTANCE='i-0584d283506f3f6be'
BRANCH='codex/v2-price-guard-deploy-20261014'
BACKUP='/home/ubuntu/twin-v2-backups/reply-baseline-771f713-1791916541369657274'
SOURCE=pathlib.Path('deployment/v2-photo-recovery/deploy-reply-release.py')
PREP_RECEIPT=pathlib.Path('docs/price-guard-release-prepared-20261014.json')

def ssm(command,timeout=120):
  params=pathlib.Path('/tmp')/('reply-deploy-'+str(time.time_ns())+'.json')
  params.write_text(json.dumps({'commands':[command],'executionTimeout':[str(timeout)]}))
  cid=subprocess.check_output(['aws','ssm','send-command','--instance-ids',INSTANCE,'--document-name','AWS-RunShellScript',
    '--parameters','file://'+str(params),'--comment','Deploy approved V2 reply release with fleet drain and rollback',
    '--query','Command.CommandId','--output','text'],text=True).strip()
  if timeout>120:print(json.dumps({'commandId':cid,'phase':'authorised reply release deployment'}),flush=True)
  for _ in range(timeout//3+20):
    try:r=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cid,'--instance-id',INSTANCE,'--output','json'],text=True,stderr=subprocess.DEVNULL))
    except subprocess.CalledProcessError:time.sleep(3);continue
    if r['Status'] in ['Success','Failed','Cancelled','TimedOut']:break
    time.sleep(3)
  else:raise RuntimeError('Deployment SSM command incomplete')
  print(r.get('StandardOutputContent',''),flush=True)
  if r['Status']!='Success':raise RuntimeError('Deployment '+r['Status']+': '+r.get('StandardErrorContent','')[-700:])
  return r.get('StandardOutputContent','')

def validate(deployed,prepared):
  assert deployed.get('deployed')=='771f713b58c11d1b0fcf094595dc8f67ac898eb3' and deployed.get('testedSource')=='771f713b58c11d1b0fcf094595dc8f67ac898eb3' and deployed.get('image')=='sha256:ac361b6304d4fa20ee251177b01277e37c826173f1ecd2d2afc2f8cb04f7ca9c','Deployment receipt pins changed'
  gate=deployed.get('financialGate',{});assert gate.get('creators')==gate.get('drained')==17 and gate.get('rpcChecks')==34 and gate.get('owed')==gate.get('reservedTurns')==gate.get('openExceptions')==gate.get('awaitingReceiptRefunds')==0,'Deployment financial gate incomplete'
  cutover=deployed.get('cutover',{});assert cutover.get('baselineRevision')=='9138db6f956ed383d18fe33bce6577b2f5d74d4a' and cutover.get('holdsMaintainedUntilVerification') is True and cutover.get('holdsReleased') is True,'Deployment cutover receipt incomplete'
  prompts=deployed.get('promptVerification',{});assert len(prompts.get('checks',[]))==17 and all(x.get('displayMatches') and x.get('previewMatches') for x in prompts['checks']) and len(prompts.get('health',[]))==2 and all(x.get('status')==200 for x in prompts['health']),'Prompt/dashboard gate incomplete'
  fleet=deployed.get('fleet',{}).get('girls',{});assert len(fleet)==17 and all(x.get('status')=='running' for x in fleet.values()) and deployed.get('verifiedSourceFilesPerContainer')==285,'Fleet/source verification incomplete'
  assert deployed.get('settings',{}).get('settingsHash')==prepared.get('settingsHash') and deployed.get('rollbackTriggered') is False,'Settings changed or rollback triggered'
  return deployed

attempt_started=time.time()
result={'status':'not-started','candidate':'771f713b58c11d1b0fcf094595dc8f67ac898eb3','workflowRun':os.environ.get('GITHUB_RUN_ID')}
try:
  prepared=json.loads(PREP_RECEIPT.read_text())
  assert prepared.get('status')=='prepared' and prepared.get('workflowRun')=='38447992657','Approved preparation receipt changed'
  assert prepared.get('sha')==prepared.get('testedSource')==result['candidate'] and prepared.get('image')=='sha256:ac361b6304d4fa20ee251177b01277e37c826173f1ecd2d2afc2f8cb04f7ca9c','Prepared candidate/image changed'
  assert prepared.get('release')=='/home/ubuntu/twin-v2-reply-releases/771f713b58c11d1b0fcf094595dc8f67ac898eb3' and prepared.get('backup')==BACKUP,'Prepared release/backup path changed'
  stage='/tmp/twin-reply-deploy-771f713-'+str(time.time_ns())
  raw=SOURCE.read_bytes();packed=base64.b64encode(gzip.compress(raw,mtime=0)).decode();digest=hashlib.sha256(raw).hexdigest()
  ssm('mkdir -p '+shlex.quote(stage)+' && chmod 700 '+shlex.quote(stage),30)
  for n in range(0,len(packed),10000):ssm("printf '%s' '"+packed[n:n+10000]+"' >> "+shlex.quote(stage+'/script.b64'),30)
  unpack="import pathlib,base64,gzip,hashlib;root=pathlib.Path("+repr(stage)+");raw=gzip.decompress(base64.b64decode((root/'script.b64').read_bytes()));assert hashlib.sha256(raw).hexdigest()=="+repr(digest)+";p=root/'deploy-reply-release.py';p.write_bytes(raw);p.chmod(0o600)"
  ssm('python3 -c '+shlex.quote(unpack),30)
  install="import pathlib;src=pathlib.Path("+repr(stage+'/deploy-reply-release.py')+");dst=pathlib.Path("+repr(BACKUP+'/deploy-reply-release.py')+");assert not dst.exists() or dst.read_bytes()==src.read_bytes(),'Reviewed deployment script changed';dst.write_bytes(src.read_bytes());dst.chmod(0o600)"
  ssm('python3 -c '+shlex.quote(install),30)
  ssm('python3 -u '+shlex.quote(BACKUP+'/deploy-reply-release.py'),850)
  read="import base64,gzip,pathlib;p=pathlib.Path("+repr(BACKUP+'/reply-deployed.json')+");assert p.is_file();print('REPLY_DEPLOY_BASE64 '+base64.b64encode(gzip.compress(p.read_bytes(),mtime=0)).decode())"
  output=ssm('python3 -c '+shlex.quote(read),60)
  line=next(x for x in output.splitlines() if x.startswith('REPLY_DEPLOY_BASE64 '))
  deployed=json.loads(gzip.decompress(base64.b64decode(line.split(' ',1)[1])))
  result.update(validate(deployed,prepared));result['status']='complete'
except Exception as exc:
  result.update(status='deployment-failed',error=str(exc)[-1000:])
  try:
    recover="""import base64,gzip,json,pathlib,subprocess
p=pathlib.Path(%r);value=json.loads((p/'reply-deployed.json').read_text())
assert value.get('deployed')==%r and value.get('testedSource')==%r and value.get('image')==%r
for name in ['twin-v2-bot-1','twin-v2-dash-1']:
 info=json.loads(subprocess.check_output(['docker','inspect',name],text=True))[0]
 assert info['State']['Running'] and not info['State'].get('Restarting') and info['Image']==value['image'] and 'GIT_SHA='+value['deployed'] in info['Config']['Env']
print('REPLY_RECOVERED_BASE64 '+base64.b64encode(gzip.compress(json.dumps(value).encode(),mtime=0)).decode())
""" % (BACKUP,'771f713b58c11d1b0fcf094595dc8f67ac898eb3','771f713b58c11d1b0fcf094595dc8f67ac898eb3','sha256:ac361b6304d4fa20ee251177b01277e37c826173f1ecd2d2afc2f8cb04f7ca9c')
    recovered_output=ssm('python3 -c '+shlex.quote(recover),60)
    recovered_line=next(x for x in recovered_output.splitlines() if x.startswith('REPLY_RECOVERED_BASE64 '))
    recovered=json.loads(gzip.decompress(base64.b64decode(recovered_line.split(' ',1)[1])))
    result.update(validate(recovered,prepared));result.pop('error',None);result['status']='complete';result['receiptRecoveredAfterTransportError']=True
  except Exception:
    pass
  try:
    if result['status']=='complete':raise StopIteration
    read_failure="""import base64,gzip,json,pathlib
p=pathlib.Path(%r)
started=%r
failed=sorted((x for x in p.glob('reply-deploy-failed-*.json') if x.stat().st_mtime>=started-5),key=lambda x:x.stat().st_mtime)
rb=p/'reply-rollback-result.json';value={'failure':json.loads(failed[-1].read_text()) if failed else None,'rollback':json.loads(rb.read_text()) if rb.is_file() and rb.stat().st_mtime>=started-5 else None}
print('REPLY_FAILURE_BASE64 '+base64.b64encode(gzip.compress(json.dumps(value).encode(),mtime=0)).decode())
""" % (BACKUP,attempt_started)
    failure_output=ssm('python3 -c '+shlex.quote(read_failure),60)
    failure_line=next(x for x in failure_output.splitlines() if x.startswith('REPLY_FAILURE_BASE64 '))
    result.update(json.loads(gzip.decompress(base64.b64decode(failure_line.split(' ',1)[1]))))
  except StopIteration:pass
  except Exception as receipt_exc:result['failureReceiptError']=str(receipt_exc)[-500:]

url='https://api.github.com/repos/jesse98/twin-dashboard/contents/docs/price-guard-deployed-20261014.json'
payload={'message':'Record guarded V2 reply deployment [skip ci]','branch':BRANCH,
  'content':base64.b64encode((json.dumps(result,indent=2)+'\n').encode()).decode()}
try:
  current_url=url+'?ref='+urllib.parse.quote(BRANCH,safe='')
  current_req=urllib.request.Request(current_url,headers={'Authorization':'Bearer '+os.environ['GITHUB_TOKEN'],'Accept':'application/vnd.github+json'})
  with urllib.request.urlopen(current_req,timeout=30) as response:payload['sha']=json.load(response)['sha']
except urllib.error.HTTPError as existing:
  if existing.code!=404:raise
body=json.dumps(payload).encode()
req=urllib.request.Request(url,data=body,method='PUT',headers={'Authorization':'Bearer '+os.environ['GITHUB_TOKEN'],'Accept':'application/vnd.github+json','Content-Type':'application/json'})
with urllib.request.urlopen(req,timeout=30) as response:assert response.status in [200,201]
print('REPLY_DEPLOY_STATUS '+json.dumps({k:result.get(k) for k in ['status','deployed','image','backup','error']}),flush=True)
if result['status']!='complete':sys.exit(1)
