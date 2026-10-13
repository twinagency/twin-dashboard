"""Enable the existing global bundle switch; do not change the application image or selling rules."""
import base64, datetime, gzip, hashlib, json, pathlib, subprocess, sys, time, urllib.request, uuid
ROOT = pathlib.Path('/home/ubuntu/twin-v2')
BASELINE = {'sourceRevision': '771f713b58c11d1b0fcf094595dc8f67ac898eb3', 'sourceImage': 'sha256:ac361b6304d4fa20ee251177b01277e37c826173f1ecd2d2afc2f8cb04f7ca9c', 'scope': [{'id': '6ca0782d-b5cf-433d-8329-f3ef7ec5f011', 'slug': 'alanna-pow', 'tips_enabled': True, 'bundles_enabled': True}, {'id': 'e0464c19-d5b7-4154-ba46-a60a2ed2a8a3', 'slug': 'allison-parker', 'tips_enabled': False, 'bundles_enabled': False}, {'id': '4fff7866-c7e9-4af2-926a-36e727c0a77f', 'slug': 'bethany-marquez', 'tips_enabled': True, 'bundles_enabled': True}, {'id': '0328e7b3-a1e5-465a-9a30-c9cf6519cba1', 'slug': 'briana-redd', 'tips_enabled': False, 'bundles_enabled': True}, {'id': '046fd9b0-7771-49ef-a7df-9d2c518575cc', 'slug': 'cat-chase', 'tips_enabled': True, 'bundles_enabled': True}, {'id': '85d226d6-91f1-4082-9534-d500a68ed537', 'slug': 'dakota-lyn', 'tips_enabled': False, 'bundles_enabled': False}, {'id': 'c92560e7-1dd9-4e62-b5c3-04a30fbe4925', 'slug': 'dreka-cakez', 'tips_enabled': True, 'bundles_enabled': True}, {'id': 'faf84489-b556-40ff-81d6-6fb6c6fe3bac', 'slug': 'fit-sid', 'tips_enabled': False, 'bundles_enabled': True}, {'id': 'd2678dce-6a4e-4f1c-b54a-86057bba427c', 'slug': 'kyla-yesenosky', 'tips_enabled': False, 'bundles_enabled': True}, {'id': '2e5eb05f-cc88-4ba6-870a-924948d4b09a', 'slug': 'mrs-callace', 'tips_enabled': False, 'bundles_enabled': True}, {'id': '7c2e9452-1d4e-475c-86ef-07a797f52ce5', 'slug': 'olivia-jade', 'tips_enabled': True, 'bundles_enabled': True}, {'id': '20ef9407-83f2-4351-8d3c-48cc0ed54e0b', 'slug': 'riley-mae-lewis', 'tips_enabled': False, 'bundles_enabled': True}, {'id': 'dd1869c2-d1e2-490f-9fae-45200232cc30', 'slug': 'sania-mallory', 'tips_enabled': False, 'bundles_enabled': True}, {'id': '7eae9772-eb7c-4a24-a54f-51cbb28f1def', 'slug': 'tammy', 'tips_enabled': False, 'bundles_enabled': True}, {'id': 'bfaf6235-6c3b-4369-8d5c-c7068b08bea2', 'slug': 'toochi', 'tips_enabled': True, 'bundles_enabled': True}, {'id': '3484f7d9-0cda-4f52-84de-e104c238ce5e', 'slug': 'trashy', 'tips_enabled': True, 'bundles_enabled': True}, {'id': '02a49e27-606d-4f20-9472-fab39255753f', 'slug': 'tru-kait', 'tips_enabled': True, 'bundles_enabled': False}], 'sourceHashes': [{'path': 'dashboard/server.ts', 'sha': 'e868c0904e481794f46a4ffa79557327d3b4fe52'}, {'path': 'src/archive/db.ts', 'sha': '2ba5a359931fbac0da8a13e9fa393302a2bdb42b'}, {'path': 'src/archive/import.ts', 'sha': '66c9d317d2439a24cb6319540809f95398fdb18a'}, {'path': 'src/archive/queue.ts', 'sha': 'd74ab915aaaaa3c2d71b25f5b79c79d84f7709f9'}, {'path': 'src/archive/recorder.ts', 'sha': 'd17d7b1d2837c922f612fb66e8d7e919dc37f700'}, {'path': 'src/archive/records.ts', 'sha': 'b2f91e34d8b4be722b1a4a489bb8c8b449033375'}, {'path': 'src/archive/rpc.ts', 'sha': '1b07631aa18b48b6e6539b6cf420132ad89e1647'}, {'path': 'src/archive/types.ts', 'sha': '49b817cc190e7037879782b4f17e35de249a13f7'}, {'path': 'src/bot.ts', 'sha': '877ec801f369294f9e53dd2510ffd3b2a6fa1ef0'}, {'path': 'src/bundle-offers.ts', 'sha': 'fe8a9a6e800077510df3a31738f3ef16225c6ed0'}, {'path': 'src/bundles.ts', 'sha': 'a8db9924bd1eb9480ad85d16c4112d7d0cd661fd'}, {'path': 'src/config.ts', 'sha': '7359e1b343c58b6fae801abfbc8da746fd9e8cde'}, {'path': 'src/context.ts', 'sha': '86aa3fc7388c7b7b0373a15996076b27af0d59cc'}, {'path': 'src/credits/adapter.ts', 'sha': '5974ea1aedeff9a2e3da48e0bc586a676a270815'}, {'path': 'src/credits/client.ts', 'sha': '0d4cc2436ee069b5e016801e5c7aa879e5e3c4d8'}, {'path': 'src/credits/durable-log.ts', 'sha': '5dce098f0efd14c6c8a5430c34aa436ae9d37146'}, {'path': 'src/credits/ids.ts', 'sha': '336f67322bd664057ff0765a88923b8e3fb0e669'}, {'path': 'src/credits/inbox.ts', 'sha': 'ec699faa9d2a97238b09bb0bb6be226ea615677d'}, {'path': 'src/credits/index.ts', 'sha': '926177b6631262f9b7490ec1526436ba684b6f49'}, {'path': 'src/credits/journal.ts', 'sha': '27e2861c9093716e495dd46535838a0dac224907'}, {'path': 'src/credits/outcome.ts', 'sha': 'd42fda28874949fa11462d316703ccaaf778018f'}, {'path': 'src/credits/receipt.ts', 'sha': '35d457e587fa7506979bf6ba68ccde330ce3c31c'}, {'path': 'src/credits/runtime.ts', 'sha': '49e235d42f42da099dd29bbe0d63ee0d885f14bf'}, {'path': 'src/credits/scan.ts', 'sha': 'd9bf73621a3262789ccd97dfb9c9c77a57bd64f4'}, {'path': 'src/credits/transport.ts', 'sha': 'eff18b519d39ed91e633f439b6f57157488aa906'}, {'path': 'src/deliver.ts', 'sha': 'e985199a7212163ac67e8781841a3423b4bfa4a8'}, {'path': 'src/fleet.ts', 'sha': 'bff504042562a580e56eb2634a15515f4453ce66'}, {'path': 'src/girls/index.ts', 'sha': '9a80de90d559fe4bbf31b406c7279f05742a185b'}, {'path': 'src/girls/map-v1.ts', 'sha': '233220a31619dbef84832abab8cb2431786b2c87'}, {'path': 'src/girls/riley.ts', 'sha': 'cce1f54e86a984484d962690b50fa7f334030d0f'}, {'path': 'src/girls/riley.vars.json', 'sha': '3c11c711b844d76ab35808cbb44e46327062a926'}, {'path': 'src/girls/template.ts', 'sha': '0cb9ba1fd564dd0504e2a047e879b531759398ec'}, {'path': 'src/grounding.ts', 'sha': 'ddd53ff1414f316dfb4f30c8b21fb16f132be8ce'}, {'path': 'src/handover.ts', 'sha': '3b2d239567fd4b4206e3c1742e5aa907162d6d7b'}, {'path': 'src/llm.ts', 'sha': '97a16547a21fef35c23e6ec1b9045cb059f7acd3'}, {'path': 'src/media.ts', 'sha': '29eb5fdb3f33c09e6ff13513b86097686ee9eeab'}, {'path': 'src/memory.ts', 'sha': '1d2c03fa0cba32e8b7fc48b813574b245ef3ab1b'}, {'path': 'src/memory/db.ts', 'sha': 'e5445cc072bf45023141f0312c1042cbc308a282'}, {'path': 'src/memory/reply.ts', 'sha': '6e70cce91d75acff51d7abc2e06855ed69a0848c'}, {'path': 'src/memory/runtime.ts', 'sha': '8febdd3384e26faa984936876c3c66113507747a'}, {'path': 'src/memory/select.ts', 'sha': '083dd708184f816c97520ae8f5f14ed7eebb3c7b'}, {'path': 'src/memory/tokens.ts', 'sha': 'b8a2bea02d48d09ea3a5f000f261eff368c08233'}, {'path': 'src/memory/worker.ts', 'sha': '01ae69c1cd5176acf284f0cb01499f0f765f546a'}, {'path': 'src/payments.ts', 'sha': '50fcb456416979fc9a93b9fab5d485b784b94b90'}, {'path': 'src/runner.ts', 'sha': '4a7ae02606d6b77a99f60b48a7d2320182336e15'}, {'path': 'src/safety.ts', 'sha': '94bce5b249299a0d7946609e1419bc72e0066848'}, {'path': 'src/test-photo-pricing.ts', 'sha': '1452a3a173f6ddb8e3f39fc43ab7d7f3dc1d7baf'}, {'path': 'src/tips/adapter.ts', 'sha': 'f6eab965f0e7ccc5dc38d56191b85767f2cc50b9'}, {'path': 'src/tips/client.ts', 'sha': '584387644acd053506bad4d4dd236f39a69f7205'}, {'path': 'src/tips/index.ts', 'sha': '28b35961ff6445f5e1eafb585c02be2c318bf3a3'}, {'path': 'src/tips/namespace.ts', 'sha': '7142bf80d6091bdbb476cdbc0e586d3b095219a4'}, {'path': 'src/tips/offer.ts', 'sha': 'b57ef52a6949b2b8173ba6273e7d17ad076428e9'}, {'path': 'src/tips/policy.ts', 'sha': '18b8cb4590475497f131e85e22640b37a291f060'}, {'path': 'src/tips/receipt.ts', 'sha': 'd2d543645ed4567b93ba634aa7e6fc91fdf7bc9b'}, {'path': 'src/tips/scan.ts', 'sha': '296b2887cf45ff80cebc3159ec5636c429d9f474'}, {'path': 'src/tips/settings.ts', 'sha': '139282106cbf48fbe73499dd3414f897f7dc55c3'}, {'path': 'src/tips/state.ts', 'sha': '60fe1c7c80f60a9847494fc2f40f524ec6c255d4'}, {'path': 'src/tips/turn.ts', 'sha': '59d6a884587624a84af862af8296ce5bec6968d6'}, {'path': 'src/turn.ts', 'sha': 'dddc4caac3dfae89c48ecd71ce0ed3d607f3b3dc'}], 'bundleAuditAt': '2026-10-13T19:05:16.704355+00:00', 'bundleAudit': [{'slug': 'alanna-pow', 'eligible': [{'id': '6daea89f-1b5e-450e-8dbf-6bb66e1a5c2a', 'stars': 2200, 'files': 2}, {'id': '6fc7654d-08b2-480e-9976-2ea88aa7da78', 'stars': 1050, 'files': 10}, {'id': '4de95e31-e624-4e21-87cc-0c33436f8d52', 'stars': 1250, 'files': 10}, {'id': '4f6f68f0-644c-4f2d-88a0-7f93764a750f', 'stars': 1100, 'files': 10}, {'id': 'dd55dacc-c3e8-4156-81e9-33d5437c0b11', 'stars': 999, 'files': 10}], 'excluded': [{'id': 'd8f89bab-ea7d-49df-90a0-b4a492db814d', 'reason': 'file_without_description:1'}, {'id': '4eb44703-10ea-4ac7-bf8b-92fa9f0e1609', 'reason': 'file_without_description:9'}]}, {'slug': 'allison-parker', 'eligible': [], 'excluded': []}, {'slug': 'bethany-marquez', 'eligible': [{'id': '1d6f535f-23de-4f05-999d-9241f87f7b88', 'stars': 900, 'files': 5}], 'excluded': []}, {'slug': 'briana-redd', 'eligible': [{'id': '619de97d-af41-4d0d-a9dc-a4a9421db5cb', 'stars': 250, 'files': 9}, {'id': '56553ab3-3763-4f23-b051-b8d02b926189', 'stars': 1200, 'files': 6}, {'id': '8f6829f1-e852-4699-a9bb-07d0b743f92e', 'stars': 1200, 'files': 6}], 'excluded': []}, {'slug': 'cat-chase', 'eligible': [], 'excluded': [{'id': 'd23a6e7d-b535-4bdc-b284-8cbe65c8f9a7', 'reason': 'file_without_description:1'}]}, {'slug': 'dakota-lyn', 'eligible': [], 'excluded': []}, {'slug': 'dreka-cakez', 'eligible': [{'id': 'cf7035e3-316c-4339-bb8a-a9fc7573a7ec', 'stars': 900, 'files': 5}], 'excluded': []}, {'slug': 'fit-sid', 'eligible': [{'id': '66f1b09d-64c3-4faf-987d-916eaede1152', 'stars': 1150, 'files': 10}, {'id': '63551d72-80fb-4404-8a1b-ac35f5d880cc', 'stars': 1150, 'files': 10}], 'excluded': [{'id': 'dc187d1e-b9c9-4cbd-b33f-8e8dba030fe3', 'reason': 'fewer_than_2_files:1'}, {'id': '97ebfac7-72f0-4cbb-92b6-a24bf43b4ddf', 'reason': 'fewer_than_2_files:1'}]}, {'slug': 'kyla-yesenosky', 'eligible': [{'id': '55b19541-03de-485f-8718-8dc729d28975', 'stars': 4400, 'files': 6}, {'id': 'f14facd0-ab7d-4d16-9915-11717d295450', 'stars': 4400, 'files': 6}], 'excluded': [{'id': '8e94df38-d1b1-4229-b4dc-0e14019ae171', 'reason': 'free_item_in_bundle:5'}, {'id': '80c84f0e-0eab-449c-a32a-796469e4d8c2', 'reason': 'free_item_in_bundle:2'}]}, {'slug': 'mrs-callace', 'eligible': [{'id': '0525fb0d-10b7-45f5-8175-31469b2e0e3c', 'stars': 250, 'files': 10}, {'id': '73a0d819-71e9-4d2a-bb8d-d4ec9eaefdc3', 'stars': 2000, 'files': 6}, {'id': '1e4c8c02-7c10-41eb-bc89-1f3b2acf525f', 'stars': 2000, 'files': 6}, {'id': 'bed1f9ce-e5a1-4c5a-8807-dabb3489f635', 'stars': 2000, 'files': 6}], 'excluded': [{'id': '6073754d-9818-40d9-a567-84b41543a5df', 'reason': 'file_without_description:1'}]}, {'slug': 'olivia-jade', 'eligible': [], 'excluded': []}, {'slug': 'riley-mae-lewis', 'eligible': [{'id': 'c90bb7d1-5db2-4888-a084-21238cdf3da5', 'stars': 4400, 'files': 5}, {'id': '7c685e29-8d2f-4cfc-853c-d7bbef7d6a41', 'stars': 4400, 'files': 6}, {'id': '72e4ba66-4b3b-4866-9de9-1eadfb62d11b', 'stars': 4400, 'files': 6}, {'id': '99c5b1a2-a40c-498a-9033-38f754f6ac8f', 'stars': 4400, 'files': 6}, {'id': 'cf567e1f-cdc8-4078-bf3f-6dd775e83832', 'stars': 4400, 'files': 6}, {'id': 'aa4c39df-15eb-46f7-8174-214b91339ab0', 'stars': 4400, 'files': 5}], 'excluded': []}, {'slug': 'sania-mallory', 'eligible': [{'id': '96ca4d50-05c8-4068-b62a-bbfeb12a1600', 'stars': 900, 'files': 5}], 'excluded': []}, {'slug': 'tammy', 'eligible': [], 'excluded': [{'id': '965d3101-eb88-488d-9b95-bd226e650cea', 'reason': 'file_without_description:1'}]}, {'slug': 'toochi', 'eligible': [{'id': '37a16ef7-84b9-4cca-9dab-8eb4fe5f9ba3', 'stars': 900, 'files': 5}], 'excluded': []}, {'slug': 'trashy', 'eligible': [{'id': '2fae7da2-1506-4bfe-a396-0739d882f289', 'stars': 8399, 'files': 5}, {'id': '17daf227-d572-4e22-9397-ae524e1edaa7', 'stars': 8199, 'files': 6}, {'id': 'ef9e13a8-b52e-4f01-b355-256efa4ffa02', 'stars': 7999, 'files': 6}, {'id': '454b7c59-c414-4c7a-99e6-5390b05865af', 'stars': 7799, 'files': 6}, {'id': 'f3864a37-b24d-4c88-8f31-c5e61a871d86', 'stars': 7699, 'files': 6}, {'id': '76ae2fdd-d40c-4c1e-8a20-c6a4e090226a', 'stars': 7499, 'files': 6}, {'id': '042a2436-2ba0-4d58-bda3-625e08d8d351', 'stars': 7449, 'files': 6}, {'id': '9a4fb2eb-2176-440c-8cf7-1259ab1542ac', 'stars': 7349, 'files': 4}], 'excluded': []}, {'slug': 'tru-kait', 'eligible': [], 'excluded': []}]}
EXPECTED = sorted(x['slug'] for x in BASELINE['scope'])
IMAGE = BASELINE['sourceImage']
SHA = BASELINE['sourceRevision']
OVERRIDE = ROOT / 'photo-release.override.json'
CONTAINERS = ['twin-v2-bot-1', 'twin-v2-dash-1']
NO_RUNNER = 'no runner is running for this creator, nothing to drain'
BACKUP = pathlib.Path('/home/ubuntu/twin-v2-backups') / ('commercial-enable-' + str(time.time_ns()))
BACKUP.mkdir(mode=0o700)

