"""Read-only check of the already configured private monitor connection."""
import json, pathlib, subprocess, time
instances = ['i-09a9dd3bd749643a5', 'i-0584d283506f3f6be']
print(subprocess.check_output(['aws','ec2','describe-instances','--instance-ids',*instances,'--query','Reservations[].Instances[].{id:InstanceId,state:State.Name,privateIp:PrivateIpAddress}','--output','json'],text=True))
commands = [
    ["sudo docker inspect --format '{{json .NetworkSettings.Networks}}' next-app", "sudo docker network inspect twin-onlyfans_default --format '{{json .IPAM.Config}}'", "ip route get 172.31.6.134", "curl --max-time 5 -s -o /dev/null -w 'host monitor HTTP %{http_code}, %{time_total}s\\n' http://172.31.6.134:4300/api/girls || true"],
    ["curl --max-time 5 -s -o /dev/null -w 'monitor local HTTP %{http_code}, %{time_total}s\\n' http://127.0.0.1:4300/api/girls || true", "sudo docker inspect --format '{{.State.Status}} {{json .NetworkSettings.Ports}}' twin-v2-dash-1"]
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
