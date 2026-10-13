"""Read saved synthetic model flags from the completed candidate replay; no model or production writes."""
import base64,gzip,json,os,pathlib,shlex,subprocess,time,urllib.request

INSTANCE='i-0584d283506f3f6be'
BRANCH='codex/v2-card-model-validation-v2-20261013'
host=r'''
import base64,gzip,json,pathlib
work=pathlib.Path('/home/ubuntu/twin-v2-validation/existing-card-candidate-1791886409126200455')
summary=json.loads((work/'summary.json').read_text())
assert summary['candidate']=='cae54ad62434d6f804ddb9d81b5da51e89fde506'
rows={}
for flag in summary['flaggedTurns']:
 slug,case=flag['slug'],flag['case']
 if slug not in rows:rows[slug]={t['case']:t['row'] for t in json.loads((work/slug/'turns.private.json').read_text())}
assert all(f['case'] in rows[f['slug']] for f in summary['flaggedTurns'])
result=[{'slug':f['slug'],'case':f['case'],'flags':f['flags'],
         'input':rows[f['slug']][f['case']].get('fanText'),
         'raw':rows[f['slug']][f['case']].get('raw'),
         'final':rows[f['slug']][f['case']].get('final'),
         'note':rows[f['slug']][f['case']].get('note'),
         'delivery':rows[f['slug']][f['case']].get('delivery')}
        for f in summary['flaggedTurns']]
print('CARD_FLAGS_BASE64 '+base64.b64encode(gzip.compress(json.dumps({'candidate':summary['candidate'],'cases':result}).encode(),mtime=0)).decode(),flush=True)
'''
payload=base64.b64encode(gzip.compress(host.encode(),mtime=0)).decode()
program="import base64,gzip;exec(compile(gzip.decompress(base64.b64decode("+repr(payload)+")),'<card-flags-readonly>','exec'))"
params=pathlib.Path('/tmp')/('card-flags-'+str(time.time_ns())+'.json')
params.write_text(json.dumps({'commands':['python3 -c '+shlex.quote(program)],'executionTimeout':['90']}))
cid=subprocess.check_output(['aws','ssm','send-command','--instance-ids',INSTANCE,'--document-name','AWS-RunShellScript',
  '--parameters','file://'+str(params),'--comment','Read synthetic V2 card flags; no model call or production write',
  '--query','Command.CommandId','--output','text'],text=True).strip()
for _ in range(36):
 try:r=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cid,'--instance-id',INSTANCE,'--output','json'],text=True,stderr=subprocess.DEVNULL))
 except subprocess.CalledProcessError:time.sleep(3);continue
 if r['Status'] in ['Success','Failed','Cancelled','TimedOut']:break
 time.sleep(3)
else:raise RuntimeError('Flag read incomplete')
if r['Status']!='Success':raise RuntimeError('Flag read '+r['Status']+': '+r.get('StandardErrorContent','')[-600:])
line=next(x for x in r['StandardOutputContent'].splitlines() if x.startswith('CARD_FLAGS_BASE64 '))
result=json.loads(gzip.decompress(base64.b64decode(line.split(' ',1)[1])))
url='https://api.github.com/repos/jesse98/twin-dashboard/contents/docs/existing-card-candidate-v2-flags.json'
body=json.dumps({'message':'Record bounded synthetic model flag evidence [skip ci]','branch':BRANCH,
  'content':base64.b64encode((json.dumps(result,indent=2)+'\n').encode()).decode()}).encode()
req=urllib.request.Request(url,data=body,method='PUT',headers={'Authorization':'Bearer '+os.environ['GITHUB_TOKEN'],'Accept':'application/vnd.github+json','Content-Type':'application/json'})
with urllib.request.urlopen(req,timeout=20) as response:assert response.status==201
print('CARD_FLAGS_SAVED '+json.dumps({'cases':len(result['cases'])}),flush=True)
