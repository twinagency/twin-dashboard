"""Freeze read-only evidence for isolated simulation; never alter a production mount."""
import datetime,hashlib,json,pathlib,subprocess,time
IMAGE='sha256:dff48242b35b94e7b0e757ee4b7778a11958ef85b231b5fdb369542902e325f9'
REV='2f24f023c0cf46bea1c3b3b334458cf1a5df265e'
runtime=[]
for name in ['twin-v2-bot-1','twin-v2-dash-1']:
 info=json.loads(subprocess.check_output(['docker','inspect',name],text=True))[0]
 rev=next((x.split('=',1)[1] for x in info['Config']['Env'] if x.startswith('GIT_SHA=')),None)
 assert info['State']['Running'] and info['Image']==IMAGE and rev==REV,'Runtime changed; inspect before test'
 runtime.append({'name':name,'image':info['Image'],'revision':rev})
root=pathlib.Path('/home/ubuntu/twin-v2-validation')/('fleet-simulation-20261013-'+str(time.time_ns()))
root.mkdir(mode=0o700,parents=True)
p=subprocess.run(['docker','exec','-i','twin-v2-bot-1','node','--import','tsx','--input-type=module'],input=EXTRACT,text=True,capture_output=True,timeout=240)
assert p.returncode==0,'Read-only extraction failed; no simulation launched'
raw=next(l[len('FLEET_FIXTURE_JSON '):] for l in p.stdout.splitlines() if l.startswith('FLEET_FIXTURE_JSON '))
fixture=json.loads(raw);f=root/'evidence.json';f.write_text(raw);f.chmod(0o600)
fleet=json.loads(pathlib.Path('/home/ubuntu/twin-v2/data/_fleet.json').read_text())
containers=subprocess.check_output(['docker','ps','--format','{{.Names}} {{.Image}}'],text=True).splitlines()
summary={'at':fixture['at'],'root':str(root),'fixtureSha256':hashlib.sha256(f.read_bytes()).hexdigest(),'runtime':runtime,'containers':containers,'profiles':[{'slug':p['slug'],'engine':p['engine'],'memory':p.get('v2_memory_enabled'),'credits':p.get('v2_credits_enabled'),'tips':p.get('tips_enabled'),'photos':len(fixture['catalogues'].get(p['id'],{}).get('photos',[])),'videos':len(fixture['catalogues'].get(p['id'],{}).get('videos',[])),'bundles':len(fixture['bundles'].get(p['id'],[])),'runner':fleet.get('girls',{}).get(p['slug'],{}).get('status'),'error':fixture['errors'].get(p['slug'])} for p in fixture['profiles']],'sourceHashes':fixture['sourceHashes']}
(root/'snapshot-summary.json').write_text(json.dumps(summary));(root/'fleet.private.json').write_text(json.dumps(fleet))
print('FLEET_SNAPSHOT_JSON '+json.dumps(summary),flush=True)
