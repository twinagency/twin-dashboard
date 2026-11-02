// Exercise the deployed cache implementation across a fleet larger than six.
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),path=require('node:path');
function bridge(filename, forceSix=false){
 const source=fs.readFileSync(filename,'utf8'),ast=ts.createSourceFile('server.ts',source,ts.ScriptTarget.Latest,true);
 const selected=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='logEntry'||ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>['MAX_SUMMARIES','summaries'].includes(d.name.getText(ast))));
 assert.equal(selected.length,3,'Actual cache declarations and reader present');
 let scans=0;const sizes=new Map();
 const disk={statSync(file){if(file.endsWith('turns.log'))throw Error('no legacy fixture');return {ino:Number(file.match(/creator-(\d+)/)[1])+1,size:sizes.get(file)||1,mtimeMs:1}}};
 const code=ts.transpileModule(selected.map(n=>n.getText(ast)).join('\n').replace(/MAX_SUMMARIES = \d+/,forceSix?'MAX_SUMMARIES = 6':'MAX_SUMMARIES = '+source.match(/MAX_SUMMARIES = (\d+)/)[1]),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const load=new Function('fs','path','REQUEST_LOG','requestArchives','newReq','eachLine','readAt','ingest','trimRecent','parseLegacy',code+'\nreturn {logEntry,capacity:MAX_SUMMARIES};');
 const api=load(disk,path,'requests.jsonl',()=>[],ino=>({ino,offset:0,fp:Buffer.alloc(0),arch:new Map(),rows:[]}), (file,start,end,consume)=>{scans++;consume(Buffer.from(JSON.stringify({file,end})));return end},(file,start,length)=>Buffer.alloc(length,7),(s,row)=>s.rows.push(row),()=>{},()=>[]);
 return {...api,scans:()=>scans,append(dir){const file=path.resolve(dir,'requests.jsonl');sizes.set(file,2)}};
}
const before=bridge(process.env.MONITOR_ORIGINAL,true),after=bridge(process.env.MONITOR_CANDIDATE);
for(const b of [before,after])for(let pass=0;pass<2;pass++)for(let i=0;i<20;i++)assert(b.logEntry('/fixture/creator-'+i).req.rows.length);
assert.equal(before.scans(),40,'Six-entry cache rebuilds the fleet on the second visit');
assert.equal(after.scans(),20,'Every current creator keeps its summary between visits');
after.append('/fixture/creator-0');assert.equal(after.logEntry('/fixture/creator-0').req.rows.at(-1).end,2);assert.equal(after.scans(),21,'New log bytes remain visible on the next read');
console.log('Fleet summary cache: 20 creators retained, repeat visits avoid rescans, new messages still appended immediately');
