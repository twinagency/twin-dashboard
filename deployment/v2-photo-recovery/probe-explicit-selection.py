"""Four bounded authorised model checks; isolated data and fake Telegram, no deployment."""
import json,pathlib,subprocess,tempfile,os
image='sha256:2f076bf6fbc17b4de58a31887e9328a56e0275d90edda39ea789efbd13517d2e'
runtime=json.loads(subprocess.check_output(['docker','inspect','twin-v2-bot-1'],text=True))[0]
assert runtime['State']['Running'] and runtime['Image']==image
assert 'GIT_SHA=45931b6f56db9f97cc8406154e35a0d216f5de65' in runtime['Config']['Env']
secret=[x for x in runtime['Config']['Env'] if x.startswith('OPENROUTER_API_KEY=')]
assert len(secret)==1 and len(secret[0].split('=',1)[1])>10,'Existing model credential unavailable in established runtime'
fd,envfile=tempfile.mkstemp(prefix='v2-selection-probe-',suffix='.env')
try:
 os.write(fd,('\n'.join(secret)+'\n').encode());os.close(fd);os.chmod(envfile,0o600)
 incident='/home/ubuntu/twin-v2/data/_operator_backups/photo-incident-20261013-morning'
 args=['docker','run','--rm','-i','--read-only','--tmpfs','/tmp:rw,size=64m','--memory','512m','--cpus','1','--env-file',envfile,'-e','GIT_SHA=45931b6f56db9f97cc8406154e35a0d216f5de65','-e','PROBE_COMMIT=54a92def5e0755f55c9381df7e19a6de74f6de59','-e','STAR_PRICE=real','--mount','type=bind,source='+incident+',target=/app/data/_operator_backups/photo-incident-20261013-morning','--mount','type=bind,source=/tmp/v2-ranking-candidate-media.ts,target=/app/src/media.ts,readonly',image,'node','--import','tsx','--input-type=module']
 r=subprocess.run(args,input=pathlib.Path('/tmp/v2-explicit-selection-probe.mjs').read_text(),text=True,capture_output=True,timeout=420)
 print(r.stdout,flush=True)
 if r.returncode:
  print(r.stderr[-1600:],flush=True)
  raise RuntimeError('Bounded design probe failed; no deployment or Telegram send occurred')
finally:
 pathlib.Path(envfile).unlink(missing_ok=True)
