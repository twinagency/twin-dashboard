"""Read only Jesse's Riley incident turns and current inventory; no sends or writes."""
import json,subprocess
info=json.loads(subprocess.check_output(['docker','inspect','twin-v2-bot-1'],text=True))[0]
assert info['State']['Running'] and info['Image']=='sha256:9649329a00bd20fe06499f8238e1e51713381521af00d4cdc67505e1064f724a'
assert 'GIT_SHA=86b0ad199ea33fd7855f1c0dd54cc355f706e7f5' in info['Config']['Env']
js=r"""
import fs from 'node:fs';import path from 'node:path';
import {config} from './src/config.ts';import {runAs} from './src/context.ts';
import {loadRawCatalogue,catalogueFromRaw,requestedAttrs,missingAttrs,buildMenu,menuText} from './src/media.ts';
import {loadChat} from './src/memory.ts';import {ownedKeys} from './src/payments.ts';
import {photoRequest} from './src/turn.ts';
const slug='riley-mae-lewis',id=6814483810,clone='20ef9407-83f2-4351-8d3c-48cc0ed54e0b';
const raw=await loadRawCatalogue(clone),cat=catalogueFromRaw(raw),byKey=new Map(cat.map(x=>[x.key,x]));
const chat=runAs(slug,()=>loadChat(id)),owned=runAs(slug,()=>ownedKeys(id));
const file=path.join(config.logDir,slug,'requests.jsonl');
const fd=fs.openSync(file,'r'),size=fs.fstatSync(fd).size,offset=Math.max(0,size-8000000),buffer=Buffer.alloc(size-offset);
fs.readSync(fd,buffer,0,buffer.length,offset);fs.closeSync(fd);
let lines=buffer.toString().split('\n');if(offset)lines.shift();
const rows=lines.flatMap(line=>{try{return [JSON.parse(line)]}catch{return []}}).filter(r=>String(r.chatId)===String(id)&&r.ts>='2026-10-13T04:25:00'&&r.ts<='2026-10-13T05:00:00').slice(-18);
const turns=rows.map(r=>{
 const req=requestedAttrs(cat.filter(x=>!x.isFree),r.fanText);
 return {ts:r.ts,turnId:r.turnId,input:r.fanText,selection:r.selection,photoReference:r.photoReference,photoAlternative:r.photoAlternative??false,generated:r.generated,delivered:r.final,raw:r.raw,grounding:r.grounding,
 menu:r.menu?.map(m=>({slot:m.slot,key:m.key,description:m.desc,missingNewestAttributes:byKey.has(m.key)?missingAttrs(byKey.get(m.key),req):null})),
 requestedNewestAttributes:{exact:[...req.exact],near:[...req.near]},
 menuText:r.system?.slice(r.system.lastIndexOf('YOUR CONTENT READY TO SEND')),
 selected:r.selectedMedia,delivery:r.delivery};
});
const excluded=new Set([...chat.sent,...owned,...cat.filter(x=>owned.has('file:'+x.storagePath)).map(x=>x.key),...(chat.photo?[chat.photo.key]:[])]);
const summaries=['photo','video'].map(kind=>{const items=cat.filter(x=>x.kind===kind),eligible=items.filter(x=>!['pending','failed','needs_review'].includes(x.analysis));return {kind,items:items.length,sent:items.filter(x=>chat.sent.includes(x.key)).length,owned:items.filter(x=>owned.has(x.key)||owned.has('file:'+x.storagePath)).length,availablePaid:eligible.filter(x=>!x.isFree&&!excluded.has(x.key)).length,availableFree:eligible.filter(x=>x.isFree&&!excluded.has(x.key)).length}});
console.log('RILEY_INCIDENT_JSON '+JSON.stringify({checkedAt:new Date().toISOString(),runtimeRevision:process.env.GIT_SHA,clone,chatId:id,catalogue:summaries,turns,history:chat.history.slice(-12),currentPhoto:chat.photo,modelCalls:0,messagesSent:0,productionWrites:0}));
""";
p=subprocess.run(['docker','exec','-i','twin-v2-bot-1','node','--import','tsx','--input-type=module'],input=js,text=True,capture_output=True,timeout=60)
if p.returncode:raise RuntimeError(p.stderr[-800:])
lines=[x for x in p.stdout.splitlines() if x.startswith('RILEY_INCIDENT_JSON ')]
assert len(lines)==1
print(lines[0],flush=True)
