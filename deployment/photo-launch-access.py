"""Read the failed preflight and current runtime identities; no probe or model execution."""
import json,subprocess
r=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id','c6864361-ef15-4110-9f96-e95b4a7ed7a8','--instance-id','i-0584d283506f3f6be','--output','json'],text=True))
print(json.dumps({'status':r['Status'],'stdout':r.get('StandardOutputContent',''),'stderr':r.get('StandardErrorContent','')[:6000]}),flush=True)
