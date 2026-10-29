#!/usr/bin/env python3
"""One-time, source-pinned CRM promotion through the existing SSM permission."""
import argparse
import base64
import json
import re
import subprocess
import time

SOURCE = '81b74018841803be2f6356de6c960653c416fdde'
INSTANCE = 'i-09a9dd3bd749643a5'
EXPECTED = 'sha256:6c4a1e77c2bf7ef7d2de4f443e31a6ee669ad9ea0de41f21b3ee85814b0a12af'
REPOSITORY = '323149985112.dkr.ecr.ap-southeast-2.amazonaws.com/twin-dashboard'

def aws(*args):
    return json.loads(subprocess.check_output(['aws','--region','ap-southeast-2',*args,'--output','json'],text=True))

def invoke(script):
    encoded=base64.b64encode(script.encode()).decode()
    command="python3 -c \"import base64;exec(base64.b64decode('"+encoded+"'))\""
    job=aws('ssm','send-command','--cli-input-json',json.dumps({'InstanceIds':[INSTANCE],
        'DocumentName':'AWS-RunShellScript','Comment':'CRM '+SOURCE,
        'Parameters':{'commands':[command],'executionTimeout':['300']}}))['Command']['CommandId']
    print('SSM command:',job,flush=True)
    deadline=time.monotonic()+330
    while time.monotonic()<deadline:
        try:state=aws('ssm','get-command-invocation','--command-id',job,'--instance-id',INSTANCE)
        except subprocess.CalledProcessError:time.sleep(2);continue
        if state['Status'] not in ('Pending','InProgress','Delayed'):
            print(state.get('StandardOutputContent',''),flush=True)
            print(state.get('StandardErrorContent',''),flush=True)
            if state['Status']!='Success':raise RuntimeError('CRM release command failed: '+state['Status'])
            return
        time.sleep(3)
    raise RuntimeError('CRM release command did not finish; inspect the same command before retrying')

PREFLIGHT = '''import json,subprocess
def inspect(name):return json.loads(subprocess.check_output(['docker','inspect',name]))[0]
d=inspect('next-app');env=dict(x.split('=',1) for x in d['Config']['Env'] if '=' in x)
print(json.dumps({'component':'dashboard','image':d['Image'],'source':env.get('GIT_SHA'),'running':d['State']['Running']}))
assert d['Image']==EXPECTED and env.get('GIT_SHA')=='038fb83b5cdba4c3b9521d76e85114a44451b2ee' and d['State']['Running'],'Dashboard changed; do not overwrite newer work'
assert not d['Mounts'],'Unexpected dashboard mounts'
for name in ('twin-onlyfans-api-1','twin-onlyfans-worker-1','twin-onlyfans-fastt-supervisor-1'):
 b=inspect(name)
 print(json.dumps({'component':name,'image':b['Image'],'source':(b['Config'].get('Labels') or {}).get('org.opencontainers.image.revision'),'running':b['State']['Running']}))
 assert b['Image']=='sha256:afe0d86c4a7b5684c87997d17c0b8207f7926ed3c7bb87cf0d58e64aac9b36eb' and b['State']['Running'],'Backend changed; inspect compatibility before promotion'
'''

