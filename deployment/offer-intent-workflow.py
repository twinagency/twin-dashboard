"""Transfer the reviewed source and run one pinned release phase through the existing SSM identity."""
import base64,gzip,json,os,pathlib,shlex,subprocess,sys,time,urllib.error,urllib.parse,urllib.request
INSTANCE='i-0584d283506f3f6be'
BRANCH=os.environ['GITHUB_REF_NAME']
PHASE=os.environ.get('OFFER_PHASE','prepare')
RECEIPT='docs/olivia-body-'+('prepared' if PHASE=='prepare' else 'deployed')+'-20261014.json'
def ssm(command,timeout=120):
    p=pathlib.Path('/tmp')/('card-ref-'+str(time.time_ns())+'.json')
    p.write_text(json.dumps({'commands':[command],'executionTimeout':[str(timeout)]}))
    cid=subprocess.check_output(['aws','ssm','send-command','--instance-ids',INSTANCE,'--document-name','AWS-RunShellScript','--parameters','file://'+str(p),'--comment','Twin V2 Olivia factual body repair '+PHASE,'--query','Command.CommandId','--output','text'],text=True).strip()
    print(json.dumps({'phase':PHASE,'commandId':cid}),flush=True)
    deadline=time.monotonic()+timeout+30
    while time.monotonic()<deadline:
        try:r=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cid,'--instance-id',INSTANCE,'--output','json'],text=True,stderr=subprocess.DEVNULL))
        except subprocess.CalledProcessError:time.sleep(2);continue
        if r['Status'] in {'Success','Failed','Cancelled','TimedOut'}:break
        time.sleep(2)
    else:raise RuntimeError('Remote phase observation timed out: '+cid)
    output=r.get('StandardOutputContent','')
    if r['Status']!='Success':raise RuntimeError('Remote '+PHASE+' failed: '+r.get('StandardOutputContent','')[-600:]+' '+r.get('StandardErrorContent','')[-1600:])
    return output
result={'status':'not-started','phase':PHASE,'workflowRun':os.environ['GITHUB_RUN_ID']}
try:
    if PHASE=='prepare':
        encoded=pathlib.Path('deployment/offer-release-payload.b64').read_text()
        payload=json.loads(gzip.decompress(base64.b64decode(encoded)))
        sha=payload['candidate'];nonce=str(time.time_ns());folder='/tmp/twin-v2-card-'+sha[:7]+'-'+nonce
        ssm('python3 -c '+shlex.quote('import pathlib;p=pathlib.Path('+repr(folder)+');p.mkdir(mode=0o700)'))
        count=0
        for start in range(0,len(encoded),14000):
            part=encoded[start:start+14000];filename=folder+'/'+str(count)+'.part';count+=1
            code='import pathlib;p=pathlib.Path('+repr(filename)+');p.write_text('+repr(part)+');p.chmod(0o600)'
            ssm('python3 -c '+shlex.quote(code))
        script=pathlib.Path('deployment/prepare-offer-intent.py').read_text()
        code='import base64,gzip,json,pathlib,sys;p=pathlib.Path('+repr(folder)+');b=gzip.decompress(base64.b64decode("".join((p/(str(i)+".part")).read_text() for i in range('+str(count)+'))));payload=p/"source.json";payload.write_bytes(b);payload.chmod(0o600);sys.argv=["prepare-offer-intent.py",str(payload),'+repr(nonce)+'];exec(compile('+repr(script)+',"prepare-offer-intent.py","exec"))'
        output=ssm('python3 -c '+shlex.quote(code),900)
        prefix='REPLY_RELEASE_PREPARED_JSON '
        values=[json.loads(x[len(prefix):]) for x in output.splitlines() if x.startswith(prefix)]
        assert len(values)==1 and values[0]['sha']==sha and values[0]['rollbackReady'] is True
        result.update(values[0],status='complete')
    else:
        script=pathlib.Path('deployment/deploy-offer-intent.py').read_text()
        compile(script,'deploy-offer-intent.py','exec')
        backup='/home/ubuntu/twin-v2-backups/offer-baseline-1294e73-1791960417938487452'
        code='import pathlib,sys;p=pathlib.Path('+repr(backup) + ')/"deploy-offer-intent.py";p.write_text('+repr(script)+');p.chmod(0o600);sys.argv=[str(p)];exec(compile('+repr(script)+',str(p),"exec"))'
        output=ssm('python3 -c '+shlex.quote(code),600)
        prefix='REPLY_RELEASE_DEPLOYED_JSON '
        values=[json.loads(x[len(prefix):]) for x in output.splitlines() if x.startswith(prefix)]
        assert len(values)==1
        result.update(values[0],status='complete')
except Exception as error:
    result.update(status='failed',error=str(error))
url='https://api.github.com/repos/jesse98/twin-dashboard/contents/'+RECEIPT
headers={'Authorization':'Bearer '+os.environ['GITHUB_TOKEN'],'Accept':'application/vnd.github+json','Content-Type':'application/json'}
payload={'message':'Record reviewed offer-intent '+PHASE+' result [skip ci]','branch':BRANCH,'content':base64.b64encode((json.dumps(result,indent=2)+'\n').encode()).decode()}
try:
    with urllib.request.urlopen(urllib.request.Request(url+'?ref='+urllib.parse.quote(BRANCH,safe=''),headers=headers),timeout=30) as r:payload['sha']=json.load(r)['sha']
except urllib.error.HTTPError as error:
    if error.code!=404:raise
with urllib.request.urlopen(urllib.request.Request(url,data=json.dumps(payload).encode(),method='PUT',headers=headers),timeout=30) as r:assert r.status in (200,201)
print(json.dumps({k:result.get(k) for k in ['status','phase','sha','image','deployed','error']}),flush=True)
if result['status']!='complete':sys.exit(1)
