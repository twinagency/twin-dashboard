const assert=require("node:assert/strict");
const vm=require("node:vm");
const {build}=require("esbuild");
const path=require("node:path");
const {identity}=require("../deployment/flirt-live-twin.cjs");
const root=path.resolve(__dirname,"..");
class Response {constructor(body,status=200){this.body=body;this.status=status}static json(body,{status=200}={}){return new Response(body,status)}}
const state={identity:identity(),authed:true,gate:null,calls:[],rows:new Map(),local:new Map(),sharedCreates:0,localCreates:0};
function database(shared){
 const rows=shared?state.rows:state.local;
 return {from(table){assert.equal(table,"clones");let id,inserted,ids;
  const query={select(){return query},order(){return query},limit(){return query},in(k,values){ids=values;return query},
   eq(k,value){assert.equal(k,"id");id=value;return query},
   insert(row){inserted=row;state[shared?"sharedCreates":"localCreates"]++;return query},
   async maybeSingle(){return {data:rows.get(id)||null,error:null}},
   async single(){assert(inserted);rows.set(inserted.id,inserted);return {data:inserted,error:null}},
   then(resolve,reject){return Promise.resolve({data:[...rows.values()].filter(r=>!ids||ids.includes(r.id)),error:null}).then(resolve,reject)}
  };return query;}};
}
const shared=database(true),local=database(false);
const mocks={
 "server-only":{},
 "next/server":{NextResponse:Response},
 "@/lib/supabase":{supabaseAdmin:{from(){throw Error("Restricted agency transport refuses creator creation")}}},
 "@/lib/supabase-service":{serviceClient(){state.calls.push("local");return local},serviceClientForAccess(access){assert.equal(access,state.identity);state.calls.push("shared");return shared}},
 "@/lib/auth":{isAuthed:async()=>state.authed},
 "@/lib/dashboard-access":{getDashboardAccess:async()=>state.identity},
 "./route":{requireOnlyFansRead:async()=>state.gate||{actor:"verified-operator",canManage:true,auth:{}}},
 "@/lib/form-origin":{trustedFormOrigin:()=>true},
 "./command-json":{readCommandJson:async()=>({})},
 "@/lib/onlyfans-connections/contract":{canonicalConnection:JSON.stringify},
 "@/lib/onlyfans-connections/route":{connectionRefusal:(status,error)=>new Response({error},status)}
};
(async()=>{
 process.env.FLIRT_SHARED_ONLYFANS_ENABLED="true";
 const compiled=await build({entryPoints:[path.join(root,"lib/onlyfans/connection-creators.ts")],bundle:true,write:false,platform:"node",format:"cjs",plugins:[{name:"dependency-mocks",setup(b){b.onResolve({filter:/.*/},args=>Object.hasOwn(mocks,args.path)?{path:args.path,external:true}:null)}}]});
 const mod={exports:{}};
 vm.runInNewContext(compiled.outputFiles[0].text,{module:mod,exports:mod.exports,require:id=>Object.hasOwn(mocks,id)?mocks[id]:require(id),process,Buffer,console},{filename:"connection-creators.test.cjs"});
 const api=mod.exports;
 let ctx=await api.connectionAccess(true);assert(!(ctx instanceof Response));assert.equal(ctx.agency,null);
 const body={name:"Creator save regression",handle:"@creator_save_regression"};
 const one=await api.createConnectionCreator(ctx,body);assert(one.id);assert.deepEqual(state.calls,["shared"]);
 const retry=await api.createConnectionCreator(ctx,body);assert.equal(retry.id,one.id);assert.equal(state.sharedCreates,1);
 const row=state.rows.get(one.id);assert.equal(row.status,"paused");assert.equal(row.bot_token,"");assert.equal(row.charge_messages,false);assert.equal(row.drip_enabled,false);assert.equal(row.voice_enabled,false);
 assert.equal((await api.resolveConnectionCreator(one.id)).id,one.id);
 assert((await api.listConnectionCreators()).some(r=>r.id===one.id));
 const n=state.calls.length;
 assert.equal((await api.createConnectionCreator(ctx,{name:"X",handle:"https://onlyfans.com/x"})).status,400);
 assert.equal(state.calls.length,n);
 state.gate=new Response({},401);assert.equal((await api.connectionAccess(true)).status,401);assert.equal(await api.resolveConnectionCreator(one.id),null);assert.equal((await api.listConnectionCreators()).length,0);assert.equal(state.calls.length,n);
 state.gate={actor:"reader",canManage:false,auth:{}};assert.equal((await api.connectionAccess(true)).status,403);assert.equal(state.calls.length,n);
 state.gate=null;state.identity=null;
 const twin=await api.connectionAccess(true);assert(!(twin instanceof Response));
 assert((await api.createConnectionCreator(twin,{name:"Local operator",handle:"local_operator"})).id);assert.equal(state.localCreates,1);assert.equal(state.calls.at(-1),"local");
 state.identity={id:"selected-agency",creatorScope:"selected"};state.gate={actor:"manager",canManage:true,auth:{agencyGrant:{creatorIds:["assigned"]}}};
 const selected=await api.connectionAccess(true);const count=state.calls.length;
 assert.equal((await api.createConnectionCreator(selected,body)).status,403);assert.equal(state.calls.length,count);
 state.identity=identity();state.authed=false;state.gate=new Response({},401);
 assert.equal((await api.connectionAccess(true)).status,401);assert.equal(await api.resolveConnectionCreator(one.id),null);
 console.log("Creator save regression passed: owner save, retry, resolve, list, paused defaults, invalid input, unauthenticated/read-only/selected-agency refusal, retained local routing.");
})().catch(e=>{console.error(e);process.exitCode=1});
