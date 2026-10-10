"""Read-only visual review of the creator photos explicitly selected for this UI task.
No credentials, signed URLs or private photo bytes are printed to Actions logs.
The photos remain a one-day private repository artifact.
"""
import json,pathlib,shlex,subprocess,time,urllib.request,urllib.parse
def aws(*args):
    r=subprocess.run(['aws','--region','ap-southeast-2',*args,'--output','json'],capture_output=True,text=True,timeout=45)
    if r.returncode:
        if 'InvocationDoesNotExist' in r.stderr:return {'Status':'Pending'}
        raise RuntimeError('AWS review request failed; private details suppressed')
    return json.loads(r.stdout)
if aws('sts','get-caller-identity')['Account']!='323149985112':raise RuntimeError('Unexpected AWS account')
js="\nconst {configuration,CLONES}=require('./deployment/flirt-live-twin.cjs');\nconst id='2e5eb05f-cc88-4ba6-870a-924948d4b09a';\nif(process.env.FLIRT_SUPABASE_PROJECT_REF!=='lkmfwpqegjluirfusnaw'||!CLONES.includes(id))throw Error('Unexpected runtime');\nconst live=configuration();\nconst headers={apikey:live.key,Authorization:'Bearer '+live.key};\nconst ids=['710d8abd-042a-4c28-8ed0-f06cadfac6b3','260a835f-583e-4b2e-9dc1-64bb9f522749','fccbdad9-203e-47bb-b646-20e93a506ea7','b4345072-1f64-4fdd-b1e0-21f2fbc83ac4','b7822b10-7907-410d-bc66-0286298ce5bd','5a0f635e-7b6b-46ca-a7f3-cb9f87af30e4','20adb126-3da0-468c-b16d-30057b337941','c0e849e2-dcdf-4afc-ab05-b233e5ca99f7','9309f458-ac8b-4113-b37f-945153193b96'];\n(async()=>{\n const r=await fetch(live.url+'/rest/v1/photos?select=id,storage_path,image_name&clone_id=eq.'+id+'&id=in.('+ids.join(',')+')',{headers});\n if(!r.ok)throw Error('Photo read failed');\n const photos=await r.json();\n if(photos.length!==ids.length||photos.some(p=>!p.storage_path.startsWith(id+'/')))throw Error('Photo scope differs');\n const s=await fetch(live.url+'/storage/v1/object/sign/media',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({expiresIn:300,paths:photos.map(p=>p.storage_path)})});\n if(!s.ok)throw Error('Photo signing failed');\n const signed=await s.json();\n const result=photos.map((p,i)=>({id:p.id,name:p.image_name,url:live.url+'/storage/v1'+(signed[i].signedURL||signed[i].signedUrl)}));\n console.log(JSON.stringify(result));\n})().catch(()=>{console.error('Read-only photo review failed; private details suppressed');process.exit(1)});\n"
command='sudo docker exec flirt-dashboard node -e '+shlex.quote(js)
job=aws('ssm','send-command','--cli-input-json',json.dumps({'InstanceIds':['i-09a9dd3bd749643a5'],'DocumentName':'AWS-RunShellScript','Comment':'Read-only Mrs Callace dashboard photo review','Parameters':{'commands':[command],'executionTimeout':['90']}}))['Command']['CommandId']
deadline=time.monotonic()+140
while time.monotonic()<deadline:
    result=aws('ssm','get-command-invocation','--command-id',job,'--instance-id','i-09a9dd3bd749643a5')
    if result['Status'] not in ('Pending','InProgress','Delayed'):break
    time.sleep(2)
if result['Status']!='Success':raise RuntimeError('Photo review failed; private details suppressed')
photos=json.loads(result['StandardOutputContent'])
root=pathlib.Path('/tmp/flirt-overview-review');root.mkdir(exist_ok=True)
for p in photos:
    if not p['url'].startswith('https://aouaenqayfltoqrmpitg.supabase.co/storage/v1/object/sign/media/'):raise RuntimeError('Unexpected photo host')
    try:
        with urllib.request.urlopen(urllib.parse.quote(p['url'],safe=':/?=&%'),timeout=40) as source:
            (root/(p['id']+'.jpg')).write_bytes(source.read())
    except Exception:
        raise RuntimeError('Photo download failed; private URL suppressed') from None
(root/'manifest.json').write_text(json.dumps([{'id':p['id'],'name':p['name']} for p in photos],indent=2))
print(json.dumps({'photos_saved':len(photos),'private_artifact_only':True,'database_writes':False}))
