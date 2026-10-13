"""Read current runtime/settings and saved synthetic reply failures; zero model, Telegram or production writes."""
import base64,gzip,json,os,pathlib,shlex,subprocess,time,urllib.request
INSTANCE='i-0584d283506f3f6be'
BRANCH='codex/v2-reply-release-prep-20261013'
host=r'''
import base64,gzip,json,pathlib
work=pathlib.Path('/home/ubuntu/twin-v2-validation/reply-outcomes-candidate-1791892632127052684')
turns=json.loads((work/'cat-chase/turns.private.json').read_text());exchanges=json.loads((work/'cat-chase/exchanges.private.json').read_text())
t=next(x for x in turns if x['case']=='business-new-after-refusal');x=next(x for x in exchanges if x['case']=='business-new-after-refusal');r=t['row']
result={'candidate':'d6058dcd05dc1cb2646a516fcb1aabf152a280be','case':t['case'],'row':{k:r.get(k) for k in ['fanText','raw','selection','selectionError','final','note','provider','tokensOut','menu','generated','grounding','delivery']},'response':x['response'],'status':x['status'],'allowedSelections':x['request']['response_format']['json_schema']['schema']['properties']['selection']['enum'],'fanMessages':0,'modelCalls':0,'productionWrites':0}
print('REPLY_BASE64 '+base64.b64encode(gzip.compress(json.dumps(result).encode(),mtime=0)).decode())
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
url='https://api.github.com/repos/jesse98/twin-dashboard/contents/docs/reply-replay-v4-failure-detail.json'
body=json.dumps({'message':'Record bounded failed model selection evidence [skip ci]','branch':BRANCH,'content':base64.b64encode((json.dumps(result,indent=2)+'\n').encode()).decode()}).encode()
req=urllib.request.Request(url,data=body,method='PUT',headers={'Authorization':'Bearer '+os.environ['GITHUB_TOKEN'],'Accept':'application/vnd.github+json','Content-Type':'application/json'})
with urllib.request.urlopen(req,timeout=20) as response:assert response.status==201
print('REPLY_READ_SAVED '+json.dumps({'case':result['case'],'modelCalls':0,'productionWrites':0}),flush=True)
