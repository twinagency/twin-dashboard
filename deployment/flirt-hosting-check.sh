#!/usr/bin/env bash
# Read-only capacity and credential-presence checks. Never print secret values.
set -euo pipefail
printf 'MEMORY_MIB\n'
free -m
printf 'DISK\n'
df -h / /var/lib/docker
printf 'RUNNING_CONTAINERS\n'
sudo docker ps --format '{{.Names}} {{.Image}} {{.Ports}}'
printf 'CONTAINER_RESOURCES\n'
sudo docker stats --no-stream --format '{{.Name}} {{.MemUsage}} {{.CPUPerc}}'
printf 'FLIRT_PORT_3101\n'
ss -lnt 'sport = :3101'
printf 'PROVIDER_CONFIGURATION_PRESENCE\n'
sudo docker exec next-app node -e 'for (const name of ["OPENROUTER_API_KEY", "ELEVENLABS_API_KEY", "DEEPGRAM_API_KEY"]) console.log(name + ": " + (process.env[name] ? "configured" : "not configured"));'
python3 - <<'PY'
import json, pathlib, re, shutil, subprocess
report={}
for service in ['nginx','apache2','caddy','traefik']:
    result=subprocess.run(['systemctl','is-active',service],capture_output=True,text=True)
    report[service]=result.stdout.strip()
report['web_listeners']=subprocess.run(['ss','-lntp','( sport = :80 or sport = :443 )'],capture_output=True,text=True).stdout.strip()
paths=['/etc/nginx/sites-enabled','/etc/apache2/sites-enabled','/etc/caddy']
report['configuration_files']={p:[f.name for f in pathlib.Path(p).glob('*') if f.is_file()] for p in paths}
routes=[]
for p in paths:
    for f in pathlib.Path(p).glob('*'):
        if not f.is_file() or f.stat().st_size>100000: continue
        for line in f.read_text(errors='replace').splitlines():
            if re.match(r'^\s*(?:server_name|listen|proxy_pass|ServerName|ServerAlias|ProxyPass|SSLCertificateFile|reverse_proxy)\s',line) and not re.search(r'password|token|secret|@',line,re.I):
                routes.append({'file':str(f),'route':line.strip()})
report['routes']=routes
print(json.dumps({'edge_readiness':report}))
PY


printf 'FLIRT_CONTAINER_STATE\n'
python3 - <<'PY'
import json, subprocess
for name in ('flirt-dashboard', 'flirt-dashboard-rollback', 'flirt-bot', 'flirt-bot-rollback'):
    result = subprocess.run(['docker', 'inspect', '--format', '{{json .}}', name], capture_output=True, text=True)
    if result.returncode: continue
    info = json.loads(result.stdout)
    labels = info.get('Config', {}).get('Labels') or {}
    print(json.dumps({'name':name,'running':info['State']['Running'],'status':info['State']['Status'],'commit':labels.get('io.flirt.commit'),'project':labels.get('io.flirt.project'),'created':info.get('Created')}))
PY
printf 'UPLOAD_PROXY_LIMITS\n'
python3 - <<'PY'
from pathlib import Path
for root in ('/etc/apache2/sites-enabled','/etc/apache2/conf-enabled'):
    for path in Path(root).glob('*'):
        if not path.is_file() or path.stat().st_size > 100000: continue
        for line in path.read_text(errors='replace').splitlines():
            if any(token in line.lower() for token in ('limitrequestbody', 'proxytimeout', 'timeout ')):
                print(path.name + ': ' + line.strip())
PY


printf 'FLIRT_UPLOAD_HTTP_STATUS_COUNTS\n'
python3 - <<'PY'
from collections import Counter
from pathlib import Path
import re
counts = Counter()
for log in Path('/var/log/apache2').glob('*access.log*'):
    if 'lynqai' not in log.name or log.suffix == '.gz' or not log.is_file(): continue
    with log.open(errors='replace') as handle:
        for line in handle:
            if '/creator-auth/upload' not in line: continue
            match = re.search(r'"POST /creator-auth/upload(?:[ ?][^"]*)? HTTP/[0-9.]+" (\\d{3}) ', line)
            if match: counts[match.group(1)] += 1
print(dict(counts))
PY