def stamp():return datetime.datetime.now(datetime.timezone.utc).isoformat()

def digest(b):return hashlib.sha256(b).hexdigest()

def out(*a):return subprocess.check_output(a,text=True).strip()

def save(name,value):
 p=BACKUP/name;p.write_text(json.dumps(value,indent=2));p.chmod(0o600)

def node(source,label,container='twin-v2-bot-1',timeout=210):
 r=subprocess.run(['docker','exec','-i',container,'node','--import','tsx','--input-type=module'],input=source,text=True,capture_output=True,timeout=timeout)
 p=BACKUP/('reply-'+label+'.log');p.write_text(r.stdout+r.stderr);p.chmod(0o600)
 if r.returncode:raise RuntimeError(label+' failed; private log retained')
 lines=[x[len('RELEASE_JSON '):] for x in r.stdout.splitlines() if x.startswith('RELEASE_JSON ')]
 assert len(lines)==1,label+' missing result'
 return json.loads(lines[0])

def runtime(image,revision):
 for name in CONTAINERS:
  info=json.loads(out('docker','inspect',name))[0]
  assert info['State']['Running'] and info['Image']==image and 'GIT_SHA='+revision in info['Config']['Env'],'Runtime changed: '+name

def running(name='twin-v2-bot-1'):
 try:
  state=json.loads(out('docker','inspect',name))[0]['State'];return state['Running'] is True and state.get('Restarting') is not True and state.get('Status')=='running'
 except Exception:return False

