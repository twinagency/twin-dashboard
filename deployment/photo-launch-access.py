"""Read the one failed synthetic resend turn; no model call or production write."""
import base64,gzip,json,os,pathlib,shlex,subprocess,time,urllib.request

instance='i-0584d283506f3f6be'
branch='codex/v2-card-model-validation-20261013'
host=r'''
import base64,gzip,json,pathlib
root=pathlib.Path('/home/ubuntu/twin-v2-validation')
work=max((p for p in root.glob('existing-card-candidate-*') if (p/'summary.json').is_file()),key=lambda p:p.stat().st_mtime)
turns=json.loads((work/'trashy'/'turns.private.json').read_text())
exchanges=json.loads((work/'trashy'/'exchanges.private.json').read_text())
names=['ordinary-new-photo','ordinary-card-price','ordinary-same-resend']
result=[]
for name in names:
 t=next(x for x in turns if x['case']==name);r=t['row']
 ex=next(x for x in exchanges if x['case']==name)
 result.append({'case':name,'input':r.get('fanText'),'beforePhoto':t['before'].get('photo'),'afterPhoto':t['after'].get('photo'),
  'historyTail':t['before'].get('history',[])[-3:],'choices':ex['request']['response_format']['json_schema']['schema']['properties']['selection']['enum'],
  'raw':r.get('raw'),'selection':r.get('selection'),'selectionError':r.get('selectionError'),'photoReference':r.get('photoReference'),
  'note':r.get('note'),'selected':r.get('selectedMedia'),'delivery':r.get('delivery'),'menu':r.get('menu'),'final':r.get('final')})
packed=gzip.compress(json.dumps({'candidate':json.loads((work/'summary.json').read_text())['candidate'],'evidencePath':str(work),'turns':result}).encode(),mtime=0)
print('DETAIL_BASE64 '+base64.b64encode(packed).decode(),flush=True)
'''
payload=base64.b64encode(gzip.compress(host.encode(),mtime=0)).decode()
program="import base64,gzip;exec(compile(gzip.decompress(base64.b64decode("+repr(payload)+")),'<card-failure-readonly>','exec'))"
params=pathlib.Path('/tmp')/('card-detail-'+str(time.time_ns())+'.json')
params.write_text(json.dumps({'commands':['python3 -c '+shlex.quote(program)],'executionTimeout':['90']}))
cid=subprocess.check_output(['aws','ssm','send-command','--instance-ids',instance,'--document-name','AWS-RunShellScript',
  '--parameters','file://'+str(params),'--comment','Read one synthetic resend failure; no model call or production write',
  '--query','Command.CommandId','--output','text'],text=True).strip()
for _ in range(36):
 try:r=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cid,'--instance-id',instance,'--output','json'],text=True,stderr=subprocess.DEVNULL))
 except subprocess.CalledProcessError:time.sleep(3);continue
 if r['Status'] in ['Success','Failed','Cancelled','TimedOut']:break
 time.sleep(3)
else:raise RuntimeError('Detail read incomplete')
if r['Status']!='Success':raise RuntimeError('Detail read '+r['Status']+': '+r.get('StandardErrorContent','')[-600:])
line=next(x for x in r['StandardOutputContent'].splitlines() if x.startswith('DETAIL_BASE64 '))
detail=json.loads(gzip.decompress(base64.b64decode(line.split(' ',1)[1])))
url='https://api.github.com/repos/jesse98/twin-dashboard/contents/docs/existing-card-candidate-failure-detail.json'
body=json.dumps({'message':'Record bounded synthetic resend failure evidence [skip ci]','branch':branch,
  'content':base64.b64encode((json.dumps(detail,indent=2)+'\n').encode()).decode()}).encode()
req=urllib.request.Request(url,data=body,method='PUT',headers={'Authorization':'Bearer '+os.environ['GITHUB_TOKEN'],'Accept':'application/vnd.github+json','Content-Type':'application/json'})
with urllib.request.urlopen(req,timeout=20) as response:assert response.status==201
print('CARD_DETAIL_SAVED '+json.dumps({'cases':[x['case'] for x in detail['turns']]}),flush=True)
