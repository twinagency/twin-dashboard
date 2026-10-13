"""Read the isolated candidate result; write a compact evidence file if this workflow has write access."""
import base64,gzip,json,os,pathlib,shlex,subprocess,time,urllib.request

INSTANCE='i-0584d283506f3f6be'
host=r'''
import base64,gzip,json,pathlib,time
root=pathlib.Path('/home/ubuntu/twin-v2-validation')
for _ in range(60):
 dirs=sorted(root.glob('existing-card-candidate-*'),key=lambda p:p.stat().st_mtime,reverse=True)
 if dirs and (dirs[0]/'summary.json').is_file():break
 time.sleep(10)
if dirs:
 p=dirs[0]/'summary.json'
 result=json.loads(p.read_text()) if p.is_file() else {'status':'incomplete','evidencePath':str(dirs[0]),'progress':json.loads((dirs[0]/'progress.json').read_text()) if (dirs[0]/'progress.json').is_file() else []}
else:result={'status':'no-candidate-run-found'}
print('CARD_RESULT_BASE64 '+base64.b64encode(gzip.compress(json.dumps(result).encode(),mtime=0)).decode(),flush=True)
'''
program="import gzip,base64;exec(compile(gzip.decompress(base64.b64decode("+repr(base64.b64encode(gzip.compress(host.encode(),mtime=0)).decode())+")),'<card-result-readonly>','exec'))"
params=pathlib.Path('/tmp')/('card-read-'+str(time.time_ns())+'.json')
params.write_text(json.dumps({'commands':['python3 -c '+shlex.quote(program)],'executionTimeout':['750']}))
cid=subprocess.check_output(['aws','ssm','send-command','--instance-ids',INSTANCE,'--document-name','AWS-RunShellScript',
  '--parameters','file://'+str(params),'--comment','Read isolated card candidate evidence; no production writes',
  '--query','Command.CommandId','--output','text'],text=True).strip()
print(json.dumps({'commandId':cid}),flush=True)
for _ in range(155):
 try:r=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cid,'--instance-id',INSTANCE,'--output','json'],text=True,stderr=subprocess.DEVNULL))
 except subprocess.CalledProcessError:time.sleep(5);continue
 if r['Status'] in ['Success','Failed','Cancelled','TimedOut']:break
 time.sleep(5)
else:raise RuntimeError('Result read incomplete')
if r['Status']!='Success':raise RuntimeError('Result read '+r['Status']+': '+r.get('StandardErrorContent','')[-600:])
line=next(x for x in r['StandardOutputContent'].splitlines() if x.startswith('CARD_RESULT_BASE64 '))
result=json.loads(gzip.decompress(base64.b64decode(line.split(' ',1)[1])))
print('CARD_RESULT_SUMMARY '+json.dumps({k:result.get(k) for k in ['status','candidate','cases','requests','failed','modelCost','settingsUnchanged','productionWrites','evidencePath']}),flush=True)
token=os.environ.get('GITHUB_TOKEN')
if token:
 target='https://api.github.com/repos/jesse98/twin-dashboard/contents/docs/existing-card-candidate-results.json'
 body=json.dumps({'message':'Record isolated existing-card candidate replay [skip ci]','branch':'codex/media-launch-access-20261012',
   'content':base64.b64encode((json.dumps(result,indent=2)+'\n').encode()).decode()}).encode()
 req=urllib.request.Request(target,data=body,method='PUT',headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=20) as response:
  assert response.status==201,'Result evidence was not created'