def stop_bot():
 # A restarting container is not equivalent to a stopped process. Stop it explicitly before an unheld baseline restore.
 stopped=subprocess.run(['docker','stop','--time','20','twin-v2-bot-1'],text=True,capture_output=True,timeout=35)
 assert stopped.returncode==0 or 'No such container' in stopped.stderr,'Bot container could not be stopped'
 inspected=subprocess.run(['docker','inspect','twin-v2-bot-1'],text=True,capture_output=True,timeout=10)
 if inspected.returncode==0:
  state=json.loads(inspected.stdout)[0]['State'];assert state['Running'] is False and state.get('Restarting') is not True,'Bot container did not stop'
 else:assert 'No such object' in inspected.stderr or 'No such container' in inspected.stderr,'Bot container stop could not be verified'

def compose():
 r=subprocess.run(['docker','compose','-p','twin-v2','-f',str(ROOT/'docker-compose.yml'),'-f',str(OVERRIDE),'up','-d','--no-build'],text=True,capture_output=True,timeout=90)
 (BACKUP/('compose-'+str(time.time_ns())+'.log')).write_text(r.stdout+r.stderr)
 assert r.returncode==0,'Compose failed; private log retained'

def atomic(p,b,mode=None):
 p.parent.mkdir(parents=True,exist_ok=True)
 temp=p.with_name(p.name+'.reply-release-tmp');temp.write_bytes(b)
 temp.chmod(mode if mode is not None else (p.stat().st_mode&0o777 if p.exists() else 0o644));temp.replace(p)

