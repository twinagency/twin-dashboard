"""Erase only rcy07 conversation state and app conversation logs; preserve payments and other fans."""
import os,json,re,pathlib,subprocess,hashlib,time,urllib.request
CID="6814483810"
ROOT=pathlib.Path("/home/ubuntu/twin-v2")
SLUGS=["alanna-pow","allison-parker","autumn-renae","briana-redd","cat-chase","dakota-lyn","dan-dangler","fit-sid","kyla-yesenosky","mrs-callace","olivia-jade","riley-mae-lewis","sania-mallory","tammy","toochi","trashy","tru-kait"]
REV="86b0ad199ea33fd7855f1c0dd54cc355f706e7f5"
MEMORY_SHA="261d1af5ce647e93b58572f353086b553191ed74acef81b59edfb2e084b40e98"
MARKER=ROOT/"data"/"_operator_resets"/"rcy07-20261013-fresh-chat.json"
HEADER=re.compile(rb"^\d{4}-\d\d-\d\dT[^ ]+ \| ([^|]+) \| ")
def who_target(who):return who.strip().lower() in [b"@rcy07",b"rcy07",CID.encode()]
def blank_json(raw):
 body=raw.rstrip(b"\r\n")
 assert len(body)>=2
 return b"{}"+b" "*(len(body)-2)+raw[len(body):]
def json_target(raw):
 if CID.encode() not in raw:return False
 try:return str(json.loads(raw).get("chatId"))==CID
 except (ValueError,AttributeError):return False
def plan_file(p):
 assert p.resolve().is_relative_to((ROOT/"logs").resolve()) and not p.is_symlink()
 spans=[];start=0;old_block=b"";target=False
 with p.open("rb") as f:
  if p.name.endswith(".jsonl"):
   while True:
    at=f.tell();line=f.readline()
    if not line:break
    if json_target(line):
     assert line.endswith(b"\n"),"Incomplete target log record"
     spans.append((at,line,blank_json(line)))
  else:
   for line in f:
    m=HEADER.match(line)
    if m:
     if target:spans.append((start,old_block,re.sub(rb"[^\r\n]",b" ",old_block)))
     start=f.tell()-len(line);old_block=line;target=who_target(m.group(1))
    else:old_block+=line
   if target:spans.append((start,old_block,re.sub(rb"[^\r\n]",b" ",old_block)))
 return spans
def digest_untouched(p,spans,limit):
 h=hashlib.sha256()
 with p.open("rb") as f:
  at=0
  for offset,old,new in spans:
   assert len(old)==len(new) and offset>=at
   n=offset-at
   while n:
    b=f.read(min(n,1024*1024));assert b;h.update(b);n-=len(b)
   f.seek(len(old),1);at=offset+len(old)
  n=limit-at
  while n:
   b=f.read(min(n,1024*1024));assert b;h.update(b);n-=len(b)
 return h.hexdigest()
def rewrite_spans(p,spans):
 if not spans:return 0
 length=p.stat().st_size
 before=digest_untouched(p,spans,length)
 with p.open("r+b",buffering=0) as f:
  for offset,old,new in spans:
   f.seek(offset);assert f.read(len(old))==old,"Record changed before erasure"
   f.seek(offset);assert f.write(new)==len(new)
  os.fsync(f.fileno())
 assert p.stat().st_size>=length,"Log unexpectedly truncated"
 assert digest_untouched(p,spans,length)==before,"Unrelated bytes changed"
 assert not plan_file(p),"Target conversation log remains"
 return len(spans)
def runtime(name):
 o=json.loads(subprocess.check_output(["docker","inspect",name],text=True))[0]
 env=dict(x.split("=",1) for x in o["Config"]["Env"])
 assert o["State"]["Running"],name+" stopped"
 return {"id":o["Id"],"image":o["Image"],"revision":env.get("GIT_SHA"),"history":env.get("HISTORY_REVISION")}
def atomic(p,obj):
 p.parent.mkdir(parents=True,exist_ok=True)
 tmp=p.with_name(p.name+".rcy07-reset-tmp")
 with tmp.open("w") as f:json.dump(obj,f,indent=2);f.flush();os.fsync(f.fileno())
 os.replace(tmp,p)
