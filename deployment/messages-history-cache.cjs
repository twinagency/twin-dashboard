// Exercise the real history module across 20 creators, including appended data.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),ts=require('typescript');
function load(file,forceSix=false){
 let source=fs.readFileSync(file,'utf8');if(forceSix)source=source.replace(/MAX_INDEXES = \d+/,'MAX_INDEXES = 6');
 let scans=0;const disk=new Proxy(fs,{get(target,key){return key==='createReadStream'?(...args)=>{scans++;return fs.createReadStream(...args)}:target[key]}});
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const mod={exports:{}};new Function('require','module','exports',code)(name=>name==='node:fs'?disk:name.includes('request-log')?{REQUEST_LOG:'requests.jsonl',requestArchives:()=>[]}:require(name),mod,mod.exports);
 return {...mod.exports,scans:()=>scans};
}
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'monitor-history-cache-'));
 try{
  const dirs=Array.from({length:20},(_,i)=>{const dir=path.join(root,String(i));fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,'requests.jsonl'),JSON.stringify({chatId:'1',ts:'2026-01-01T00:00:00Z',turnId:'turn-'+i,fanText:'fixture-'+i})+'\n');return dir});
  const small=load(process.env.MONITOR_CANDIDATE,true),fleet=load(process.env.MONITOR_CANDIDATE);
  for(const reader of [small,fleet])for(let pass=0;pass<2;pass++)for(let i=0;i<dirs.length;i++){const page=await reader.chatHistory(dirs[i],'1');assert.equal(page.history[0].content,'fixture-'+i);assert.equal(page.scope,'all-stored');assert.equal(page.days,null)}
  assert.equal(small.scans(),40,'Six-entry history cache rescans the whole fleet');assert.equal(fleet.scans(),20,'Fleet histories are retained on repeat visits');
  fs.appendFileSync(path.join(dirs[0],'requests.jsonl'),JSON.stringify({chatId:'1',ts:'2026-01-02T00:00:00Z',turnId:'appended',fanText:'new message'})+'\n');
  const fresh=await fleet.chatHistory(dirs[0],'1');assert.equal(fresh.history.at(-1).content,'new message');assert.equal(fleet.scans(),21,'New bytes are still indexed immediately');
  console.log('Fleet histories: 20 creators retained, repeat visits avoid rescans, appended messages visible and creator isolation preserved');
 }finally{fs.rmSync(root,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