def clear_requests(receipt):
 for r in receipt['results']:
  folder=ROOT/'data/_handover';req=folder/(r['slug']+'.request.json');res=folder/(r['slug']+'.result.json')
  if req.exists() and json.loads(req.read_text()).get('id')==r['id']:
   req.unlink()
   if res.exists() and json.loads(res.read_text()).get('id')==r['id']:res.unlink()

def held(detail,allow_no_runner=False):
 return (detail.get('drained') is True and detail.get('owed')==0) or (allow_no_runner and detail.get('note')==NO_RUNNER)

def check_holds(receipt,allow_no_runner=False):
 for r in receipt['results']:
  folder=ROOT/'data/_handover';req=json.loads((folder/(r['slug']+'.request.json')).read_text());res=json.loads((folder/(r['slug']+'.result.json')).read_text())
  at=datetime.datetime.fromisoformat(req['at'].replace('Z','+00:00')).timestamp()
  detail=res.get('detail') or {}
  assert req['id']==res['id']==r['id'] and res['ok'] is True and held(detail,allow_no_runner) and time.time()-at<180,'Handover expired or changed'

def renew_holds(receipt):
 check_holds(receipt);now=stamp()
 for r in receipt['results']:
  p=ROOT/'data/_handover'/(r['slug']+'.request.json');req=json.loads(p.read_text());assert req['id']==r['id'];atomic(p,json.dumps({'id':r['id'],'at':now}).encode())
 check_holds(receipt)

