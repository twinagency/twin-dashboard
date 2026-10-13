import json,pathlib,shlex,subprocess,time
command='python3 -c '+shlex.quote("import pathlib,json\np=pathlib.Path('/home/ubuntu/twin-v2-validation/selection-76c5e0038eb2-1791853923651993714')\nprint(json.dumps({'stderr':(p/'runner.stderr.private.txt').read_text()[-5000:],'stdoutTail':(p/'runner.stdout.private.txt').read_text()[-400:]}))")
p=pathlib.Path('/tmp/read-selection-error.json');p.write_text(json.dumps({'commands':[command],'executionTimeout':['60']}))
cid=subprocess.check_output(['aws','ssm','send-command','--instance-ids','i-0584d283506f3f6be','--document-name','AWS-RunShellScript','--parameters','file://'+str(p),'--query','Command.CommandId','--output','text'],text=True).strip()
for _ in range(25):
 try:r=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cid,'--instance-id','i-0584d283506f3f6be','--output','json'],text=True,stderr=subprocess.DEVNULL))
 except subprocess.CalledProcessError:time.sleep(2);continue
 if r['Status'] in ['Success','Failed','Cancelled','TimedOut']:break
 time.sleep(2)
print(r.get('StandardOutputContent',''));assert r['Status']=='Success'
