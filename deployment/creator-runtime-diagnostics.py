import importlib.util,json,time,shlex
from pathlib import Path
root=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('release',root/'flirt-release.py');release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)
assert release.aws(['sts','get-caller-identity'])['Account']==release.ACCOUNT
source=r'''
import subprocess,json,re,pathlib,collections,datetime
report={'read_only':True,'containers':[]}
def run(args):
 r=subprocess.run(args,capture_output=True,text=True,timeout=45);return r.returncode,r.stdout
for name in ['flirt-dashboard','flirt-dashboard-rollback','next-app']:
 rc,raw=run(['docker','inspect',name]);assert rc==0
 d=json.loads(raw)[0];state=d['State']; c={'name':name,'running':state['Running'],'oom_killed':state['OOMKilled'],'started_at':state['StartedAt'],'restart_count':d['RestartCount'],'memory_limit_bytes':d['HostConfig']['Memory']}
 rc,v=run(['docker','exec',name,'printenv','GIT_SHA']);c['commit']=v.strip() if not rc and re.fullmatch('[a-f0-9]{40}',v.strip()) else 'unavailable'
 rc,v=run(['docker','exec',name,'cat','/sys/fs/cgroup/memory.events']);c['memory_events']={line.split()[0]:int(line.split()[1]) for line in v.splitlines() if len(line.split())==2 and line.split()[1].isdigit()}
 rc,v=run(['docker','exec',name,'cat','/sys/fs/cgroup/memory.peak']);c['memory_peak_bytes']=int(v.strip()) if v.strip().isdigit() else None
 rc,v=run(['docker','exec',name,'node','--version']);c['node_version']=v.strip() if not rc else 'unavailable'
 report['containers'].append(c)
counts=collections.Counter()
for f in pathlib.Path('/var/log/apache2').glob('*access.log'):
 if not f.is_file():continue
 for line in f.open(errors='replace'):
  if '/creator-auth/upload' not in line or '[03/Oct/2026:2' not in line:continue
  m=re.search(r'"POST /creator-auth/upload(?:[ ?][^\"]*)? HTTP/[0-9.]+" ([0-9]{3}) ',line)
  if m:counts[m.group(1)]+=1
report['audit_upload_status_counts']=dict(counts)
limits=[]
for root in ['/etc/apache2/sites-enabled','/etc/apache2/conf-enabled']:
 for p in pathlib.Path(root).glob('*'):
  if p.is_file() and p.stat().st_size<100000:
   for line in p.read_text(errors='replace').splitlines():
    if re.match(r'^\s*(LimitRequestBody|ProxyTimeout|Timeout)\s+[0-9]+\s*$',line):limits.append(line.strip())
report['proxy_limits']=sorted(set(limits))
rc,v=run(['journalctl','-k','--since','2026-10-03 20:00:00 UTC','--until','2026-10-04 03:40:00 UTC','--no-pager','-o','short-iso'])
report['kernel_oom_events']=[{'timestamp':line.split()[0],'event':'oom_kill','node_process':bool(re.search(r'node|next-server',line)),'anonymous_rss_kib':(re.search(r'anon-rss:([0-9]+)kB',line).group(1) if re.search(r'anon-rss:([0-9]+)kB',line) else None)} for line in v.splitlines() if re.search(r'Out of memory: Killed process|Memory cgroup out of memory',line)]
print(json.dumps(report))
'''
request={'InstanceIds':[release.INSTANCE],'DocumentName':'AWS-RunShellScript','Comment':'Read-only creator upload capacity diagnostics','TimeoutSeconds':60,'Parameters':{'commands':['python3 -c '+shlex.quote(source)],'executionTimeout':['180']}}
id=release.aws(['ssm','send-command','--cli-input-json',json.dumps(request)])['Command']['CommandId']
for _ in range(65):
 time.sleep(3);r=release.aws(['ssm','get-command-invocation','--command-id',id,'--instance-id',release.INSTANCE])
 if r['Status'] in ['Pending','InProgress','Delayed']:continue
 print(r.get('StandardOutputContent',''));assert r['Status']=='Success';break
else:raise RuntimeError('Read-only diagnostics timed out')
