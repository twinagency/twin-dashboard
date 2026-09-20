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
