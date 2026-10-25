/* Actual private client and public selection parser; synthetic transport only. */
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file,dependencies={}){
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const m={exports:{}};new Function('require','module','exports',js)(n=>dependencies[n]??require(n),m,m.exports);return m.exports;
}
async function main(){
 const model=load('lib/onlyfans-managed-proxy/model.ts');
 const transport=load('lib/onlyfans/backend-transport.ts');
 const {createManagedProxyBackend,ManagedProxyError}=load('lib/onlyfans-managed-proxy/backend.ts',{'server-only':{},'./model':model,'@/lib/onlyfans/backend-transport':transport});
 const selection={countryCode:'US',handle:'fixture_creator'},actor='op-session:'+'a'.repeat(64);
 assert(model.validManagedProxySelection(selection));
 for(const value of [null,{},[],{...selection,extra:true},{...selection,countryCode:'USA'},{...selection,handle:'@fixture'},{...selection,handle:'bad handle'}])assert(!model.validManagedProxySelection(value));
 let calls=[],response={ok:true,proxyUrl:'http://fixture:private-password@8.8.4.4:12323'},status=200;
 const client=createManagedProxyBackend({baseUrl:'http://broker.example:8791',token:'private-service-token',fetchImpl:async(url,options)=>{calls.push({url,options});return Response.json(response,{status});}});
 assert.equal(await client.assign('creator-a',selection,actor),response.proxyUrl);
 assert.equal(calls[0].url,'http://broker.example:8791/v1/assign');
 assert.equal(calls[0].options.headers.Authorization,'Bearer private-service-token');
 assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.credentials,'omit');
 assert.deepEqual(JSON.parse(calls[0].options.body),{creatorId:'creator-a',...selection,actor});
 response={ok:false,code:'proxy_stock_empty',error:'private provider text'};status=409;
 await assert.rejects(()=>client.assign('creator-a',selection,actor),error=>error instanceof ManagedProxyError&&error.status===409&&error.message.includes('connection slots')&&!error.message.includes('private'));
 assert.equal(calls.length,2,'A refused assignment is attempted once');
 status=200;
 for(const url of ['http://user:pass@proxy.example:12323','https://fixture:pass@8.8.4.4:12323','http://8.8.4.4:12323','http://fixture:pass@8.8.4.4:12323/private']){
  response={ok:true,proxyUrl:url};await assert.rejects(()=>client.assign('creator-a',selection,actor),ManagedProxyError);
 }
 response={ok:true,provider:'iproyal',type:'isp_dedicated',countries:[{code:'US',name:'United States',available:2}]};
 assert.deepEqual(await client.stock(),response.countries);
 response.countries[0].available=-1;await assert.rejects(()=>client.stock(),ManagedProxyError);
 const failing=createManagedProxyBackend({baseUrl:'http://broker.example:8791',token:'fixture',fetchImpl:async()=>{throw Error('private-token-should-not-leak')}});
 await assert.rejects(()=>failing.assign('creator-a',selection,actor),error=>error instanceof ManagedProxyError&&!error.message.includes('private-token'));
 const automaticCalls=[];
 const automatic=createManagedProxyBackend({baseUrl:'http://broker.example:8791',token:'fixture',defaultCountry:'PT',fetchImpl:async(url,options)=>{automaticCalls.push(JSON.parse(options.body));return Response.json({ok:true,proxyUrl:'http://fixture:password@8.8.4.4:12323'});}});
 for(let i=0;i<2;i++)await automatic.assign('creator-a',{countryCode:'auto',handle:'fixture_creator'},actor);
 assert.deepEqual(automaticCalls,[{creatorId:'creator-a',countryCode:'PT',handle:'fixture_creator',actor},{creatorId:'creator-a',countryCode:'PT',handle:'fixture_creator',actor}]);
 let unexpectedCalls=0;
 const missingRegion=createManagedProxyBackend({baseUrl:'http://broker.example:8791',token:'fixture',fetchImpl:async()=>{unexpectedCalls++;throw Error('not expected')}});
 await assert.rejects(()=>missingRegion.assign('creator-a',{countryCode:'auto',handle:'fixture_creator'},actor),ManagedProxyError);
 assert.equal(unexpectedCalls,0,'Missing platform configuration must not select a random region or connect directly');
 console.log('PASS managed proxy client: exact selections, private transport, one attempt, stock exhaustion, credential validation and redacted failures.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
