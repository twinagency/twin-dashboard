"""Read-only check of the already configured private monitor connection."""
import json, pathlib, subprocess, time
instances = ['i-09a9dd3bd749643a5', 'i-0584d283506f3f6be']
print(subprocess.check_output(['aws','ec2','describe-instances','--instance-ids',*instances,'--query','Reservations[].Instances[].{id:InstanceId,state:State.Name,privateIp:PrivateIpAddress}','--output','json'],text=True))
source_read = "const fs=require('node:fs'),ts=require('typescript'),s=fs.readFileSync('/app/dashboard/server.ts','utf8'),ast=ts.createSourceFile('server.ts',s,ts.ScriptTarget.Latest,true);const nodes=ast.statements;console.log(JSON.stringify({summary:nodes.filter(n=>ts.isFunctionDeclaration(n)&&['logEntry','newReq','trimRecent','ingest'].includes(n.name?.text)||ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>['MAX_SUMMARIES','MIN_RECENT','MAX_RECENT','MAX_LEGACY_LISTED','FP_BYTES','summaries'].includes(d.name.getText(ast)))).map(n=>n.getText(ast)),names:nodes.flatMap(n=>ts.isFunctionDeclaration(n)?[n.name?.text]:ts.isVariableStatement(n)?n.declarationList.declarations.map(d=>d.name.getText(ast)):[])}));"
import shlex
commands = [
    ["sudo docker inspect --format '{{json .NetworkSettings.Networks}}' next-app", "sudo docker network inspect twin-onlyfans_default --format '{{json .IPAM.Config}}'", "ip route get 172.31.6.134", "curl --max-time 5 -s -o /dev/null -w 'host monitor HTTP %{http_code}, %{time_total}s\\n' http://172.31.6.134:4300/api/girls || true"],
    ["curl --max-time 5 -s -o /dev/null -w 'monitor local HTTP %{http_code}, %{time_total}s\\n' http://127.0.0.1:4300/api/girls || true", "sudo docker inspect --format '{{.State.Status}} {{json .NetworkSettings.Ports}}' twin-v2-dash-1", "sudo docker stats --no-stream --format '{{.Name}} CPU={{.CPUPerc}} MEM={{.MemUsage}}' twin-v2-dash-1 twin-v2-bot-1", "sudo docker exec twin-v2-dash-1 sha256sum /app/dashboard/server.ts /app/dashboard/history.ts", "sudo docker exec twin-v2-dash-1 node -e " + shlex.quote(source_read), "sudo docker inspect --format '{{index .Config.Labels \"com.docker.compose.project.config_files\"}}' twin-v2-dash-1", "sudo docker inspect --format '{{.Id}} {{.Image}} {{.State.StartedAt}} OOM={{.State.OOMKilled}} restarts={{.RestartCount}}' twin-v2-dash-1 twin-v2-bot-1"]
]
for instance, cmds in zip(instances,commands):
    f=pathlib.Path('/tmp/messages-network-check.json');f.write_text(json.dumps({'commands':cmds,'executionTimeout':['30']}))
    cid=subprocess.check_output(['aws','ssm','send-command','--instance-ids',instance,'--document-name','AWS-RunShellScript','--parameters','file://'+str(f),'--comment','Read-only private Messages connection diagnosis','--query','Command.CommandId','--output','text'],text=True).strip()
    for _ in range(20):
        try:r=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cid,'--instance-id',instance,'--output','json'],text=True,stderr=subprocess.DEVNULL))
        except subprocess.CalledProcessError:time.sleep(2);continue
        if r['Status'] in ['Success','Failed','Cancelled','TimedOut']:
            print(json.dumps({'instance':instance,'status':r['Status'],'out':r.get('StandardOutputContent',''),'err':r.get('StandardErrorContent','')[-1500:]}));break
        time.sleep(2)
    else:raise RuntimeError('Private connection diagnosis timed out')
