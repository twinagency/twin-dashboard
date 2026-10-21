// Test the monitor's actual fan reader without importing its bot or HTTP server.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const original=process.env.MONITOR_ORIGINAL||'/tmp/messages-monitor/server-original.ts';
const candidate=process.env.MONITOR_CANDIDATE||'/tmp/messages-monitor/dashboard/server.ts';
function compile(filename,fixture){
 const source=fs.readFileSync(filename,'utf8'),ast=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true);
 const names=new Set(['chats','fans']);const functions=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.has(n.name?.text)).map(n=>n.getText(ast)).join('\n');
 assert.equal(ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.has(n.name?.text)).length,2);
 let ownedReads=0;
 const mockFs={readdirSync:()=>fixture.chats.map(c=>c.id+'.json'),readFileSync:file=>JSON.stringify(fixture.chats.find(c=>file.endsWith('/'+c.id+'.json'))),statSync:file=>({mtime:new Date(fixture.chats.find(c=>file.endsWith('/'+c.id+'.json')).updated)})};
 const module={exports:{}};const js=ts.transpileModule(functions,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('module','exports','fs','path','girlDataDir','girlLogDir','ownedKeys','purchases','readJsonl','isLive','hasEvidence','selectedOnly','mediaFree','reqSummary',js)(module,module.exports,mockFs,path,()=>'/data',()=>'/logs',()=>{ownedReads++;return new Set(['photo:owned'])},()=>fixture.purchases,()=>fixture.turns,t=>t.mode!=='simulated',t=>!!t.delivery,t=>!t.delivery&&(!!t.media||!!t.mediaLine),t=>t.media?!!t.media.free:/^FREE/.test(String(t.mediaLine??'')),()=>{const fans=new Map();for(const t of fixture.turns){if(t.mode==='simulated')continue;const key=String(t.chatId),r=fans.get(key)||{first:t.ts,last:t.ts,offered:0,unverified:0};r.last=t.ts;if(t.delivery&&t.media&&!t.media.free)r.offered++;if(!t.delivery&&(t.media||t.mediaLine)&&!(t.media?!!t.media.free:/^FREE/.test(String(t.mediaLine??''))))r.unverified++;fans.set(key,r)}return {req:{fans}}});
 return {...module.exports,ownedReads:()=>ownedReads};
}
const fixture={chats:[{id:'1',who:'@first',history:[1,2],bcid:'business',updated:'2026-01-01T00:00:00Z'},{id:'2',who:null,history:[],updated:'2026-02-01T00:00:00Z'},{id:'3',updated:'2026-01-01T00:00:00Z'}],purchases:[{chatId:1,stars:25},{chatId:1,stars:50},{chatId:2,stars:10}],turns:[{chatId:1,ts:'first',delivery:{},media:{free:false}},{chatId:1,ts:'simulated',mode:'simulated',media:{free:false}},{chatId:'1',ts:'second',mediaLine:'LOCKED photo'},{chatId:2,ts:'only',media:{free:true}},{chatId:1,ts:'last',delivery:{},media:{free:true}}]};
const before=compile(original,fixture),after=compile(candidate,fixture);
assert.deepEqual(after.fans(),before.fans(),'Every output field, order, delivery flag and monetary value is unchanged');
assert.equal(after.ownedReads(),0,'The fan endpoint must not reread unrelated ownership ledgers per fan');
assert.equal(before.ownedReads(),fixture.chats.length);
assert.deepEqual(after.chats(),before.chats(),'The existing full chats endpoint still returns ownership');
const bulk={chats:Array.from({length:1500},(_,i)=>({id:String(i),history:[],updated:'2026-01-01T00:00:00Z'})),purchases:[],turns:Array.from({length:15000},(_,i)=>({chatId:i%1500,ts:String(i),delivery:{},media:{free:false}}))};
// Count full-log visits rather than relying on machine-dependent timing.
let visitsBefore=0,visitsAfter=0;
function countTurns(onRead){return bulk.turns.map(row=>new Proxy(row,{get(o,k){if(k==='chatId')onRead();return o[k]}}))}
const slow=compile(original,{...bulk,turns:countTurns(()=>visitsBefore++)}),fast=compile(candidate,{...bulk,turns:countTurns(()=>visitsAfter++)});
assert.deepEqual(fast.fans(),slow.fans());if(process.env.MONITOR_INCREMENTAL==='1'){assert.equal(visitsAfter,15000);assert.equal(visitsBefore,15000)}else{assert.equal(visitsAfter,15000);assert.equal(visitsBefore,22500000)}
console.log('Monitor fans: exact output parity; unchanged full-chat ownership; existing incremental summary retained where present; zero per-fan ownership ledger reads');
