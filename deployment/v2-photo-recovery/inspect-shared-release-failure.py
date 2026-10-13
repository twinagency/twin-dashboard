"""Inspect saved first deployment failure and current health; no runtime changes."""
import datetime,json,pathlib,subprocess,urllib.request
root=pathlib.Path('/home/ubuntu/twin-v2')
backup=pathlib.Path("/home/ubuntu/twin-v2-backups/shared-photo-baseline-5e789f1-1791872165074291746")
result={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'failed':[],'runtime':[],'http':[]}
for p in sorted(backup.glob('shared-deploy-failed-*.json')):result['failed'].append(json.loads(p.read_text()))
for name in ['deployed-prompts.log','shared-rollback-result.json','deployed-source.log','deployed-dashboard-source.log']:
 p=backup/name
 if p.exists():result[name]=p.read_text()[-6000:]
for name in ['twin-v2-bot-1','twin-v2-dash-1']:
 i=json.loads(subprocess.check_output(['docker','inspect',name],text=True))[0]
 result['runtime'].append({'name':name,'running':i['State']['Running'],'image':i['Image'],'revision':next((x.split('=',1)[1] for x in i['Config']['Env'] if x.startswith('GIT_SHA=')),None)})
result['stats']=subprocess.check_output(['docker','stats','--no-stream','--format','{{json .}}','twin-v2-bot-1','twin-v2-dash-1'],text=True).splitlines()
for endpoint in ['/','/api/girls/details?girl=riley-mae-lewis']:
 try:
  with urllib.request.urlopen('http://127.0.0.1:4300'+endpoint,timeout=5) as r:result['http'].append({'endpoint':endpoint,'status':r.status})
 except Exception as e:result['http'].append({'endpoint':endpoint,'error':str(e)[:150]})
print('SHARED_RELEASE_FAILURE_JSON '+json.dumps(result),flush=True)
