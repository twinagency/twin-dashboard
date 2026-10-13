"""Prepare pinned release and rollback; no live runtime replacement, fan sends or model calls."""
import base64,gzip,hashlib,json,os,pathlib,shlex,subprocess,sys,time,urllib.request
INSTANCE='i-0584d283506f3f6be'
BRANCH='codex/v2-reply-release-prep-v4-20261013'
ROOT=pathlib.Path('deployment/v2-photo-recovery')
nonce=str(time.time_ns())
def ssm(command,timeout):
  params=pathlib.Path('/tmp')/('card-probe-'+str(time.time_ns())+'.json')
  params.write_text(json.dumps({'commands':[command],'executionTimeout':[str(timeout)]}))
  cid=subprocess.check_output(['aws','ssm','send-command','--instance-ids',INSTANCE,'--document-name','AWS-RunShellScript',
    '--parameters','file://'+str(params),'--comment','Isolated V2 card model replay; no fan or production writes',
    '--query','Command.CommandId','--output','text'],text=True).strip()
  print(json.dumps({'commandId':cid}),flush=True)
  for _ in range(timeout//5+25):
    try:r=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cid,'--instance-id',INSTANCE,'--output','json'],text=True,stderr=subprocess.DEVNULL))
    except subprocess.CalledProcessError:time.sleep(5);continue
    if r['Status'] in ['Success','Failed','Cancelled','TimedOut']:break
    time.sleep(5)
  else:raise RuntimeError('SSM command incomplete')
  if r['Status']!='Success':raise RuntimeError('SSM '+r['Status']+': '+r.get('StandardErrorContent','')[-700:])
  return r.get('StandardOutputContent','')


result={'status':'not-started','candidate':'9138db6f956ed383d18fe33bce6577b2f5d74d4a','workflowRun':os.environ.get('GITHUB_RUN_ID'),'liveRuntimeReplaced':False,'modelCalls':0,'fanMessages':0,'purchases':0}
try:
 paths=[]
 for filename in ['reply-release-source.json','prepare-reply-release.py']:
  raw=(ROOT/filename).read_bytes();remote='/tmp/twin-reply-prep-'+nonce+'-'+filename;encoded=base64.b64encode(gzip.compress(raw,mtime=0)).decode();chunks=[encoded[i:i+24000] for i in range(0,len(encoded),24000)]
  for i,chunk in enumerate(chunks):
   program="import pathlib;p=pathlib.Path("+repr(remote+'.b64')+");p.open("+repr('w' if i==0 else 'a')+").write("+repr(chunk)+");p.chmod(0o600)"
   ssm('python3 -c '+shlex.quote(program),90)
  program="import base64,gzip,hashlib,pathlib;p=pathlib.Path("+repr(remote+'.b64')+");raw=gzip.decompress(base64.b64decode(p.read_text()));assert hashlib.sha256(raw).hexdigest()=="+repr(hashlib.sha256(raw).hexdigest())+";target=pathlib.Path("+repr(remote)+");target.write_bytes(raw);target.chmod(0o600);p.unlink()"
  ssm('python3 -c '+shlex.quote(program),90);paths.append(remote)
 ssm('python3 '+shlex.quote(paths[1])+' '+shlex.quote(paths[0])+' '+shlex.quote(nonce),1400)
 host="import base64,gzip,pathlib;p=pathlib.Path('/home/ubuntu/twin-v2-backups/reply-baseline-9138db6-"+nonce+"/reply-prepared.json');assert p.is_file();print('PREP_BASE64 '+base64.b64encode(gzip.compress(p.read_bytes(),mtime=0)).decode())"
 output=ssm('python3 -c '+shlex.quote(host),60);line=next(x for x in output.splitlines() if x.startswith('PREP_BASE64 '));result.update(json.loads(gzip.decompress(base64.b64decode(line.split(' ',1)[1]))));result['status']='prepared'
except Exception as exc:result.update(status='preparation-failed',error=str(exc)[-1000:])
url='https://api.github.com/repos/jesse98/twin-dashboard/contents/docs/reply-release-prepared-v4.json'
body=json.dumps({'message':'Record pinned reply release preparation [skip ci]','branch':BRANCH,'content':base64.b64encode((json.dumps(result,indent=2)+'\n').encode()).decode()}).encode()
req=urllib.request.Request(url,data=body,method='PUT',headers={'Authorization':'Bearer '+os.environ['GITHUB_TOKEN'],'Accept':'application/vnd.github+json','Content-Type':'application/json'})
with urllib.request.urlopen(req,timeout=30) as response:assert response.status==201
print('PREP_RESULT '+json.dumps({k:result.get(k) for k in ['status','sha','image','backup','error','liveRuntimeReplaced']}),flush=True)
if result['status']!='prepared':sys.exit(1)
