"""Inspect only runtime identities and staged preflight inputs; no API/model calls or changes."""
import hashlib,json,pathlib,subprocess
stage=pathlib.Path('/tmp/v2-structured-2d2ecc27d0b1-1791861016546799719')
out=pathlib.Path('/home/ubuntu/twin-v2-validation/reference-2d2ecc27d0b1-1791861016546799719-data/data')
manifest=json.loads((stage/'manifest.json').read_text())
runtime=[]
for name in ['twin-v2-bot-1','twin-v2-dash-1']:
 r=json.loads(subprocess.check_output(['docker','inspect',name],text=True))[0]
 runtime.append({'name':name,'running':r['State']['Running'],'image':r['Image'],'revision':next((x.split('=',1)[1] for x in r['Config']['Env'] if x.startswith('GIT_SHA=')),None)})
result={'runtime':runtime,'sourceMatches':{p:hashlib.sha256((stage/p).read_bytes()).hexdigest()==h for p,h in manifest.items()},
 'fixtureMatches':hashlib.sha256(pathlib.Path('/home/ubuntu/twin-v2/data/_operator_backups/photo-incident-20261013-morning/riley-morning-requests.json').read_bytes()).hexdigest()=='43e21019a2c33d1e840c81ec6d683cf7bb6546f68e1de4106db9218b6d3bd253',
 'outputExists':out.exists(),'outputFiles':[p.name for p in out.iterdir()] if out.exists() else []}
print(json.dumps(result))
