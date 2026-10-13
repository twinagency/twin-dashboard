"""Read already completed shared repair verification. No model, Telegram, database or production write."""
import hashlib,json,pathlib,subprocess
root=pathlib.Path("/home/ubuntu/twin-v2-validation/shared-5e789f1d23bf-1791871648047664202")
archive=pathlib.Path("/home/ubuntu/twin-v2-backups/shared-photo-baseline-5e789f1-1791872165074291746")
model=json.loads((root/'output/model.compact.json').read_text())
rollback=json.loads((archive/'rollback-plan.json').read_text())
assert model['candidate']=='5e789f1d23bf63f91643760537600c077b646356' and model['passed'] and model['requests']==model['cases']==model['passedCases']==39
assert hashlib.sha256((archive/'runtime-code.tgz').read_bytes()).hexdigest()==rollback['sourceHash']
assert (archive/'images.tar').stat().st_size==rollback['imageArchiveBytes']
runtime=[]
for name in ['twin-v2-bot-1','twin-v2-dash-1']:
 info=json.loads(subprocess.check_output(['docker','inspect',name],text=True))[0]
 runtime.append({'container':name,'image':info['Image'],'running':info['State']['Running'],'revision':next((x.split('=',1)[1] for x in info['Config']['Env'] if x.startswith('GIT_SHA=')),None)})
print('SHARED_REPAIR_SAVED_RESULT_JSON '+json.dumps({'candidate':model['candidate'],'modelPassed':True,'cases':39,'requests':39,'recordedAt':model['completedAt'],'fixtureHash':model['fixtureHash'],'rollbackArchiveVerified':str(archive),'runtime':runtime,'liveDisplayGate':'unverified: root and details endpoint timed out in recorded live check','modelCalls':0,'messagesSent':0,'productionWrites':0}),flush=True)
