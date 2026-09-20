#!/usr/bin/env python3
"""Exercise FLIRT's actual HTTP routes through its approved existing AWS host."""
import base64, importlib.util, json, shlex, sys, time
from pathlib import Path

root = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('release', root / 'flirt-release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)

def main():
    if release.aws(['sts','get-caller-identity'])['Account'] != release.ACCOUNT:
        raise RuntimeError('Unexpected AWS account')
    source = base64.b64encode((root/'flirt-live-check.cjs').read_bytes()).decode()
    host_script = '''import base64, json, re, shutil, socket, subprocess
from pathlib import Path
from urllib.request import Request,urlopen
def run(args,data=None):
    return subprocess.run(args,input=data,capture_output=True,timeout=240)
r=run(['docker','inspect','--format','{{index .Config.Labels "io.flirt.project"}}','flirt-dashboard'])
if r.returncode or r.stdout.decode().strip()!='lkmfwpqegjluirfusnaw':
    raise SystemExit('The approved FLIRT dashboard is not running yet')
result=run(['docker','exec','-i','flirt-dashboard','node','-'],base64.b64decode(SOURCE))
try: report=json.loads(result.stdout)
except Exception: report={'passed':False,'error':'Live check did not return a structured report','exit_status':result.returncode}
print(json.dumps({'application':report}),flush=True)
meta={}
for host in ['lynqai.co','dashboard.lynqai.co']:
    try: meta[host]=sorted(set(item[4][0] for item in socket.getaddrinfo(host,None)))
    except OSError: meta[host]=[]
try:
    token=urlopen(Request('http://169.254.169.254/latest/api/token',method='PUT',headers={'X-aws-ec2-metadata-token-ttl-seconds':'60'}),timeout=3).read().decode()
    address=urlopen(Request('http://169.254.169.254/latest/meta-data/public-ipv4',headers={'X-aws-ec2-metadata-token':token}),timeout=3).read().decode()
    if re.fullmatch(r'[0-9.]{7,15}',address): meta['host_public_ipv4']=address
except Exception: meta['host_public_ipv4']='unavailable'
if shutil.which('nginx'):
    config=run(['nginx','-T'])
    meta['nginx_routes']=[line.strip() for line in config.stdout.decode(errors='replace').splitlines() if re.match(r'^\\s*(?:server_name|listen|proxy_pass|ssl_certificate)\\s',line) and not re.search(r'password|token|secret|@',line,re.I)]
meta['certbot_available']=bool(shutil.which('certbot'))
for name in ['next-app','flirt-dashboard','flirt-bot']:
    state=run(['docker','inspect','--format','{{.State.Running}} {{.RestartCount}}',name])
    meta[name]=state.stdout.decode().strip() if state.returncode==0 else 'absent'
print(json.dumps({'hosting':meta}),flush=True)
raise SystemExit(result.returncode)
'''.replace('SOURCE',repr(source))
    command='python3 -c '+shlex.quote(host_script)
    request={'InstanceIds':[release.INSTANCE],'DocumentName':'AWS-RunShellScript','Comment':'FLIRT synthetic signup, onboarding and storage checks','TimeoutSeconds':60,'Parameters':{'commands':[command],'executionTimeout':['480']}}
    command_id=release.aws(['ssm','send-command','--cli-input-json',json.dumps(request)])['Command']['CommandId']
    print('FLIRT live verification command:',command_id,flush=True)
    for _ in range(165):
        time.sleep(3)
        state=release.aws(['ssm','get-command-invocation','--command-id',command_id,'--instance-id',release.INSTANCE])
        if state['Status'] in ('Pending','InProgress','Delayed'): continue
        print(state.get('StandardOutputContent',''),flush=True)
        if state['Status']!='Success': raise RuntimeError('FLIRT live verification failed; see structured report')
        return
    raise RuntimeError('FLIRT live verification timed out')

if __name__=='__main__':
    try: main()
    except Exception as error:
        print(str(error) if isinstance(error,RuntimeError) else type(error).__name__,file=sys.stderr)
        sys.exit(1)
