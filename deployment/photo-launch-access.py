"""Read one creator-owned source for the authorised controlled upload; never export credentials."""
import json,pathlib,subprocess,time,urllib.request,base64
instance='i-09a9dd3bd749643a5'
source="const fs=require('fs');(async()=>{const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_KEY;if(new URL(base).hostname!=='aouaenqayfltoqrmpitg.supabase.co')throw Error('Wrong project');const storagePath='c92560e7-1dd9-4e62-b5c3-04a30fbe4925/photos/1787735809138-dreka-cakez-15.jpg';const r=await fetch(base+'/storage/v1/object/sign/media/'+storagePath,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({expiresIn:300})});if(!r.ok)throw Error('Sign failed '+r.status);const d=await r.json();console.log(JSON.stringify({url:base+'/storage/v1'+(d.signedURL||d.signedUrl),storagePath}));})().catch(e=>{console.error(e.message);process.exit(1)});"
command="printf '%s' '"+base64.b64encode(source.encode()).decode()+"' | base64 -d | sudo docker exec -i next-app node"
p=pathlib.Path('/tmp/photo-source-command.json');p.write_text(json.dumps({'commands':[command],'executionTimeout':['60']}))
cid=subprocess.check_output(['aws','ssm','send-command','--instance-ids',instance,'--document-name','AWS-RunShellScript','--parameters','file://'+str(p),'--query','Command.CommandId','--output','text'],text=True).strip()
for _ in range(30):
 try:r=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cid,'--instance-id',instance,'--output','json'],text=True,stderr=subprocess.DEVNULL))
 except subprocess.CalledProcessError:time.sleep(2);continue
 if r['Status'] in ['Success','Failed','Cancelled','TimedOut']:break
 time.sleep(2)
assert r['Status']=='Success','Source access failed'
result=json.loads(r['StandardOutputContent'])
assert result['url'].startswith('https://aouaenqayfltoqrmpitg.supabase.co/storage/v1/object/sign/media/')
out=pathlib.Path('photo-source');out.mkdir()
with urllib.request.urlopen(result['url'],timeout=30) as response:(out/'dreka-15.jpg').write_bytes(response.read())
import hashlib
print(json.dumps({'creator':'dreka-cakez','source_id':'31a95666-c518-4992-a4d1-4ab12f78b858','sha256':hashlib.sha256((out/'dreka-15.jpg').read_bytes()).hexdigest()}))
