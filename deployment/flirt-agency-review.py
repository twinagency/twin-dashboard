"""Read-only selected portrait review. Private media stays in a one-day artifact."""
import json,pathlib,shlex,subprocess,time,urllib.request,urllib.parse

def aws(*args):
    r=subprocess.run(['aws','--region','ap-southeast-2',*args,'--output','json'],capture_output=True,text=True,timeout=45)
    if r.returncode:
        if 'InvocationDoesNotExist' in r.stderr:return {'Status':'Pending'}
        raise RuntimeError('Review request failed; private details suppressed')
    return json.loads(r.stdout)
if aws('sts','get-caller-identity')['Account']!='323149985112':raise RuntimeError('Unexpected AWS account')
js=r"""
const {configuration,CLONES}=require('./deployment/flirt-live-twin.cjs');
if(process.env.FLIRT_SUPABASE_PROJECT_REF!=='lkmfwpqegjluirfusnaw')throw Error('Unexpected runtime');
const live=configuration(),headers={apikey:live.key,Authorization:'Bearer '+live.key};
const ids=['487f9d94-4205-439e-b7f5-74e008fdee91','f2fdc608-ba8f-4cc8-8893-0350d036b1f4','a786709e-7742-4ace-a4f4-c2b8da2b73d1','260a835f-583e-4b2e-9dc1-64bb9f522749','365c9bee-f5ba-4bc3-8dc6-2193a42f7c8a','f55a58c4-0cd0-4d7c-9b18-29be42dd7a9d','746b4bc1-7f59-4d3a-bb4e-c4f713a2c5b8','5a0f635e-7b6b-46ca-a7f3-cb9f87af30e4','710d8abd-042a-4c28-8ed0-f06cadfac6b3','961065a1-49dd-4805-93a3-76239e915a93','b8258ae3-6d91-4ecf-8a4a-a53c7803a72b','37ee27aa-d91f-4bcf-ac91-38d42f320fe3','df4c2960-e3d1-423d-8c3d-631d793b83a8','ff76f955-19c7-4d3d-84ea-e36b0dfe11dd','b342ff24-7945-481c-8fde-4263566086ff'];
(async()=>{
const r=await fetch(live.url+'/rest/v1/photos?select=id,clone_id,storage_path&clone_id=in.('+CLONES.join(',')+')&id=in.('+ids.join(',')+')',{headers});
if(!r.ok)throw Error('Photo read failed');const photos=await r.json();
if(photos.length!==ids.length||photos.some(p=>!CLONES.includes(p.clone_id)||!p.storage_path.startsWith(p.clone_id+'/')))throw Error('Photo scope differs');
const c=await fetch(live.url+'/rest/v1/clones?select=id,name,intake&id=in.('+CLONES.join(',')+')&order=created_at',{headers});if(!c.ok)throw Error('Creator read failed');const clones=await c.json();
const bri=clones.find(c=>c.id==='0328e7b3-a1e5-465a-9a30-c9cf6519cba1');if(bri?.intake?.appearance?.profile_image_path)photos.push({id:'profile-'+bri.id,clone_id:bri.id,storage_path:bri.intake.appearance.profile_image_path});
const s=await fetch(live.url+'/storage/v1/object/sign/media',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({expiresIn:600,paths:photos.map(p=>p.storage_path)})});if(!s.ok)throw Error('Signing failed');const signed=await s.json();
console.log(JSON.stringify(photos.map((p,i)=>({id:p.id,clone:p.clone_id,url:live.url+'/storage/v1'+(signed[i].signedURL||signed[i].signedUrl)}))));
})().catch(()=>{console.error('Read-only photo review failed');process.exit(1)});
"""
command='sudo docker exec flirt-dashboard node -e '+shlex.quote(js)
job=aws('ssm','send-command','--cli-input-json',json.dumps({'InstanceIds':['i-09a9dd3bd749643a5'],'DocumentName':'AWS-RunShellScript','Comment':'Read-only FLIRT agency overview photo review','Parameters':{'commands':[command],'executionTimeout':['90']}}))['Command']['CommandId']
deadline=time.monotonic()+140
while time.monotonic()<deadline:
    result=aws('ssm','get-command-invocation','--command-id',job,'--instance-id','i-09a9dd3bd749643a5')
    if result['Status'] not in ('Pending','InProgress','Delayed'):break
    time.sleep(2)
if result['Status']!='Success':raise RuntimeError('Photo review failed; private details suppressed')
photos=json.loads(result['StandardOutputContent'])
root=pathlib.Path('/tmp/flirt-agency-review');root.mkdir(exist_ok=True)
for p in photos:
    if not p['url'].startswith('https://aouaenqayfltoqrmpitg.supabase.co/storage/v1/object/sign/media/'):raise RuntimeError('Unexpected photo host')
    try:
        with urllib.request.urlopen(urllib.parse.quote(p['url'],safe=':/?=&%'),timeout=40) as source:
            (root/(p['id']+'.jpg')).write_bytes(source.read())
    except Exception:
        raise RuntimeError('Photo download failed; private URL suppressed') from None
(root/'manifest.json').write_text(json.dumps([{'id':p['id'],'clone':p['clone']} for p in photos],indent=2))
print(json.dumps({'photos_saved':len(photos),'private_artifact_only':True,'database_writes':False}))