def drain(require_running=True):
 source=r"""
import fs from 'node:fs';import path from 'node:path';import {config} from './src/config.ts';
import {pendingSlugs,runHandover,clearHandover,activeRequest,readResult} from './src/handover.ts';
if(pendingSlugs(config.dataDir).some(s=>activeRequest(config.dataDir,s)))throw Error('Another handover is in progress');
const r=await fetch(config.supabaseUrl+'/rest/v1/clones?engine=eq.v2&status=eq.active&select=id,slug',{headers:{apikey:config.supabaseKey,Authorization:'Bearer '+config.supabaseKey},signal:AbortSignal.timeout(15000)});
if(!r.ok)throw Error('Current fleet unreadable');const rows=await r.json(),expected=__EXPECTED__,requireRunning=__REQUIRE_RUNNING__;
if(JSON.stringify(rows.map(x=>x.slug).sort())!==JSON.stringify(expected))throw Error('Fleet scope changed');
if(requireRunning){const state=JSON.parse(fs.readFileSync(path.join(config.dataDir,'_fleet.json'),'utf8'));if(Date.now()-Date.parse(state.at)>90000||JSON.stringify(Object.keys(state.girls).sort())!==JSON.stringify(expected)||expected.some(s=>state.girls[s]?.status!=='running'))throw Error('Fresh running fleet required');}
const begun=Date.now(),results=await Promise.all(rows.map(async row=>({slug:row.slug,...await runHandover(config.dataDir,row.slug)})));
let ok=results.every(x=>x.ok);
for(const x of results){const req=activeRequest(config.dataDir,x.slug),res=readResult(config.dataDir,x.slug,x.id),d=res?.detail??{},stopped=(d.drained===true&&d.owed===0)||(!requireRunning&&d.note==='no runner is running for this creator, nothing to drain');if(!req||!res||req.id!==x.id||Date.parse(res.at)<begun||Date.parse(res.at)<Date.parse(req.at)||!stopped)ok=false;}
const open=[];
try{if(ok)for(const row of rows)for(const fn of ['v2credit_open_work','v2tip_open_work']){
 const res=await fetch(config.supabaseUrl+'/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:config.supabaseKey,Authorization:'Bearer '+config.supabaseKey,'Content-Type':'application/json'},body:JSON.stringify({p_clone_id:row.id}),signal:AbortSignal.timeout(8000)});
 const w=await res.json();open.push({slug:row.slug,kind:fn,...w});
 if(!res.ok||w.ok!==true||(fn==='v2credit_open_work'&&w.reserved_turns!==0)||Number(w.open_exceptions??0)!==0||Number(w.awaiting_receipt_refunds??0)!==0)ok=false;
}}catch(e){ok=false;open.push({error:String(e?.message??e).slice(0,160)});}
if(!ok&&requireRunning)for(const x of results)if(activeRequest(config.dataDir,x.slug)?.id===x.id)clearHandover(config.dataDir,x.slug);
console.log('RELEASE_JSON '+JSON.stringify({ok,at:new Date().toISOString(),results,open}));
""".replace('__EXPECTED__',json.dumps(EXPECTED)).replace('__REQUIRE_RUNNING__','true' if require_running else 'false')
 label=('drain-' if require_running else 'recovery-drain-')+str(time.time_ns())
 receipt=node(source,label);save(label+'.json',receipt)
 assert receipt['ok'],'Drain or financial verification failed; live image unchanged'
 assert sorted(r['slug'] for r in receipt['results'])==EXPECTED
 try:check_holds(receipt,not require_running)
 except Exception:
  if require_running:clear_requests(receipt)
  raise
 print('REPLY_RELEASE_PHASE '+json.dumps({'phase':'drained','creators':len(EXPECTED),'at':stamp()}),flush=True)
 return receipt