PROMOTE = '''import pathlib,socket,http.client,urllib.request,time,re
root=pathlib.Path('/var/lib/twin-release/crm-video-repairs-20261028/dashboard-'+SOURCE[:8]);root.mkdir(exist_ok=True)
snapshot=root/'container.before.json'
assert not snapshot.exists(),'Promotion already attempted; inspect its retained containers before retrying'
snapshot.write_text(json.dumps(d));snapshot.chmod(0o600)
password=subprocess.check_output(['aws','ecr','get-login-password','--region','ap-southeast-2'],text=True)
subprocess.run(['docker','login','--username','AWS','--password-stdin',REPOSITORY.split('/')[0]],input=password,text=True,capture_output=True,check=True)
del password
subprocess.run(['docker','pull',IMAGE],check=True)
image=json.loads(subprocess.check_output(['docker','image','inspect',IMAGE]))[0]
image_env=dict(x.split('=',1) for x in image['Config']['Env'] if '=' in x)
assert image_env.get('GIT_SHA')==SOURCE,'Image source does not match the tested commit'
assert inspect('next-app')['Id']==d['Id'],'Dashboard changed during pull'
upload_check="const fs=require('node:fs');if(process.env.SUPABASE_URL!=='https://aouaenqayfltoqrmpitg.supabase.co')process.exit(2);process.exit(fs.readdirSync('/tmp').some(x=>x.startsWith('creator-upload-'))?3:0)"
assert subprocess.run(['docker','exec','next-app','node','-e',upload_check],capture_output=True).returncode==0,'Creator uploads became active or target could not be verified; no swap performed'
# Preserve the complete running configuration, with no env-file or dirty checkout read.
config=dict(d['Config']);config.update(Image=IMAGE,Hostname='next-app')
config['Env']=[e for e in config['Env'] if not e.startswith('GIT_SHA=')]+['GIT_SHA='+SOURCE]
payload={**config,'HostConfig':d['HostConfig'],'NetworkingConfig':{'EndpointsConfig':{n:{'Aliases':v.get('Aliases') or ['next-app']} for n,v in d['NetworkSettings']['Networks'].items()}}}
class Docker(http.client.HTTPConnection):
 def __init__(self):super().__init__('localhost')
 def connect(self):
  self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);self.sock.connect('/var/run/docker.sock')
def api(method,path,body=None):
 c=Docker();c.request(method,'/v1.45'+path,body=json.dumps(body) if body is not None else None,headers={'Content-Type':'application/json'})
 r=c.getresponse();raw=r.read();assert r.status<300,'Docker operation failed: '+str(r.status)
 return json.loads(raw) if raw else {}
backup='next-app-crm-rollback-038fb83b'
subprocess.run(['docker','stop','--time','30','next-app'],check=True,stdout=subprocess.DEVNULL)
subprocess.run(['docker','rename','next-app',backup],check=True)
try:
 new=api('POST','/containers/create?name=next-app',payload);api('POST','/containers/'+new['Id']+'/start')
 ok=False
 for i in range(30):
  try:
   with urllib.request.urlopen('http://127.0.0.1:3001/twin',timeout=2) as response:
    html=response.read().decode();assert response.status==200
   asset=re.search(r'src="(/_next/static/[^"]+\\.js)"',html);assert asset
   with urllib.request.urlopen('http://127.0.0.1:3001'+asset[1],timeout=2) as response:assert response.status==200
   ok=True;break
  except Exception:time.sleep(1)
 assert ok,'Login/static smoke failed'
except Exception:
 subprocess.run(['docker','stop','--time','10','next-app'],stdout=subprocess.DEVNULL)
 subprocess.run(['docker','rename','next-app','next-app-crm-failed-'+SOURCE[:8]])
 subprocess.run(['docker','rename',backup,'next-app'],check=True);subprocess.run(['docker','start','next-app'],check=True);raise
running=inspect('next-app');env=dict(x.split('=',1) for x in running['Config']['Env'] if '=' in x)
assert running['Image']==image['Id'] and env['GIT_SHA']==SOURCE and running['State']['Running']
result={'source':SOURCE,'image':running['Image'],'registryDigest':IMAGE,'rollbackContainer':backup,'loginAndStaticSmoke':'passed'}
(root/'result.json').write_text(json.dumps(result));print(json.dumps(result))
'''

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image');parser.add_argument('--preflight',action='store_true')
    args=parser.parse_args()
    if aws('sts','get-caller-identity')['Account']!='323149985112':raise RuntimeError('Unexpected AWS account')
    prefix='EXPECTED='+repr(EXPECTED)+'\nSOURCE='+repr(SOURCE)+'\nREPOSITORY='+repr(REPOSITORY)+'\n'
    if args.preflight:invoke(prefix+PREFLIGHT);return
    if not args.image or not re.fullmatch(re.escape(REPOSITORY)+r'@sha256:[a-f0-9]{64}',args.image):raise ValueError('Exact approved repository digest is required')
    script=prefix+'IMAGE='+repr(args.image)+'\n'+PREFLIGHT+PROMOTE
    compile(script,'crm-promotion','exec')
    invoke(script)

if __name__=='__main__':main()
