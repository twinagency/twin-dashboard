"""Isolated rollback-code replay. Does not deploy, stop runners or send messages."""
import json,pathlib,subprocess
script=pathlib.Path('/tmp/v2-live-incident-replay.mjs').read_text()
for name in ['twin-v2-bot-1','twin-v2-dash-1']:
 p=json.loads(subprocess.check_output(['docker','inspect',name],text=True))[0]
 assert p['State']['Running']
 assert p['Image']=='sha256:2f076bf6fbc17b4de58a31887e9328a56e0275d90edda39ea789efbd13517d2e'
 assert 'GIT_SHA=45931b6f56db9f97cc8406154e35a0d216f5de65' in p['Config']['Env']
r=subprocess.run(['docker','exec','-i','twin-v2-dash-1','node','--import','tsx','--input-type=module'],input=script,text=True,capture_output=True,timeout=150)
if r.returncode:
 print(r.stderr[-2000:],flush=True)
 raise RuntimeError('Isolated diagnostic did not complete; no release action ran')
print(r.stdout,flush=True)