def financial_gate(receipt):
 assert len(receipt['results'])==len(EXPECTED) and len(receipt['open'])==len(EXPECTED)*2,'Incomplete drain/financial scope'
 owed=sum(int((x.get('detail') or {}).get('owed',-1)) for x in receipt['results'])
 credits=[x for x in receipt['open'] if x.get('kind')=='v2credit_open_work'];tips=[x for x in receipt['open'] if x.get('kind')=='v2tip_open_work']
 assert len(credits)==len(tips)==len(EXPECTED),'Incomplete financial RPC scope'
 reserved=sum(int(x.get('reserved_turns',-1)) for x in credits)
 exceptions=sum(int(x.get('open_exceptions',-1)) for x in receipt['open'])
 refunds=sum(int(x.get('awaiting_receipt_refunds',-1)) for x in receipt['open'])
 assert owed==reserved==exceptions==refunds==0,'Financial gate changed after drain'
 return {'creators':len(EXPECTED),'drained':len(receipt['results']),'owed':owed,'reservedTurns':reserved,'openExceptions':exceptions,'awaitingReceiptRefunds':refunds,'rpcChecks':len(receipt['open'])}

def observe(since):
 deadline=time.monotonic()+100
 while time.monotonic()<deadline:
  try:
   s=json.loads((ROOT/'data/_fleet.json').read_text());g=s.get('girls',{})
   if datetime.datetime.fromisoformat(s['at'].replace('Z','+00:00')).timestamp()>=since and sorted(g)==EXPECTED and all(g[k].get('status')=='running' and datetime.datetime.fromisoformat(g[k]['startedAt'].replace('Z','+00:00')).timestamp()>=since for k in EXPECTED):
    return {'at':s['at'],'girls':{k:{'status':g[k]['status'],'botUsername':g[k].get('botUsername'),'startedAt':g[k]['startedAt']} for k in EXPECTED}}
  except (FileNotFoundError,json.JSONDecodeError):pass
  time.sleep(2)
 raise RuntimeError('Fresh running fleet not observed')


