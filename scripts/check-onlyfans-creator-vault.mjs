import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {build} from "esbuild";
import {renderToStaticMarkup} from "react-dom/server";
const require=createRequire(import.meta.url);
const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222";
const compiled=await build({
 stdin:{contents:`export {loadCreatorVault} from "./components/onlyfans-preview/CreatorVault";export {state} from "vault-test-state";export {NextResponse} from "next/server";`,resolveDir:process.cwd(),loader:"tsx"},
 bundle:true,platform:"node",format:"cjs",jsx:"automatic",write:false,external:["react","react/jsx-runtime"],
 plugins:[{name:"isolated-auth-and-vault",setup(ctx){
  ctx.onResolve({filter:/^(vault-test-state|next\/server|@\/lib\/onlyfans\/route)$|VaultManager$|OnlyFansStudio\.module\.css$/},args=>({path:args.path,namespace:"vault-fixture"}));
  ctx.onLoad({filter:/.*/,namespace:"vault-fixture"},args=>{
   let contents;
   if(args.path==="vault-test-state")contents="export const state={ctx:null,authCalls:[]};";
   else if(args.path==="next/server")contents="export class NextResponse {}";
   else if(args.path.endsWith("onlyfans/route"))contents=`import {state} from "vault-test-state";export function requestId(id){return typeof id==="string"&&/^[a-zA-Z0-9_-]+$/.test(id)?id:null;}export async function requireOnlyFansRead(options){state.authCalls.push(options);return state.ctx;}`;
   else if(args.path.endsWith(".css"))contents="export default {platform:'platform',embedded:'embedded'};";
   else contents='export default function VaultManager(props){return <div data-vault-account={props.accountId} data-read-only={String(props.readOnly)}/>;}';
   return {contents,loader:"tsx"};
  });
 }}]
});
const mod={exports:{}};new Function("require","module","exports",compiled.outputFiles[0].text)(require,mod,mod.exports);
const {loadCreatorVault,state,NextResponse}=mod.exports;
let requests=[];
const account=(id,creatorId)=>({accountId:id,binding:{creatorId,handle:id}});
function session(rows,{manage=true,ok=true}={}){
 requests=[];state.authCalls=[];state.ctx={canManage:manage,backend:{async listAccounts(scope){requests.push(scope);return ok?{ok:true,data:rows}:{ok:false,error:"unavailable"};}}};
}
session([account("account-a",a)]);
let html=renderToStaticMarkup(await loadCreatorVault(a));
assert.deepEqual(requests,[{creatorId:a}]);assert.deepEqual(state.authCalls,[{agency:true}]);
assert.match(html,/data-vault-account="account-a"/);assert.match(html,/data-read-only="false"/);
session([account("account-b",b)]);
html=renderToStaticMarkup(await loadCreatorVault(a));assert.match(html,/could not be verified/);assert.doesNotMatch(html,/data-vault-account/);
session([account("account-a",a),account("account-b",b)]);
html=renderToStaticMarkup(await loadCreatorVault(a));assert.doesNotMatch(html,/data-vault-account/);
session([account("account-a",a)],{manage:false});
html=renderToStaticMarkup(await loadCreatorVault(a));assert.match(html,/data-read-only="true"/);
session([]);assert.equal(await loadCreatorVault(a),null);
session([],{ok:false});html=renderToStaticMarkup(await loadCreatorVault(a));assert.match(html,/could not be loaded/);
state.ctx=new NextResponse();assert.equal(await loadCreatorVault(a),null);
state.authCalls=[];assert.equal(await loadCreatorVault("../other"),null);assert.deepEqual(state.authCalls,[]);
console.log("PASS creator OnlyFans media: exact creator scope, no cross-creator fallback, read-only permissions, missing binding, failed reads and denied sessions.");
