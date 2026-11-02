import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { mergeChannelCreators, type ChannelRoster } from "../lib/channel-workspace/model";
import { workspaceChannel, telegramWorkspaceHref } from "../lib/channel-nav";
import { authorizeRead, readAccounts } from "../lib/onlyfans/reads";
const roster: ChannelRoster = {
  schemaVersion: "channel-roster.v1",
  telegram: {status:"ready",error:null,items:[{id:"shared",name:"Same name",status:"active",handle:null,color:"blue"},{id:"tg-only",name:"Same name",status:"paused",handle:null,color:"blue"}]},
  onlyfans: {status:"ready",error:null,items:[{id:"of1",creatorId:"shared",creatorName:"Provider display name",handle:"one",health:"connected"},{id:"of2",creatorId:"shared",creatorName:"Provider display name",handle:"two",health:"connected"},{id:"of3",creatorId:"of-only",creatorName:"Same name",handle:"three",health:"connected"}]},
};
assert.equal(mergeChannelCreators(roster).length,3,"Deduplicate canonical identity, never equal display names");
assert.equal(mergeChannelCreators(roster).find(item=>item.id==="shared")?.onlyfans.length,2);
assert.equal(mergeChannelCreators({...roster,onlyfans:{status:"unavailable",items:[],error:"Unavailable"}}).length,2);
for(const path of ["/users","/media","/flows","/business"]) {
  assert.equal(workspaceChannel(path,null,true),"telegram");
  assert.equal(workspaceChannel(path,"telegram",false),"all","Partner context is unchanged");
}
assert.equal(workspaceChannel("/dashboard",null,true),"all");
assert.equal(workspaceChannel("/dashboard","telegram",true),"telegram");
assert.equal(workspaceChannel("/onlyfans/accounts","telegram",true),"onlyfans");
assert.equal(workspaceChannel("/settings","telegram",true),"all","Arbitrary query strings do not relabel unrelated pages");
assert.equal(telegramWorkspaceHref("/clones/shared?tab=identity"),"/clones/shared?tab=identity&workspace=telegram");

// Exercise the actual server aggregation with the real read authorization and
// native read service. Only the database transport and backend are synthetic.
let databaseCalls=0,backendCalls=0,failDatabase=false;
const selections:string[]=[];
const query={select(value:string){selections.push(value);return this;},not(..._args:unknown[]){return this;},neq(..._args:unknown[]){return this;},order(){databaseCalls++;return Promise.resolve(failDatabase?{error:{code:"offline"},data:null}:{error:null,data:roster.telegram.items.map(item=>({id:item.id,name:item.name,status:item.status,business_username:item.handle}))});}};
const nativeRequire=createRequire(import.meta.url);
const imports: Record<string,unknown> = {
  "server-only":{}, "next/server":nativeRequire("next/server"),
  "@/lib/supabase":{supabaseAdmin:{from(name:string){assert.equal(name,"clones");return query;}}},
  "@/lib/query-cache":{getFleetClones:async()=>roster.telegram.items},
  "@/lib/onlyfans/route":{requireOnlyFansRead:()=>{throw Error("Unexpected session creation")}},
  "@/lib/onlyfans/reads":{authorizeRead,readAccounts},
};
const source=ts.transpileModule(readFileSync("lib/channel-workspace/roster.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const module={exports:{} as Record<string,any>};
new Function("require","module","exports",source)((name:string)=>{assert.ok(Object.hasOwn(imports,name),name);return imports[name]},module,module.exports);
const read=module.exports.readChannelRoster;
const context={auth:{operatorSession:true,agency:false,viewAs:false},backend:{listAccounts:async()=>{backendCalls++;return {ok:true,data:roster.onlyfans.items.map(account=>({accountId:account.id,binding:{creatorId:account.creatorId,creatorName:account.creatorName,handle:account.handle},health:account.health}))}}}};
async function main(){
  const telegram=await read(context,"telegram");assert.equal(telegram.telegram.items.length,2);assert.equal(telegram.onlyfans.status,"not_requested");assert.equal(backendCalls,0);
  const before=databaseCalls;const onlyfans=await read(context,"onlyfans");assert.equal(onlyfans.onlyfans.items.length,3);assert.equal(onlyfans.telegram.status,"not_requested");assert.equal(databaseCalls,before);
  const all=await read(context,"all");assert.equal(mergeChannelCreators(all).length,3);
  assert.ok(selections.every(value=>!value.includes("token")),"Credentials are never selected into the roster projection");
  failDatabase=true;const partial=await read(context,"all");assert.equal(partial.telegram.status,"unavailable");assert.equal(partial.onlyfans.items.length,3);
  const counts=[databaseCalls,backendCalls];await read({...context,auth:{operatorSession:false,agency:false,viewAs:false}},"all");assert.deepEqual([databaseCalls,backendCalls],counts,"Unauthorized callers reach neither source");
  console.log("PASS: channel memberships, canonical identity union, partial failures, source isolation, credential projection and verified operator read boundary.");
}
main().catch(error=>{console.error(error);process.exitCode=1});