def selftest():
 a=b'{"chatId":6814483810,"fanText":"private"}\n'
 b=b'{"chatId":12345,"fanText":"6814483810"}\n'
 assert json_target(a) and not json_target(b)
 z=blank_json(a);assert len(z)==len(a) and json.loads(z)=={} and not json_target(z)
 assert who_target(b" @RCY07 ") and not who_target(b"@rcy070") and not who_target(b"@rcyo7")
 assert HEADER.match(b"2026-10-13T01:00:00.000Z | @rcy07 | ok | 9ms\n")
 print("GUARD_CHECKS exact identity, byte-length preservation and lookalike exclusion passed")
selftest()
if MARKER.exists():
 print("ALREADY_COMPLETED",MARKER.read_text());raise SystemExit(0)
bot=runtime("twin-v2-bot-1");dash=runtime("twin-v2-dash-1")
assert bot["revision"]==REV and dash["revision"]==REV,"Runtime changed since inspection"
source=subprocess.check_output(["docker","exec","twin-v2-bot-1","cat","/app/src/memory.ts"])
assert hashlib.sha256(source).hexdigest()==MEMORY_SHA,"Reset semantics changed"
states=[]
for slug in SLUGS:
 p=ROOT/"data"/slug/(CID+".json")
 if p.exists():
  assert not p.is_symlink()
  raw=p.read_bytes();d=json.loads(raw)
  assert str(d.get("who","")).lower() in ["@rcy07","rcy07",CID,""],"Identity mismatch"
  assert not (d.get("history") or d.get("sent") or d.get("photo")) or time.time()-p.stat().st_mtime>60,"Fan conversation is active"
  states.append((slug,p,raw,d))
 for fname in ["_archive_queue.jsonl","_archive_dead.jsonl"]:
  p2=ROOT/"data"/slug/fname
  if p2.exists():
   assert CID.encode() not in p2.read_bytes(),"Pending archive work needs draining first"
logplan=[]
for slug in SLUGS:
 for fname in ["requests.jsonl","blocked.jsonl","turns.log"]:
  p=ROOT/"logs"/slug/fname
  if p.exists():
   spans=plan_file(p)
   if spans:logplan.append((p,spans))
assert runtime("twin-v2-bot-1")==bot
result={"telegram_id":CID,"revision":REV,"cleared_chats":[],"redacted_log_records":{}}
for slug,p,raw,d in states:
 current=p.read_bytes()
 if current!=raw:
  newer=json.loads(current)
  assert not newer.get("history") and not newer.get("sent") and not newer.get("photo") and int(newer.get("epoch",0))>=int(d.get("epoch",0)),"Conversation changed after preflight"
  d=newer
 if not d.get("history") and not d.get("sent") and not d.get("photo"):
  result["cleared_chats"].append({"creator":slug,"already_empty":True,"epoch":d.get("epoch",0)})
  continue
 fresh={k:d[k] for k in ["ageConfirmed","bcid","who"] if k in d}
 fresh.update(history=[],sent=[],epoch=int(d.get("epoch",0))+1)
 atomic(p,fresh)
 result["cleared_chats"].append({"creator":slug,"messages_removed":len(d.get("history",[])),"sent_references_removed":len(d.get("sent",[])),"epoch":fresh["epoch"]})
for p,spans in logplan:
 result["redacted_log_records"][str(p.relative_to(ROOT))]=rewrite_spans(p,spans)
for slug,p,raw,d in states:
 now=json.loads(p.read_text())
 assert now["history"]==[] and now["sent"]==[] and "photo" not in now and now["epoch"]>=int(d.get("epoch",0))
# The history monitor keeps an in-memory index. Restart only that read-only
# monitor after redaction; the bot and all other live conversations keep running.
subprocess.run(["docker","restart","twin-v2-dash-1"],check=True,stdout=subprocess.DEVNULL,timeout=45)
for attempt in range(20):
 try:
  with urllib.request.urlopen("http://127.0.0.1:4300/api/status",timeout=5) as r:json.load(r)
  break
 except (OSError,ValueError):
  if attempt==19:raise
  time.sleep(1)
verified=[]
for slug in SLUGS:
 with urllib.request.urlopen("http://127.0.0.1:4300/api/chat-history?girl="+slug+"&chatId="+CID,timeout=30) as r:history=json.load(r)
 assert history.get("history")==[],"Dashboard history remains: "+slug
 verified.append(slug)
assert runtime("twin-v2-bot-1")==bot,"Bot runtime changed"
after=runtime("twin-v2-dash-1")
assert all(after[k]==dash[k] for k in ["id","image","revision","history"]),"Monitor image changed"
result.update(verified_empty_history=verified,bot_unchanged=True,completed_at=time.time())
atomic(MARKER,result)
print("RESET_VERIFIED",json.dumps(result,sort_keys=True))