def runtime_flag(expected):
    runtime(IMAGE, SHA)
    found = []
    for name in CONTAINERS:
        info = json.loads(out('docker', 'inspect', name))[0]
        flags = dict(x.split('=', 1) for x in info['Config']['Env'] if '=' in x)
        assert flags.get('V2_BUNDLES', '').lower() == expected, 'Bundle flag mismatch: ' + name
        assert not info['State'].get('Restarting'), 'Restarting container: ' + name
        found.append({'name': name, 'revision': flags['GIT_SHA'], 'image': info['Image'], 'bundles': flags['V2_BUNDLES']})
    return found

def source_check(container='twin-v2-bot-1'):
    source = r'''
import fs from 'node:fs'; import {createHash} from 'node:crypto';
const files=__HASHES__;
for(const f of files){const b=fs.readFileSync(f.path);const got=createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');if(got!==f.sha)throw Error('Source changed: '+f.path);}
console.log('RELEASE_JSON '+JSON.stringify({verified:files.length}));
'''.replace('__HASHES__', json.dumps(BASELINE['sourceHashes']))
    return node(source, 'source-' + container, container, 45)

def settings():
    source = r'''
import {createHash} from 'node:crypto'; import {config} from './src/config.ts';
const fields='id,slug,name,engine,status,v2_vars,v2_credits_enabled,v2_credits_pack_quantity,v2_credits_pack_stars,v2_credits_revision,v2_memory_enabled,tips_enabled,bundles_enabled,tip_max_stars,spoil_options,tip_reask_cooldown_seconds,spoil_context_lookback_messages,tip_push_level,push_level,tip_reask_after_paid';
const r=await fetch(config.supabaseUrl+'/rest/v1/clones?select='+fields+'&order=slug',{headers:{apikey:config.supabaseKey,Authorization:'Bearer '+config.supabaseKey},signal:AbortSignal.timeout(15000)});
if(!r.ok)throw Error('Settings unreadable');const rows=await r.json(),active=rows.filter(x=>x.engine==='v2'&&x.status==='active');
console.log('RELEASE_JSON '+JSON.stringify({hash:createHash('sha256').update(JSON.stringify(rows)).digest('hex'),active:active.map(x=>({slug:x.slug,tips:x.tips_enabled,bundles:x.bundles_enabled})),model:config.model,providerOrder:config.providerOrder}));
'''
    result = node(source, 'settings-' + str(time.time_ns()), timeout=45)
    assert [x['slug'] for x in result['active']] == EXPECTED, 'Active V2 scope changed'
    assert all(x['tips'] is True and x['bundles'] is True for x in result['active']), 'Saved switches are not all enabled'
    return result

def bundle_audit():
    source = r'''
import {config} from './src/config.ts';import {loadRawCatalogue,catalogueFromRaw} from './src/media.ts';
import {fetchBundleRows,resolveBundles,storageSize} from './src/bundles.ts';import {offerTableReady} from './src/bundle-offers.ts';
if(!(await offerTableReady()))throw Error('Bundle offer table unavailable');
const scope=__SCOPE__,checks=[];
for(const c of scope){const raw=await loadRawCatalogue(c.id),cat=catalogueFromRaw(raw);const b=await resolveBundles(await fetchBundleRows(c.id),raw,cat,c.id,storageSize);checks.push({slug:c.slug,eligible:b.bundles.map(x=>({id:x.id,stars:x.stars,files:x.files.length})),excluded:b.excluded.map(x=>({id:x.id,reason:x.reason}))});}
console.log('RELEASE_JSON '+JSON.stringify({checks}));
'''.replace('__SCOPE__', json.dumps(BASELINE['scope']))
    value = node(source, 'bundle-audit', timeout=600)
    assert value['checks'] == BASELINE['bundleAudit'], 'Bundle inventory changed since the reviewed audit'
    return value

def tip_audit():
    checks = []
    for slug in EXPECTED:
        with urllib.request.urlopen('http://127.0.0.1:4300/api/tips?girl=' + slug, timeout=10) as response:
            value = json.load(response)
        assert value.get('inSync') is True and value.get('offersEnabled') is True, 'Saved/applied tips mismatch: ' + slug
        work = value.get('openWork') or {}
        assert work.get('ok') is True, 'Unreadable tip state: ' + slug
        assert work.get('open_exceptions', 0) == work.get('awaiting_receipt_refunds', 0) == 0, 'Unsettled tip issue: ' + slug
        checks.append({'slug': slug, 'enabled': True, 'inSync': True, 'settings': value['saved'], 'pendingReceipts': (value.get('receipts') or {}).get('pending', 0)})
    return checks

