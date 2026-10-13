"""One isolated real-model fleet replay, with result committed to this diagnostic branch."""
import base64,gzip,hashlib,json,os,pathlib,shlex,subprocess,sys,time,urllib.request

INSTANCE='i-0584d283506f3f6be'
BRANCH='codex/v2-reply-model-validation-v5-20261013'
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

result={'status':'not-started','candidate':'9138db6f956ed383d18fe33bce6577b2f5d74d4a','workflowRun':os.environ.get('GITHUB_RUN_ID'),'fanMessages':0,'purchases':0,'productionWrites':0}
try:
  paths=[]
  for filename in ['reply-outcomes-candidate.patch','run-reply-outcomes-candidate.py','simulate-reply-outcomes.mjs']:
    raw=(ROOT/filename).read_bytes();remote='/tmp/twin-card-'+nonce+'-'+filename
    encoded=base64.b64encode(gzip.compress(raw,mtime=0)).decode()
    program="import base64,gzip,hashlib,pathlib;raw=gzip.decompress(base64.b64decode("+repr(encoded)+"));assert hashlib.sha256(raw).hexdigest()=="+repr(hashlib.sha256(raw).hexdigest())+";pathlib.Path("+repr(remote)+").write_bytes(raw)"
    ssm('python3 -c '+shlex.quote(program),90)
    paths.append(remote)
  ssm('python3 '+shlex.quote(paths[1])+' '+shlex.quote(paths[0])+' '+shlex.quote(nonce)+' '+shlex.quote(paths[2]),1400)
  host="import base64,gzip,json,pathlib;p=pathlib.Path('/home/ubuntu/twin-v2-validation/reply-outcomes-candidate-"+nonce+"/summary.json');assert p.is_file(),'candidate summary missing';print('CARD_RESULT_BASE64 '+base64.b64encode(gzip.compress(p.read_bytes(),mtime=0)).decode())"
  output=ssm('python3 -c '+shlex.quote(host),60)
  line=next(x for x in output.splitlines() if x.startswith('CARD_RESULT_BASE64 '))
  result=json.loads(gzip.decompress(base64.b64decode(line.split(' ',1)[1])))
  result['status']='complete';result['workflowRun']=os.environ.get('GITHUB_RUN_ID')
except Exception as exc:
  result.update(status='validation-failed',error=str(exc)[-1000:])

token=os.environ['GITHUB_TOKEN']
url='https://api.github.com/repos/jesse98/twin-dashboard/contents/docs/reply-outcomes-candidate-v5-results.json'
body=json.dumps({'message':'Record isolated V2 card candidate result [skip ci]','branch':BRANCH,
  'content':base64.b64encode((json.dumps(result,indent=2)+'\n').encode()).decode()}).encode()
req=urllib.request.Request(url,data=body,method='PUT',headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','Content-Type':'application/json'})
with urllib.request.urlopen(req,timeout=30) as response:assert response.status==201,'Evidence commit failed'
print('CARD_RESULT_STATUS '+json.dumps({k:result.get(k) for k in ['status','cases','requests','failed','modelCost','error','productionWrites']}),flush=True)
if result['status']!='complete' or result.get('failed') or not result.get('promptDisplayConsistent') or any(x.get('fatal') for x in result.get('creators',[])):sys.exit(1)