def wait_tip_audit():
    until = time.monotonic() + 70
    while True:
        try:
            return tip_audit()
        except Exception:
            if time.monotonic() >= until:
                raise
            time.sleep(3)

def bundle_runtime_audit(since):
    until = time.monotonic() + 180
    while time.monotonic() < until:
        checks = []
        try:
            for expected in BASELINE['bundleAudit']:
                row = json.loads((ROOT / 'data' / expected['slug'] / '_bundle_exclusions.json').read_text())
                assert datetime.datetime.fromisoformat(row['at'].replace('Z', '+00:00')).timestamp() >= since
                items = [{k: x[k] for k in ('id', 'stars', 'files')} for x in row['listed']]
                assert items == expected['eligible']
                checks.append({'slug': expected['slug'], 'listed': len(items), 'excluded': len(row['excluded']), 'at': row['at']})
            return checks
        except (FileNotFoundError, json.JSONDecodeError, AssertionError):
            time.sleep(3)
    raise RuntimeError('Fresh bundle inventory did not match the approved inventory')

def rollback(receipt, released, before_bytes, after_bytes):
    if released:
        receipt = drain(False)
    else:
        check_holds(receipt)
    assert OVERRIDE.read_bytes() in (before_bytes, after_bytes), 'Concurrent config edit: rollback stopped'
    atomic(OVERRIDE, before_bytes)
    since = time.time()
    compose()
    runtime_flag('off')
    clear_requests(receipt)
    fleet = observe(since)
    return {'bundles': 'off', 'fleet': fleet, 'tipsRemainEnabled': True}

receipt = None
released = False
touched = False
phase = 'preflight'
result = {'status': 'not-started', 'revision': SHA, 'image': IMAGE, 'backup': str(BACKUP)}
try:
    runtime_flag('off')
    source_check()
    source_check('twin-v2-dash-1')
    before_settings = settings()
    tips = wait_tip_audit()
    catalogue = bundle_audit()
    before_bytes = OVERRIDE.read_bytes()
    before = json.loads(before_bytes)
    after = json.loads(before_bytes)
    for service in ('bot', 'dash'):
        spec = after['services'][service]
        assert spec['image'] == IMAGE, 'Override image differs from the running image'
        spec.setdefault('environment', {})['V2_BUNDLES'] = 'on'
    after_bytes = (json.dumps(after, indent=2) + '\n').encode()
    save('activation-before.json', {'settings': before_settings, 'tips': tips, 'bundles': catalogue, 'source': BASELINE})
    atomic(BACKUP / 'override-before.json', before_bytes, 0o600)
    atomic(BACKUP / 'override-after.json', after_bytes, 0o600)
    phase = 'drain'
    receipt = drain()
    financial = financial_gate(receipt)
    assert settings() == before_settings, 'Settings changed during preflight'
    assert OVERRIDE.read_bytes() == before_bytes, 'Override changed during preflight'
    renew_holds(receipt)
    phase = 'enable'
    touched = True
    atomic(OVERRIDE, after_bytes)
    since = time.time()
    compose()
    runtime_state = runtime_flag('on')
    renew_holds(receipt)
    source_check()
    source_check('twin-v2-dash-1')
    renew_holds(receipt)
    assert settings() == before_settings, 'Saved settings changed at cutover'
    phase = 'release'
    clear_requests(receipt)
    released = True
    fleet = observe(since)
    phase = 'verify'
    tips = wait_tip_audit()
    bundles = bundle_runtime_audit(since)
    runtime_flag('on')
    assert settings() == before_settings, 'Settings changed during verification'
    result.update(status='complete', at=stamp(), runtime=runtime_state, fleet=fleet,
                  tips=tips, bundles=bundles, bundleCount=sum(x['listed'] for x in bundles),
                  eligibleCreators=[x['slug'] for x in bundles if x['listed']],
                  financialGate=financial, holdsReleased=True, applicationCodeChanged=False,
                  imageChanged=False, pricesChanged=False, purchasesMade=0, testFanMessages=0)
except Exception as error:
    result.update(status='failed', phase=phase, error=str(error))
    try:
        if touched:
            result['rollback'] = rollback(receipt, released, before_bytes, after_bytes)
        elif receipt:
            clear_requests(receipt)
    except Exception as recovery:
        result['rollbackError'] = str(recovery)
    save('activation-result.json', result)
    print('ACTIVATION_BASE64 ' + base64.b64encode(gzip.compress(json.dumps(result).encode(), mtime=0)).decode())
    sys.exit(1)
save('activation-result.json', result)
print('ACTIVATION_BASE64 ' + base64.b64encode(gzip.compress(json.dumps(result).encode(), mtime=0)).decode())
